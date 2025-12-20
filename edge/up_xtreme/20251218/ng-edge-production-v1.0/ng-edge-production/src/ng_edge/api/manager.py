"""
NG Edge API - Zone, Topology, and Sensor Management

Provides REST API for:
- Zone management (CRUD)
- Entry point management
- Sensor management and simulation
- Pipeline control and monitoring
- Drill execution
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import asyncio
import json
import threading
import time

from ..domain.enums import (
    SignalType,
    ZoneType,
    LocationType,
    HouseMode,
    NightSubMode,
    AlarmState,
    CapabilityTier,
)
from ..domain.models import Zone, EntryPoint, Topology, Signal
from ..services.signal_pipeline import SignalPipeline, DebounceConfig, ProcessedSignal
from ..services.alarm_sm import AlarmSMConfig
from ..services.drill_runner import DrillRunner, SensorSimulator, SensorBinding


# =============================================================================
# Entry Delay Timer
# =============================================================================

class EntryDelayTimer:
    """Background timer to trigger entry delay expiration."""
    
    def __init__(self):
        self._timer_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._callback: Optional[callable] = None
        self._delay_sec: float = 0
        self._started_at: Optional[float] = None
    
    def start(self, delay_sec: float, callback: callable) -> None:
        """Start the entry delay timer."""
        self.cancel()
        
        self._delay_sec = delay_sec
        self._callback = callback
        self._started_at = time.time()
        self._stop_event.clear()
        
        self._timer_thread = threading.Thread(target=self._run, daemon=True)
        self._timer_thread.start()
    
    def _run(self) -> None:
        """Timer thread function."""
        # Wait for delay or stop event
        if self._stop_event.wait(timeout=self._delay_sec):
            return  # Cancelled
        
        # Timer expired, call callback
        if self._callback:
            self._callback()
    
    def cancel(self) -> None:
        """Cancel the timer."""
        self._stop_event.set()
        # Don't join if called from the timer thread itself
        if (
            self._timer_thread and 
            self._timer_thread.is_alive() and
            self._timer_thread != threading.current_thread()
        ):
            self._timer_thread.join(timeout=0.5)
        self._timer_thread = None
        self._callback = None
        self._started_at = None
    
    def get_remaining(self) -> float:
        """Get remaining seconds."""
        if self._started_at is None:
            return 0
        elapsed = time.time() - self._started_at
        remaining = self._delay_sec - elapsed
        return max(0, remaining)


# =============================================================================
# Pydantic Models
# =============================================================================

class ZoneCreate(BaseModel):
    zone_id: str
    name: str
    zone_type: str  # ENTRY_EXIT, PERIMETER, etc.
    location_type: str = "indoor"
    entry_point_ids: list[str] = []
    adjacent_zone_ids: list[str] = []
    is_bypass_home: bool = False
    is_bypass_night_occupied: bool = False
    capability_tier: str = "E"


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    location_type: Optional[str] = None
    entry_point_ids: Optional[list[str]] = None
    is_bypass_home: Optional[bool] = None
    is_bypass_night_occupied: Optional[bool] = None


class EntryPointCreate(BaseModel):
    entry_point_id: str
    name: str
    zone_id: str
    entry_delay_away_sec: int = 30
    entry_delay_night_sec: int = 15
    entry_delay_home_sec: int = 30
    is_primary_entry: bool = False
    sensor_ids: list[str] = []


class SensorCreate(BaseModel):
    sensor_id: str
    sensor_type: str  # door_contact, motion_pir, camera_ai, etc.
    zone_id: str
    entry_point_id: Optional[str] = None
    name: Optional[str] = None


class SensorTrigger(BaseModel):
    sensor_id: str
    signal_type: str
    confidence: float = 1.0
    from_inside: Optional[bool] = None  # None = 自动推断, True = 从里面, False = 从外面


class PinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


class PinSetRequest(BaseModel):
    old_pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")
    new_pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


class ModeChangeWithPinRequest(BaseModel):
    mode: str  # disarmed, home, away, night
    night_sub_mode: Optional[str] = None  # occupied, perimeter
    user_mode: Optional[str] = None
    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


# =============================================================================
# Direction Inference (门磁方向推断)
# =============================================================================

class DirectionInferencer:
    """
    根据最近的 Camera/PIR 信号推断门开启方向。
    
    逻辑：
    1. 门开前，如果外部摄像头检测到人 → 从外面开门
    2. 门开前，如果室内 PIR 检测到移动 → 从里面开门
    3. 如果没有这两个信号（孤立开门）→ 保险起见算外部开门
    """
    
    def __init__(self, lookback_seconds: float = 10.0):
        self.lookback_seconds = lookback_seconds
        self.recent_signals: list[dict] = []  # {timestamp, zone_type, signal_type, sensor_type}
        self.max_history = 100
    
    def record_signal(
        self,
        timestamp: datetime,
        zone_type: str,
        signal_type: str,
        sensor_type: str,
    ):
        """记录信号用于方向推断"""
        self.recent_signals.append({
            "timestamp": timestamp,
            "zone_type": zone_type,
            "signal_type": signal_type,
            "sensor_type": sensor_type,
        })
        # 保持历史记录在限制内
        if len(self.recent_signals) > self.max_history:
            self.recent_signals = self.recent_signals[-self.max_history:]
    
    def infer_direction(self, door_timestamp: datetime) -> tuple[bool, str]:
        """
        推断门开启方向。
        
        Returns:
            (from_inside, reason): 
            - from_inside=True 表示从里面开门
            - from_inside=False 表示从外面开门
            - reason 是推断原因
        """
        cutoff = door_timestamp - timedelta(seconds=self.lookback_seconds)
        
        recent_exterior_person = False
        recent_interior_motion = False
        
        for sig in reversed(self.recent_signals):
            if sig["timestamp"] < cutoff:
                break
            
            # 外部摄像头检测到人
            if (sig["zone_type"] == "exterior" and 
                sig["signal_type"] == "person_detected"):
                recent_exterior_person = True
            
            # 室内 PIR 检测到移动
            if (sig["zone_type"] == "interior" and 
                sig["signal_type"] == "motion_active"):
                recent_interior_motion = True
        
        # 推断逻辑
        if recent_interior_motion and not recent_exterior_person:
            return True, "室内PIR检测到移动 → 从里面开门"
        elif recent_exterior_person and not recent_interior_motion:
            return False, "外部摄像头检测到人 → 从外面开门"
        elif recent_exterior_person and recent_interior_motion:
            # 两边都有信号，优先考虑外部（更危险）
            return False, "内外都有信号 → 保险起见算外部开门"
        else:
            # 孤立开门，保险起见算外部
            return False, "孤立开门(无前置信号) → 保险起见算外部开门"
    
    def clear(self):
        """清空历史"""
        self.recent_signals.clear()


class ModeChange(BaseModel):
    mode: str  # away, home, night, disarmed
    night_sub_mode: Optional[str] = None  # occupied, perimeter
    user_mode: Optional[str] = None  # alert, quiet


class DrillRunRequest(BaseModel):
    case_ids: Optional[list[str]] = None
    tags: Optional[list[str]] = None


# =============================================================================
# Application State
# =============================================================================

class AppState:
    """Global application state."""
    
    def __init__(self):
        self.zones: dict[str, Zone] = {}
        self.entry_points: dict[str, EntryPoint] = {}
        self.sensors: dict[str, SensorBinding] = {}
        self.simulator = SensorSimulator()
        self.pipeline: Optional[SignalPipeline] = None
        self.drill_runner: Optional[DrillRunner] = None
        self.event_log: list[dict] = []
        self.current_mode = HouseMode.DISARMED
        self.current_night_sub: Optional[NightSubMode] = None
        self.current_user_mode: str = "quiet"  # alert 或 quiet
        self.direction_inferencer = DirectionInferencer()
        
        # 每个入口点的独立计时器
        self.entry_timers: dict[str, EntryDelayTimer] = {}
        
        # PIN 码管理
        self.user_pin: str = "1234"  # 默认 PIN
        self.pin_fail_count: int = 0
        self.pin_lockout_until: Optional[datetime] = None
        self.max_pin_attempts: int = 5
        self.lockout_duration_sec: int = 300  # 5分钟
        
        # 状态机 v5 - SecurityCoordinator
        from ..services.state_machine_v5 import (
            SecurityCoordinator, 
            HouseMode as SMHouseMode, 
            UserMode as SMUserMode,
        )
        self.security_coordinator = SecurityCoordinator(
            house_mode=SMHouseMode.DISARMED,
            user_mode=SMUserMode.QUIET,
            entry_delay_sec=30,
            on_global_state_change=self._on_state_change,
        )
        
        # Ring Keypad 集成
        self.ring_keypad = None
        self.ring_keypad_enabled = False
        self._init_ring_keypad()
        
        # Ring Keypad PIN 缓存（输入 PIN 后 30 秒内有效）
        self.cached_pin = None
        self.pin_timestamp = 0
        self.PIN_CACHE_TIMEOUT = 30  # 秒
    
    def get_entry_timer(self, entry_point_id: str) -> EntryDelayTimer:
        """获取或创建入口点的计时器"""
        if entry_point_id not in self.entry_timers:
            self.entry_timers[entry_point_id] = EntryDelayTimer()
        return self.entry_timers[entry_point_id]
    
    def _on_state_change(self, entry_point_id: str, result):
        """状态变化回调"""
        print(f"[STATE CHANGE] {entry_point_id}: {result.from_state.value} -> {result.to_state.value}")
        if result.message:
            print(f"  Message: {result.message}")
        
        self.event_log.append({
            "type": "state_change",
            "entry_point_id": entry_point_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "from_state": result.from_state.value,
            "to_state": result.to_state.value,
            "message": result.message,
        })
        
        # 同步状态到 Ring Keypad
        if self.ring_keypad_enabled and self.ring_keypad:
            asyncio.create_task(self._sync_keypad_state(result.to_state.value))
        
        # 如果进入 PENDING，启动该入口点的计时器
        if result.to_state.value == "pending":
            # 获取入口点配置的延时
            ep_config = self.entry_points.get(entry_point_id)
            delay_sec = ep_config.entry_delay_away_sec if ep_config else 30
            
            print(f"[PENDING] Starting {delay_sec}s timer for {entry_point_id}")
            
            timer = self.get_entry_timer(entry_point_id)
            timer.start(delay_sec, lambda ep=entry_point_id: self._on_entry_delay_expired_v5(ep))
    
    def _on_entry_delay_expired_v5(self, entry_point_id: str):
        """入口延迟超时"""
        print(f"[TIMER EXPIRED] {entry_point_id}")
        
        ep_sm = self.security_coordinator.get_entry_point(entry_point_id)
        if ep_sm:
            from ..services.state_machine_v5 import AlarmState as SMAlarmState
            print(f"  Current state: {ep_sm.state.value}")
            if ep_sm.state == SMAlarmState.PENDING:
                result = ep_sm.trigger_entry_delay_expired()
                print(f"  Triggered! New state: {result.to_state.value}")
                self.event_log.append({
                    "type": "entry_delay_expired",
                    "entry_point_id": entry_point_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "to_state": result.to_state.value,
                })
    
    def update_modes(self, house_mode: HouseMode, night_sub: Optional[NightSubMode], user_mode: str):
        """更新模式并同步到 SecurityCoordinator"""
        from ..services.state_machine_v5 import HouseMode as SMHouseMode, UserMode as SMUserMode
        
        self.current_mode = house_mode
        self.current_night_sub = night_sub
        self.current_user_mode = user_mode
        
        # 映射到 v5 枚举
        sm_mode_map = {
            HouseMode.DISARMED: SMHouseMode.DISARMED,
            HouseMode.HOME: SMHouseMode.HOME,
            HouseMode.AWAY: SMHouseMode.AWAY,
        }
        
        if house_mode == HouseMode.NIGHT:
            if night_sub == NightSubMode.NIGHT_PERIMETER:
                sm_house = SMHouseMode.NIGHT_PERIMETER
            else:
                sm_house = SMHouseMode.NIGHT_OCCUPIED
        else:
            sm_house = sm_mode_map.get(house_mode, SMHouseMode.DISARMED)
        
        sm_user = SMUserMode.ALERT if user_mode == "alert" else SMUserMode.QUIET
        
        # 先注册所有 entry points（带延时配置）
        for ep_id, ep in self.entry_points.items():
            self.security_coordinator.register_entry_point(
                ep_id, 
                ep.name,
                entry_delay_sec=ep.entry_delay_away_sec
            )
        
        # 然后设置模式（会同步到所有入口点）
        self.security_coordinator.set_modes(sm_house, sm_user)
        
        print(f"[MODE] Set to {sm_house.value} / {sm_user.value}")
    
    def build_topology(self) -> Topology:
        """Build topology from current state."""
        return Topology(
            zones=dict(self.zones),
            entry_points=dict(self.entry_points),
        )
    
    def _on_entry_delay_expired(self) -> None:
        """Callback when entry delay timer expires."""
        if self.pipeline and self.pipeline.alarm_sm.state == AlarmState.PENDING:
            # Trigger alarm
            self.pipeline.alarm_sm.trigger_entry_delay_expired()
    
    def _init_ring_keypad(self):
        """初始化 Ring Keypad（如果可用）"""
        try:
            # 尝试导入配置
            import sys
            import os
            
            # 添加 /opt/ng-edge 到路径
            if '/opt/ng-edge' not in sys.path:
                sys.path.insert(0, '/opt/ng-edge')
            
            # 导入配置
            try:
                from ring_config import ZWAVE_WS_URL, RING_NODE_ID
            except ImportError as e:
                print(f"[KEYPAD] ring_config.py 未找到: {e}")
                print("[KEYPAD] Ring Keypad 功能禁用")
                return
            
            print(f"[KEYPAD] 配置已加载:")
            print(f"[KEYPAD]   WebSocket: {ZWAVE_WS_URL}")
            print(f"[KEYPAD]   Node ID: {RING_NODE_ID}")
            
            # 导入 Ring Keypad
            try:
                from ..hardware.ring_keypad_zwave import RingKeypadZWave, KeypadState, KeypadEvent
                print("[KEYPAD] Ring Keypad 模块导入成功")
            except ImportError as e:
                print(f"[KEYPAD] Ring Keypad 模块导入失败: {e}")
                return
            
            # 创建 Keypad 客户端
            self.ring_keypad = RingKeypadZWave(
                ws_url=ZWAVE_WS_URL,
                node_id=RING_NODE_ID,
            )
            
            # 设置事件处理器
            self.ring_keypad.on_keypad_event = self._handle_keypad_event
            
            print(f"[KEYPAD] Ring Keypad 客户端已创建")
            print(f"[KEYPAD] 将在事件循环就绪后连接...")
        
        except Exception as e:
            print(f"[KEYPAD] Ring Keypad 初始化失败: {e}")
            import traceback
            traceback.print_exc()
            self.ring_keypad = None
    
    async def connect_ring_keypad(self):
        """连接 Ring Keypad（在事件循环中调用）"""
        if not self.ring_keypad:
            print("[KEYPAD] Keypad 客户端未初始化")
            return
        
        try:
            print("[KEYPAD] 开始连接...")
            connected = await self.ring_keypad.connect()
            if connected:
                self.ring_keypad_enabled = True
                print("[KEYPAD] ✅ Ring Keypad 连接成功")
                
                # 设置初始状态（撤防）
                from ..hardware.ring_keypad_zwave import KeypadState
                await self.ring_keypad.set_state(KeypadState.DISARMED)
                print("[KEYPAD] 初始状态已设置: DISARMED (绿灯)")
            else:
                print("[KEYPAD] ❌ Ring Keypad 连接失败")
        except Exception as e:
            print(f"[KEYPAD] 连接错误: {e}")
            import traceback
            traceback.print_exc()
    
    async def _connect_ring_keypad(self):
        """旧的连接方法（保持兼容性）"""
        await self.connect_ring_keypad()
    
    def _handle_keypad_event(self, event):
        """处理 Keypad 事件"""
        from ..hardware.ring_keypad_zwave import KeypadEvent
        
        print(f"[KEYPAD] 事件: {event.event_type.value}")
        
        try:
            # PIN 输入 - 缓存 PIN
            if event.event_type == KeypadEvent.PIN_ENTERED:
                import time
                self.cached_pin = event.pin
                self.pin_timestamp = time.time()
                print(f"[KEYPAD] PIN 已缓存: {event.pin} (有效期 {self.PIN_CACHE_TIMEOUT} 秒)")
                self._handle_keypad_pin_verify(event.pin)
            
            # DISARM 按钮 - 优先使用事件自带的 PIN，其次使用缓存
            elif event.event_type == KeypadEvent.DISARM_PRESSED:
                pin = event.pin  # 事件自带的 PIN（用户输入后直接按 DISARM）
                if not pin:
                    pin = self._get_cached_pin()  # 缓存的 PIN（用户按✓后再按 DISARM）
                
                if pin:
                    print(f"[KEYPAD] 使用 PIN: {pin}")
                self._handle_keypad_disarm(pin)
            
            # HOME 按钮
            elif event.event_type == KeypadEvent.HOME_PRESSED:
                pin = event.pin or self._get_cached_pin()
                if pin:
                    print(f"[KEYPAD] 使用 PIN: {pin}")
                self._handle_keypad_mode_change(HouseMode.HOME, pin)
            
            # AWAY 按钮
            elif event.event_type == KeypadEvent.AWAY_PRESSED:
                pin = event.pin or self._get_cached_pin()
                if pin:
                    print(f"[KEYPAD] 使用 PIN: {pin}")
                self._handle_keypad_mode_change(HouseMode.AWAY, pin)
            
            # Panic 按钮
            elif event.event_type == KeypadEvent.PANIC_PRESSED:
                self._handle_keypad_panic()
        
        except Exception as e:
            print(f"[KEYPAD] 事件处理错误: {e}")
    
    def _get_cached_pin(self) -> Optional[str]:
        """获取缓存的 PIN（如果还在有效期内）"""
        import time
        
        if not self.cached_pin:
            return None
        
        elapsed = time.time() - self.pin_timestamp
        
        if elapsed > self.PIN_CACHE_TIMEOUT:
            print(f"[KEYPAD] PIN 缓存已过期 ({elapsed:.1f} 秒)")
            self.cached_pin = None
            return None
        
        return self.cached_pin
    
    def _handle_keypad_disarm(self, pin: Optional[str]):
        """处理撤防按钮"""
        # 检查是否在 PENDING 状态（Entry Delay）
        status = self.security_coordinator.get_status()
        in_pending = status['global_state'] == 'pending'
        
        # 在 PENDING 状态必须提供 PIN
        if in_pending and not pin:
            print(f"[KEYPAD] ❌ Entry Delay 期间必须输入 PIN 才能撤防")
            if self.ring_keypad:
                asyncio.create_task(self.ring_keypad.play_error())
            return
        
        # 验证 PIN（如果有）
        if pin:
            success, message = self.verify_pin(pin)
            if not success:
                print(f"[KEYPAD] PIN 验证失败: {message}")
                if self.ring_keypad:
                    asyncio.create_task(self.ring_keypad.play_error())
                return
        
        # 切换到 DISARMED
        self.update_modes(HouseMode.DISARMED, None, "quiet")
        
        # 取消所有 entry delay 计时器
        for timer in self.entry_timers.values():
            timer.cancel()
        
        # 清除 PIN 缓存
        self.cached_pin = None
        
        # 反馈
        if self.ring_keypad:
            asyncio.create_task(self.ring_keypad.play_success())
            from ..hardware.ring_keypad_zwave import KeypadState
            asyncio.create_task(self.ring_keypad.set_state(KeypadState.DISARMED))
        
        print(f"[KEYPAD] 撤防成功")
    
    def _handle_keypad_mode_change(self, mode: HouseMode, pin: Optional[str]):
        """处理模式切换按钮"""
        # 验证 PIN（如果有）
        if pin:
            success, message = self.verify_pin(pin)
            if not success:
                print(f"[KEYPAD] PIN 验证失败: {message}")
                if self.ring_keypad:
                    asyncio.create_task(self.ring_keypad.play_error())
                return
        
        # 切换模式
        self.update_modes(mode, None, "quiet")
        
        # 反馈
        if self.ring_keypad:
            asyncio.create_task(self.ring_keypad.play_success())
            from ..hardware.ring_keypad_zwave import KeypadState
            
            if mode == HouseMode.HOME:
                asyncio.create_task(self.ring_keypad.set_state(KeypadState.ARMED_HOME))
            elif mode == HouseMode.AWAY:
                asyncio.create_task(self.ring_keypad.set_state(KeypadState.ARMED_AWAY))
        
        print(f"[KEYPAD] 模式切换: {mode.value}")
    
    def _handle_keypad_pin_verify(self, pin: Optional[str]):
        """处理 PIN 验证"""
        if not pin:
            return
        
        success, message = self.verify_pin(pin)
        
        if success:
            print(f"[KEYPAD] PIN 验证成功")
            if self.ring_keypad:
                asyncio.create_task(self.ring_keypad.play_success())
        else:
            print(f"[KEYPAD] PIN 验证失败: {message}")
            if self.ring_keypad:
                asyncio.create_task(self.ring_keypad.play_error())
    
    def _handle_keypad_panic(self):
        """处理 Panic 按钮"""
        print(f"[KEYPAD] 🚨 PANIC 按钮按下！")
        
        # 触发所有入口点进入 TRIGGERED
        for ep_id in self.entry_points.keys():
            ep_sm = self.security_coordinator.get_entry_point(ep_id)
            if ep_sm:
                # 强制触发
                from ..services.state_machine_v5 import AlarmState as SMAlarmState
                ep_sm.state = SMAlarmState.TRIGGERED
        
        # Keypad 反馈
        if self.ring_keypad:
            from ..hardware.ring_keypad_zwave import KeypadState
            asyncio.create_task(self.ring_keypad.set_state(KeypadState.TRIGGERED))
        
        self.event_log.append({
            "type": "panic_triggered",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    
    async def _sync_keypad_state(self, alarm_state: str):
        """同步报警状态到 Keypad"""
        if not self.ring_keypad:
            return
        
        try:
            from ..hardware.ring_keypad_zwave import KeypadState
            
            # 映射报警状态到 Keypad 状态
            if alarm_state == "quiet":
                # 根据当前模式设置 LED
                if self.current_mode == HouseMode.DISARMED:
                    await self.ring_keypad.set_state(KeypadState.DISARMED)
                elif self.current_mode == HouseMode.HOME:
                    await self.ring_keypad.set_state(KeypadState.ARMED_HOME)
                elif self.current_mode == HouseMode.AWAY:
                    await self.ring_keypad.set_state(KeypadState.ARMED_AWAY)
            
            elif alarm_state == "pending":
                # Entry Delay - 获取剩余时间
                # 找到第一个 PENDING 的入口点
                remaining = 0
                for ep_id in self.entry_points.keys():
                    timer = self.entry_timers.get(ep_id)
                    if timer:
                        remaining = max(remaining, timer.get_remaining())
                
                await self.ring_keypad.set_state(
                    KeypadState.ENTRY_DELAY,
                    countdown=int(remaining)
                )
            
            elif alarm_state == "pre":
                await self.ring_keypad.set_state(KeypadState.ARMING)
            
            elif alarm_state == "triggered":
                await self.ring_keypad.set_state(KeypadState.TRIGGERED)
        
        except Exception as e:
            print(f"[KEYPAD] 状态同步错误: {e}")
            result = self.pipeline.trigger_entry_delay_expired()
            if result and result.success:
                self.event_log.append({
                    "type": "entry_delay_expired",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "from_state": result.from_state.value,
                    "to_state": result.to_state.value,
                })
    
    def init_pipeline(self) -> None:
        """Initialize or reinitialize the pipeline."""
        topology = self.build_topology()
        
        alarm_config = AlarmSMConfig(
            entry_delay_away_sec=30,
            entry_delay_night_occupied_sec=15,
            entry_delay_night_perimeter_sec=0,
            entry_delay_home_sec=30,
        )
        
        def on_event_created(event):
            self.event_log.append({
                "type": "event_created",
                "event_id": event.event_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": event.event_type.value,
                "alarm_state": event.alarm_state.value,
            })
        
        def on_event_updated(event):
            self.event_log.append({
                "type": "event_updated",
                "event_id": event.event_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "alarm_state": event.alarm_state.value,
                "revision": event.revision,
            })
            
            # Cancel timer if no longer PENDING
            if event.alarm_state != AlarmState.PENDING:
                self.entry_delay_timer.cancel()
        
        def on_pending_started(entry_delay_sec: int):
            """Called by AlarmSM when entering PENDING state - start timer."""
            self.entry_delay_timer.start(entry_delay_sec, self._on_entry_delay_expired)
        
        self.pipeline = SignalPipeline(
            topology=topology,
            alarm_config=alarm_config,
            on_event_created=on_event_created,
            on_event_updated=on_event_updated,
            on_pending_started=on_pending_started,
        )
        self.pipeline.set_mode(self.current_mode, self.current_night_sub)
    
    def verify_pin(self, pin: str) -> tuple[bool, str]:
        """验证 PIN 码
        
        Returns:
            (success, message): 验证结果和消息
        """
        # 检查是否被锁定
        if self.pin_lockout_until:
            if datetime.now(timezone.utc) < self.pin_lockout_until:
                remaining = (self.pin_lockout_until - datetime.now(timezone.utc)).total_seconds()
                return False, f"PIN 输入已锁定，请 {int(remaining)} 秒后重试"
            else:
                # 解锁
                self.pin_lockout_until = None
                self.pin_fail_count = 0
        
        # 验证 PIN
        if pin == self.user_pin:
            self.pin_fail_count = 0
            return True, "PIN 验证成功"
        else:
            self.pin_fail_count += 1
            remaining_attempts = self.max_pin_attempts - self.pin_fail_count
            
            if self.pin_fail_count >= self.max_pin_attempts:
                # 触发锁定
                self.pin_lockout_until = datetime.now(timezone.utc) + timedelta(seconds=self.lockout_duration_sec)
                self.pin_fail_count = 0
                return False, f"PIN 错误次数过多，已锁定 {self.lockout_duration_sec // 60} 分钟"
            else:
                return False, f"PIN 错误，还有 {remaining_attempts} 次尝试机会"
    
    def set_pin(self, new_pin: str) -> bool:
        """设置新的 PIN 码"""
        if len(new_pin) < 4 or len(new_pin) > 8:
            return False
        if not new_pin.isdigit():
            return False
        self.user_pin = new_pin
        return True


# Global state instance
state = AppState()


# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="NG Edge Manager",
    description="Zone, Sensor, and Pipeline Management for NG Edge",
    version="7.4.2",
)


# =============================================================================
# Startup - Ring Keypad Connection
# =============================================================================

# 连接标志
_keypad_connected = False
_keypad_lock = None

async def ensure_keypad_connected():
    """确保 Ring Keypad 已连接（首次调用时）"""
    global _keypad_connected, _keypad_lock
    
    if _keypad_connected:
        return
    
    if _keypad_lock is None:
        import asyncio
        _keypad_lock = asyncio.Lock()
    
    async with _keypad_lock:
        if _keypad_connected:
            return
        
        print("[STARTUP] NG Edge Manager 首次请求，连接 Ring Keypad...")
        
        if state.ring_keypad:
            await state.connect_ring_keypad()
            _keypad_connected = True
        else:
            print("[STARTUP] Ring Keypad 未初始化")


# =============================================================================
# Startup Event
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    print("[STARTUP] NG Edge Manager 启动中...")
    
    # 连接 Ring Keypad
    if state.ring_keypad:
        print("[STARTUP] 连接 Ring Keypad...")
        await state.connect_ring_keypad()
    else:
        print("[STARTUP] Ring Keypad 未初始化（正常，如果没有配置）")


# =============================================================================
# Zone Endpoints
# =============================================================================

@app.get("/api/zones")
async def list_zones():
    """List all zones."""
    return {
        "zones": [
            {
                "zone_id": z.zone_id,
                "name": z.name,
                "zone_type": z.zone_type.value,
                "location_type": z.location_type.value,
                "entry_point_ids": z.entry_point_ids,
                "is_bypass_home": z.is_bypass_home,
                "is_bypass_night_occupied": z.is_bypass_night_occupied,
            }
            for z in state.zones.values()
        ]
    }


@app.post("/api/zones")
async def create_zone(zone: ZoneCreate):
    """Create a new zone."""
    if zone.zone_id in state.zones:
        raise HTTPException(400, f"Zone {zone.zone_id} already exists")
    
    zone_type_map = {
        "entry_exit": ZoneType.ENTRY_EXIT,
        "perimeter": ZoneType.PERIMETER,
        "interior_follower": ZoneType.INTERIOR_FOLLOWER,
        "interior_instant": ZoneType.INTERIOR_INSTANT,
        "exterior": ZoneType.EXTERIOR,
        "fire_24h": ZoneType.FIRE_24H,
        "co_24h": ZoneType.CO_24H,
    }
    
    location_type_map = {
        "indoor": LocationType.INDOOR,
        "outdoor": LocationType.OUTDOOR,
        "entry": LocationType.THRESHOLD,
    }
    
    tier_map = {
        "V": CapabilityTier.V,
        "E": CapabilityTier.E,
        "N": CapabilityTier.N,
    }
    
    new_zone = Zone(
        zone_id=zone.zone_id,
        name=zone.name,
        zone_type=zone_type_map.get(zone.zone_type.lower(), ZoneType.EXTERIOR),
        location_type=location_type_map.get(zone.location_type.lower(), LocationType.INDOOR),
        entry_point_ids=zone.entry_point_ids,
        adjacent_zone_ids=zone.adjacent_zone_ids,
        is_bypass_home=zone.is_bypass_home,
        is_bypass_night_occupied=zone.is_bypass_night_occupied,
        capability_tier=tier_map.get(zone.capability_tier, CapabilityTier.E),
    )
    
    state.zones[zone.zone_id] = new_zone
    state.init_pipeline()
    
    return {"status": "created", "zone_id": zone.zone_id}


@app.get("/api/zones/{zone_id}")
async def get_zone(zone_id: str):
    """Get a specific zone."""
    if zone_id not in state.zones:
        raise HTTPException(404, f"Zone {zone_id} not found")
    
    z = state.zones[zone_id]
    return {
        "zone_id": z.zone_id,
        "name": z.name,
        "zone_type": z.zone_type.value,
        "location_type": z.location_type.value,
        "entry_point_ids": z.entry_point_ids,
        "is_bypass_home": z.is_bypass_home,
        "is_bypass_night_occupied": z.is_bypass_night_occupied,
    }


@app.put("/api/zones/{zone_id}")
async def update_zone(zone_id: str, update: ZoneUpdate):
    """Update a zone."""
    if zone_id not in state.zones:
        raise HTTPException(404, f"Zone {zone_id} not found")
    
    z = state.zones[zone_id]
    
    if update.name is not None:
        z.name = update.name
    if update.entry_point_ids is not None:
        z.entry_point_ids = update.entry_point_ids
    if update.is_bypass_home is not None:
        z.is_bypass_home = update.is_bypass_home
    if update.is_bypass_night_occupied is not None:
        z.is_bypass_night_occupied = update.is_bypass_night_occupied
    
    state.init_pipeline()
    return {"status": "updated", "zone_id": zone_id}


@app.delete("/api/zones/{zone_id}")
async def delete_zone(zone_id: str):
    """Delete a zone."""
    if zone_id not in state.zones:
        raise HTTPException(404, f"Zone {zone_id} not found")
    
    del state.zones[zone_id]
    state.init_pipeline()
    return {"status": "deleted", "zone_id": zone_id}


# =============================================================================
# Entry Point Endpoints
# =============================================================================

@app.get("/api/entry-points")
async def list_entry_points():
    """List all entry points."""
    return {
        "entry_points": [
            {
                "entry_point_id": ep.entry_point_id,
                "name": ep.name,
                "zone_id": ep.zone_id,
                "entry_delay_away_sec": ep.entry_delay_away_sec,
                "entry_delay_night_sec": ep.entry_delay_night_sec,
                "is_primary_entry": ep.is_primary_entry,
            }
            for ep in state.entry_points.values()
        ]
    }


@app.post("/api/entry-points")
async def create_entry_point(ep: EntryPointCreate):
    """Create a new entry point."""
    if ep.entry_point_id in state.entry_points:
        raise HTTPException(400, f"Entry point {ep.entry_point_id} already exists")
    
    new_ep = EntryPoint(
        entry_point_id=ep.entry_point_id,
        name=ep.name,
        zone_id=ep.zone_id,
        entry_delay_away_sec=ep.entry_delay_away_sec,
        entry_delay_night_sec=ep.entry_delay_night_sec,
        entry_delay_home_sec=ep.entry_delay_home_sec,
        is_primary_entry=ep.is_primary_entry,
        sensor_ids=ep.sensor_ids,
    )
    
    state.entry_points[ep.entry_point_id] = new_ep
    state.init_pipeline()
    
    return {"status": "created", "entry_point_id": ep.entry_point_id}


@app.delete("/api/entry-points/{ep_id}")
async def delete_entry_point(ep_id: str):
    """Delete an entry point."""
    if ep_id not in state.entry_points:
        raise HTTPException(404, f"Entry point {ep_id} not found")
    
    del state.entry_points[ep_id]
    state.init_pipeline()
    return {"status": "deleted", "entry_point_id": ep_id}


# =============================================================================
# Sensor Endpoints
# =============================================================================

@app.get("/api/sensors")
async def list_sensors():
    """List all sensors."""
    return {
        "sensors": [
            {
                "sensor_id": s.sensor_id,
                "sensor_type": s.sensor_type,
                "zone_id": s.zone_id,
                "zone_type": s.zone_type.value if s.zone_type else None,
                "entry_point_id": s.entry_point_id,
            }
            for s in state.sensors.values()
        ]
    }


@app.post("/api/sensors")
async def create_sensor(sensor: SensorCreate):
    """Create a new sensor."""
    if sensor.sensor_id in state.sensors:
        raise HTTPException(400, f"Sensor {sensor.sensor_id} already exists")
    
    # Get zone info
    zone = state.zones.get(sensor.zone_id)
    zone_type = zone.zone_type if zone else ZoneType.EXTERIOR
    location_type = zone.location_type if zone else LocationType.INDOOR
    
    print(f"CREATE_SENSOR: {sensor.sensor_id}")
    print(f"  zone_id={sensor.zone_id}, zone_found={zone is not None}")
    print(f"  entry_point_id={sensor.entry_point_id}")  # 调试
    if zone:
        print(f"  zone_type={zone.zone_type.value}, location_type={zone.location_type.value}")
    
    binding = SensorBinding(
        sensor_id=sensor.sensor_id,
        sensor_type=sensor.sensor_type,
        zone_id=sensor.zone_id,
        zone_type=zone_type,
        location_type=location_type,
        entry_point_id=sensor.entry_point_id,
    )
    
    state.sensors[sensor.sensor_id] = binding
    state.simulator.add_sensor(binding)
    
    # Reinitialize pipeline with updated topology
    state.init_pipeline()
    
    return {
        "status": "created", 
        "sensor_id": sensor.sensor_id, 
        "zone_type": zone_type.value,
        "entry_point_id": sensor.entry_point_id,  # 返回确认
    }


@app.delete("/api/sensors/{sensor_id}")
async def delete_sensor(sensor_id: str):
    """Delete a sensor."""
    if sensor_id not in state.sensors:
        raise HTTPException(404, f"Sensor {sensor_id} not found")
    
    del state.sensors[sensor_id]
    if sensor_id in state.simulator.sensors:
        del state.simulator.sensors[sensor_id]
    
    return {"status": "deleted", "sensor_id": sensor_id}


class SensorUpdate(BaseModel):
    """Sensor update model."""
    entry_point_id: Optional[str] = None


@app.patch("/api/sensors/{sensor_id}")
async def update_sensor(sensor_id: str, update: SensorUpdate):
    """Update sensor's entry point binding."""
    if sensor_id not in state.sensors:
        raise HTTPException(404, f"Sensor {sensor_id} not found")
    
    binding = state.sensors[sensor_id]
    old_ep = binding.entry_point_id
    binding.entry_point_id = update.entry_point_id
    
    print(f"UPDATE_SENSOR: {sensor_id}")
    print(f"  entry_point_id: {old_ep} -> {update.entry_point_id}")
    
    return {
        "status": "updated", 
        "sensor_id": sensor_id,
        "old_entry_point_id": old_ep,
        "entry_point_id": update.entry_point_id,
    }


@app.post("/api/sensors/trigger")
async def trigger_sensor(trigger: SensorTrigger):
    """Trigger a sensor (simulate signal)."""
    if trigger.sensor_id not in state.sensors:
        raise HTTPException(404, f"Sensor {trigger.sensor_id} not found")
    
    binding = state.sensors[trigger.sensor_id]
    now = datetime.now(timezone.utc)
    
    # Map signal type
    signal_type_map = {
        "person_detected": SignalType.PERSON_DETECTED,
        "vehicle_detected": SignalType.VEHICLE_DETECTED,
        "door_open": SignalType.DOOR_OPEN,
        "door_close": SignalType.DOOR_CLOSE,
        "window_open": SignalType.WINDOW_OPEN,
        "motion_active": SignalType.MOTION_ACTIVE,
        "motion_inactive": SignalType.MOTION_ACTIVE,
        "glass_break": SignalType.GLASS_BREAK,
        "forced_entry": SignalType.FORCED_ENTRY,
        "smoke_detected": SignalType.SMOKE_DETECTED,
        "co_detected": SignalType.CO_DETECTED,
        "package_delivered": SignalType.PACKAGE_DELIVERED,
    }
    
    signal_type = signal_type_map.get(trigger.signal_type.lower())
    if not signal_type:
        raise HTTPException(400, f"Unknown signal type: {trigger.signal_type}")
    
    # 记录信号用于方向推断
    zone_type_str = binding.zone_type.value if binding.zone_type else "unknown"
    state.direction_inferencer.record_signal(
        timestamp=now,
        zone_type=zone_type_str,
        signal_type=trigger.signal_type.lower(),
        sensor_type=binding.sensor_type,
    )
    
    # 门磁方向推断
    from_inside = False
    direction_reason = ""
    if signal_type == SignalType.DOOR_OPEN:
        if trigger.from_inside is not None:
            from_inside = trigger.from_inside
            direction_reason = "用户手动指定"
        else:
            from_inside, direction_reason = state.direction_inferencer.infer_direction(now)
    
    # ========== SecurityCoordinator v5 处理 ==========
    from ..services.state_machine_v5 import (
        Signal as SMSignal,
        ZoneType as SMZoneType,
        SignalType as SMSignalType,
    )
    
    # 获取入口点 ID 和配置
    entry_point_id = binding.entry_point_id or "_global"
    
    # 确保入口点已注册（带延时配置）
    if entry_point_id != "_global":
        ep_config = state.entry_points.get(entry_point_id)
        if ep_config:
            state.security_coordinator.register_entry_point(
                entry_point_id,
                ep_config.name,
                entry_delay_sec=ep_config.entry_delay_away_sec
            )
        else:
            state.security_coordinator.register_entry_point(entry_point_id, entry_point_id)
    
    # 映射 zone_type
    sm_zone_map = {
        "exterior": SMZoneType.EXTERIOR,
        "entry_exit": SMZoneType.ENTRY_EXIT,
        "interior": SMZoneType.INTERIOR,
        "perimeter": SMZoneType.PERIMETER,
        "interior_follower": SMZoneType.INTERIOR,
        "interior_instant": SMZoneType.INTERIOR,
    }
    
    # 映射 signal_type
    sm_signal_map = {
        SignalType.PERSON_DETECTED: SMSignalType.PERSON_DETECTED,
        SignalType.VEHICLE_DETECTED: SMSignalType.VEHICLE_DETECTED,
        SignalType.DOOR_OPEN: SMSignalType.DOOR_OPEN,
        SignalType.DOOR_CLOSE: SMSignalType.DOOR_CLOSE,
        SignalType.MOTION_ACTIVE: SMSignalType.MOTION_ACTIVE,
        SignalType.GLASS_BREAK: SMSignalType.GLASS_BREAK,
    }
    
    sm_zone = sm_zone_map.get(zone_type_str, SMZoneType.EXTERIOR)
    sm_signal = sm_signal_map.get(signal_type)
    
    result = None
    if sm_signal:
        sig = SMSignal(
            entry_point_id=entry_point_id,
            zone_type=sm_zone,
            signal_type=sm_signal,
            from_inside=from_inside,
        )
        result = state.security_coordinator.process(sig)
    
    # 获取状态
    status = state.security_coordinator.get_status()
    
    # 记录信号事件到日志
    signal_event = {
        "type": "signal",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sensor_id": trigger.sensor_id,
        "signal_type": trigger.signal_type,
        "entry_point_id": entry_point_id,
        "zone_type": zone_type_str,
        "house_mode": status['house_mode'],
        "user_mode": status['user_mode'],
    }
    if signal_type == SignalType.DOOR_OPEN:
        signal_event["from_inside"] = from_inside
        signal_event["direction_reason"] = direction_reason
    
    if result:
        signal_event["result"] = {
            "from_state": result.from_state.value,
            "to_state": result.to_state.value,
            "reason": result.reason,
            "message": result.message,
        }
    
    state.event_log.append(signal_event)
    
    # DEBUG
    print(f"\n{'='*60}")
    print(f"TRIGGER: {trigger.sensor_id} -> {trigger.signal_type}")
    print(f"  Entry Point: {entry_point_id}")
    print(f"  Zone: {zone_type_str}, Direction: from_inside={from_inside}")
    print(f"  Mode: {status['house_mode']} / {status['user_mode']}")
    print(f"  Global State: {status['global_state']}")
    if result:
        print(f"  Result: {result.from_state.value} -> {result.to_state.value}")
        print(f"  Reason: {result.reason}")
        if result.message:
            print(f"  Message: {result.message}")
    print(f"{'='*60}\n")
    
    response = {
        "status": "triggered",
        "signal_id": f"sig_{uuid.uuid4().hex[:8]}",
        "entry_point_id": entry_point_id,
        "alarm_state": status['global_state'],
        "house_mode": status['house_mode'],
        "user_mode": status['user_mode'],
        "entry_points": status['entry_points'],
    }
    
    if result:
        response["result"] = {
            "entry_point_id": result.entry_point_id,
            "from_state": result.from_state.value,
            "to_state": result.to_state.value,
            "reason": result.reason,
            "message": result.message,
        }
    
    # 添加方向信息
    if signal_type == SignalType.DOOR_OPEN:
        response["direction"] = {
            "from_inside": from_inside,
            "reason": direction_reason,
        }
    
    return response


# =============================================================================
# Pipeline Control Endpoints
# =============================================================================

@app.get("/api/pipeline/status")
async def get_pipeline_status():
    """Get current pipeline status."""
    # 首次请求时自动连接 Ring Keypad
    await ensure_keypad_connected()
    
    status = state.security_coordinator.get_status()
    
    # 合并配置的入口点和状态机中的入口点
    merged_entry_points = {}
    
    # 先添加配置的入口点（默认状态为 quiet）
    for ep_id, ep in state.entry_points.items():
        merged_entry_points[ep_id] = {
            "name": ep.name,
            "state": "quiet",
            "entry_delay_remaining": 0,
        }
    
    # 然后用状态机的状态覆盖
    for ep_id, ep_status in status['entry_points'].items():
        if ep_id in merged_entry_points:
            merged_entry_points[ep_id]["state"] = ep_status.get("state", "quiet")
        else:
            merged_entry_points[ep_id] = ep_status
        
        # 添加倒计时
        timer = state.entry_timers.get(ep_id)
        if timer:
            merged_entry_points[ep_id]['entry_delay_remaining'] = round(timer.get_remaining(), 1)
    
    # 检查 _global 入口点状态
    global_ep = state.security_coordinator.get_entry_point("_global")
    if global_ep and global_ep.state.value != "quiet":
        merged_entry_points["_global"] = {
            "name": "Global (未绑定传感器)",
            "state": global_ep.state.value,
            "entry_delay_remaining": 0,
        }
        timer = state.entry_timers.get("_global")
        if timer:
            merged_entry_points["_global"]['entry_delay_remaining'] = round(timer.get_remaining(), 1)
    
    return {
        "mode": state.current_mode.value,
        "night_sub_mode": state.current_night_sub.value if state.current_night_sub else None,
        "house_mode": status['house_mode'],
        "user_mode": status['user_mode'],
        "alarm_state": status['global_state'],
        "entry_points": merged_entry_points,
        "event_count": status['event_count'],
    }


@app.get("/api/debug/topology")
async def debug_topology():
    """Debug endpoint to view full topology state."""
    if not state.pipeline:
        state.init_pipeline()
    
    zones_info = []
    for zid, z in state.zones.items():
        zones_info.append({
            "zone_id": zid,
            "name": z.name,
            "zone_type": z.zone_type.value,
            "location_type": z.location_type.value if z.location_type else None,
            "entry_point_ids": z.entry_point_ids,
        })
    
    ep_info = []
    for epid, ep in state.entry_points.items():
        ep_info.append({
            "entry_point_id": epid,
            "name": ep.name,
            "zone_id": ep.zone_id,
            "entry_delay_away_sec": ep.entry_delay_away_sec,
        })
    
    sensors_info = []
    for sid, b in state.sensors.items():
        sensors_info.append({
            "sensor_id": sid,
            "sensor_type": b.sensor_type,
            "zone_id": b.zone_id,
            "zone_type": b.zone_type.value if b.zone_type else None,
            "location_type": b.location_type.value if b.location_type else None,
            "entry_point_id": b.entry_point_id,
        })
    
    # Check pipeline topology
    pipeline_zones = {}
    if state.pipeline and state.pipeline.topology:
        for zid, z in state.pipeline.topology.zones.items():
            pipeline_zones[zid] = {
                "zone_type": z.zone_type.value,
                "location_type": z.location_type.value if z.location_type else None,
            }
    
    return {
        "mode": state.current_mode.value,
        "zones": zones_info,
        "entry_points": ep_info,
        "sensors": sensors_info,
        "pipeline_zones": pipeline_zones,
        "recent_activity": [
            {"zone_type": zt.value, "signal_type": st.value}
            for ts, zt, st in state.pipeline._recent_activity
        ] if state.pipeline else [],
    }


@app.post("/api/pipeline/mode")
async def set_mode(mode_change: ModeChange):
    """Change house mode and user mode."""
    mode_map = {
        "away": HouseMode.AWAY,
        "home": HouseMode.HOME,
        "night": HouseMode.NIGHT,
        "disarmed": HouseMode.DISARMED,
    }
    
    new_mode = mode_map.get(mode_change.mode.lower())
    if not new_mode:
        raise HTTPException(400, f"Invalid mode: {mode_change.mode}")
    
    night_sub = None
    if mode_change.night_sub_mode:
        night_sub_map = {
            "occupied": NightSubMode.NIGHT_OCCUPIED,
            "perimeter": NightSubMode.NIGHT_PERIMETER,
        }
        night_sub = night_sub_map.get(mode_change.night_sub_mode.lower())
    
    # 获取 user_mode (默认保持当前值)
    user_mode = mode_change.user_mode or state.current_user_mode
    if user_mode not in ("alert", "quiet"):
        user_mode = "quiet"
    
    old_mode = state.current_mode.value
    old_user_mode = state.current_user_mode
    
    # 更新模式
    state.update_modes(new_mode, night_sub, user_mode)
    
    # 获取状态
    status = state.security_coordinator.get_status()
    
    # 记录模式变化事件
    state.event_log.append({
        "type": "mode_change",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "old_mode": old_mode,
        "new_mode": new_mode.value,
        "night_sub_mode": night_sub.value if night_sub else None,
        "old_user_mode": old_user_mode,
        "new_user_mode": user_mode,
        "message": f"Mode changed: {old_mode} → {new_mode.value}, User mode: {old_user_mode} → {user_mode}",
    })
    
    return {
        "status": "mode_changed",
        "mode": new_mode.value,
        "night_sub_mode": night_sub.value if night_sub else None,
        "house_mode": status['house_mode'],
        "user_mode": status['user_mode'],
        "alarm_state": status['global_state'],
    }


@app.post("/api/pipeline/disarm")
async def disarm():
    """Disarm the system - switch to DISARMED mode and reset state."""


@app.post("/api/pin/verify")
async def verify_pin(request: PinVerifyRequest):
    """验证 PIN 码"""
    success, message = state.verify_pin(request.pin)
    
    if not success:
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": message}
        )
    
    return {
        "success": True,
        "message": message,
        "lockout_status": {
            "locked": False,
            "fail_count": state.pin_fail_count,
        }
    }


@app.post("/api/pin/set")
async def set_pin(request: PinSetRequest):
    """修改 PIN 码（需要验证旧 PIN）"""
    # 验证旧 PIN
    success, message = state.verify_pin(request.old_pin)
    if not success:
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": message}
        )
    
    # 设置新 PIN
    if state.set_pin(request.new_pin):
        state.event_log.append({
            "type": "pin_changed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "PIN 码已修改",
        })
        return {"success": True, "message": "PIN 码已成功修改"}
    else:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "新 PIN 格式无效（需要 4-8 位数字）"}
        )


@app.get("/api/pin/status")
async def get_pin_status():
    """获取 PIN 锁定状态"""
    locked = False
    remaining_lockout = 0
    
    if state.pin_lockout_until:
        if datetime.now(timezone.utc) < state.pin_lockout_until:
            locked = True
            remaining_lockout = int((state.pin_lockout_until - datetime.now(timezone.utc)).total_seconds())
        else:
            # 自动解锁
            state.pin_lockout_until = None
            state.pin_fail_count = 0
    
    return {
        "locked": locked,
        "fail_count": state.pin_fail_count,
        "max_attempts": state.max_pin_attempts,
        "remaining_lockout_sec": remaining_lockout,
    }


@app.post("/api/pipeline/mode-with-pin")
async def set_mode_with_pin(request: ModeChangeWithPinRequest):
    """切换模式（需要 PIN 验证）"""
    # 验证 PIN
    success, message = state.verify_pin(request.pin)
    if not success:
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": message}
        )
    
    # 检查是否处于 TRIGGERED 状态
    status = state.security_coordinator.get_status()
    if status['global_state'] == 'triggered':
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "系统处于 TRIGGERED 状态，请先取消报警（Cancel）"
            }
        )
    
    # 执行模式切换（复用现有逻辑）
    mode_map = {
        "away": HouseMode.AWAY,
        "home": HouseMode.HOME,
        "night": HouseMode.NIGHT,
        "disarmed": HouseMode.DISARMED,
    }
    
    new_mode = mode_map.get(request.mode.lower())
    if not new_mode:
        raise HTTPException(400, f"Invalid mode: {request.mode}")
    
    night_sub = None
    if request.night_sub_mode:
        night_sub_map = {
            "occupied": NightSubMode.NIGHT_OCCUPIED,
            "perimeter": NightSubMode.NIGHT_PERIMETER,
        }
        night_sub = night_sub_map.get(request.night_sub_mode.lower())
    
    user_mode = request.user_mode or state.current_user_mode
    if user_mode not in ("alert", "quiet"):
        user_mode = "quiet"
    
    old_mode = state.current_mode.value
    
    # 更新模式
    state.update_modes(new_mode, night_sub, user_mode)
    
    # 如果切换到 DISARMED，自动取消所有 PENDING/PRE 状态
    if new_mode == HouseMode.DISARMED:
        # 取消所有入口点的计时器
        for timer in state.entry_timers.values():
            timer.cancel()
        
        # 重置所有入口点状态
        for ep_id in state.entry_points.keys():
            ep_sm = state.security_coordinator.get_entry_point(ep_id)
            if ep_sm:
                from ..services.state_machine_v5 import AlarmState as SMAlarmState
                if ep_sm.state in (SMAlarmState.PRE, SMAlarmState.PENDING):
                    ep_sm.disarm()
    
    status = state.security_coordinator.get_status()
    
    # 记录事件
    state.event_log.append({
        "type": "mode_change_with_pin",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "old_mode": old_mode,
        "new_mode": new_mode.value,
        "night_sub_mode": night_sub.value if night_sub else None,
        "user_mode": user_mode,
        "message": f"PIN 验证成功，模式切换: {old_mode} → {new_mode.value}",
    })
    
    return {
        "success": True,
        "message": f"模式已切换到 {new_mode.value}",
        "status": {
            "mode": new_mode.value,
            "night_sub_mode": night_sub.value if night_sub else None,
            "house_mode": status['house_mode'],
            "user_mode": status['user_mode'],
            "alarm_state": status['global_state'],
        }
    }


@app.post("/api/pipeline/disarm")
async def disarm():
    """Disarm the system - switch to DISARMED mode and reset state."""
    # 取消所有计时器
    for timer in state.entry_timers.values():
        timer.cancel()
    
    old_mode = state.current_mode.value
    state.update_modes(HouseMode.DISARMED, None, "quiet")
    
    # 记录事件
    state.event_log.append({
        "type": "user_action",
        "action": "disarm",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "old_mode": old_mode,
        "message": f"System disarmed from {old_mode}",
    })
    
    status = state.security_coordinator.get_status()
    return {
        "status": "disarmed",
        "alarm_state": status['global_state'],
        "mode": "disarmed",
    }


@app.post("/api/pipeline/cancel")
async def cancel_alarm():
    """
    Cancel the alarm (PRE or PENDING state).
    Cancels all entry points in PRE/PENDING.
    """
    # 取消所有计时器
    for timer in state.entry_timers.values():
        timer.cancel()
    
    results = state.security_coordinator.cancel_all()
    status = state.security_coordinator.get_status()
    
    if not results:
        state.event_log.append({
            "type": "user_action",
            "action": "cancel_all",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "message": "Cancel failed: No entry points in PRE or PENDING state",
        })
        return {
            "status": "failed",
            "alarm_state": status['global_state'],
            "error": "No entry points in PRE or PENDING state",
        }
    
    state.event_log.append({
        "type": "user_action",
        "action": "cancel_all",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "success": True,
        "canceled_count": sum(1 for r in results if r.success),
        "message": f"Canceled {sum(1 for r in results if r.success)} entry points",
    })
    
    return {
        "status": "canceled",
        "alarm_state": status['global_state'],
        "canceled_count": sum(1 for r in results if r.success),
        "entry_points": status['entry_points'],
    }


@app.post("/api/pipeline/cancel/{entry_point_id}")
async def cancel_entry_point(entry_point_id: str):
    """
    Cancel a specific entry point's alarm (PRE or PENDING state).
    """
    # 取消该入口的计时器
    timer = state.entry_timers.get(entry_point_id)
    if timer:
        timer.cancel()
    
    result = state.security_coordinator.cancel(entry_point_id)
    status = state.security_coordinator.get_status()
    
    state.event_log.append({
        "type": "user_action",
        "action": "cancel",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry_point_id": entry_point_id,
        "success": result.success,
        "from_state": result.from_state.value,
        "to_state": result.to_state.value,
        "message": f"Cancel {entry_point_id}: {result.reason}",
    })
    
    if not result.success:
        return {
            "status": "failed",
            "entry_point_id": entry_point_id,
            "alarm_state": status['global_state'],
            "error": result.reason,
        }
    
    return {
        "status": "canceled",
        "entry_point_id": entry_point_id,
        "alarm_state": status['global_state'],
        "entry_points": status['entry_points'],
    }


@app.post("/api/pipeline/resolve")
async def resolve_alarm():
    """
    Resolve the alarm (TRIGGERED state only).
    Resolves all entry points in TRIGGERED.
    """
    results = state.security_coordinator.resolve_all()
    status = state.security_coordinator.get_status()
    
    if not results:
        state.event_log.append({
            "type": "user_action",
            "action": "resolve_all",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "message": "Resolve failed: No entry points in TRIGGERED state",
        })
        return {
            "status": "failed",
            "alarm_state": status['global_state'],
            "error": "No entry points in TRIGGERED state",
        }
    
    state.event_log.append({
        "type": "user_action",
        "action": "resolve_all",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "success": True,
        "resolved_count": sum(1 for r in results if r.success),
        "message": f"Resolved {sum(1 for r in results if r.success)} entry points",
    })
    
    return {
        "status": "resolved",
        "alarm_state": status['global_state'],
        "resolved_count": sum(1 for r in results if r.success),
        "entry_points": status['entry_points'],
    }


@app.post("/api/pipeline/resolve/{entry_point_id}")
async def resolve_entry_point(entry_point_id: str):
    """
    Resolve a specific entry point's alarm (TRIGGERED state only).
    """
    result = state.security_coordinator.resolve(entry_point_id)
    status = state.security_coordinator.get_status()
    
    state.event_log.append({
        "type": "user_action",
        "action": "resolve",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry_point_id": entry_point_id,
        "success": result.success,
        "from_state": result.from_state.value,
        "to_state": result.to_state.value,
        "message": f"Resolve {entry_point_id}: {result.reason}",
    })
    
    if not result.success:
        return {
            "status": "failed",
            "entry_point_id": entry_point_id,
            "alarm_state": status['global_state'],
            "error": result.reason,
        }
    
    return {
        "status": "resolved",
        "entry_point_id": entry_point_id,
        "alarm_state": status['global_state'],
        "entry_points": status['entry_points'],
    }


@app.post("/api/pipeline/reset")
async def reset_pipeline():
    """Reset the pipeline state."""
    # 取消所有入口点的计时器
    for timer in state.entry_timers.values():
        timer.cancel()
    state.entry_timers.clear()
    
    state.direction_inferencer.clear()
    state.event_log.clear()
    state.security_coordinator.reset()
    
    # 记录重置事件
    state.event_log.append({
        "type": "user_action",
        "action": "reset",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": "System reset by user",
    })
    
    status = state.security_coordinator.get_status()
    return {
        "status": "reset",
        "alarm_state": status['global_state'],
    }


@app.get("/api/pipeline/events")
async def get_event_log():
    """Get detailed event log."""
    return {"events": list(reversed(state.event_log[-100:]))}  # 最新的在前面


@app.delete("/api/pipeline/events")
async def clear_event_log():
    """Clear event log."""
    state.event_log.clear()
    state.event_log.append({
        "type": "user_action",
        "action": "clear_events",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": "Event log cleared by user",
    })
    return {"status": "cleared"}


@app.post("/api/load-standard-config")
async def load_standard_config():
    """加载标准测试配置"""
    try:
        from ..testing.standard_config import (
            create_standard_test_topology,
            get_standard_sensor_bindings
        )
        
        state.zones.clear()
        state.entry_points.clear()
        state.sensors.clear()
        
        topology = create_standard_test_topology()
        
        for zone_id, zone in topology.zones.items():
            state.zones[zone_id] = zone
        
        for ep_id, ep in topology.entry_points.items():
            state.entry_points[ep_id] = ep
        
        sensor_bindings = get_standard_sensor_bindings()
        for sensor_id, config in sensor_bindings.items():
            binding = SensorBinding(
                sensor_id=sensor_id,
                sensor_type=config["sensor_type"],
                zone_id=config["zone_id"],
                zone_type=ZoneType(config["zone_type"].value),
                location_type=LocationType.INDOOR if config.get("location_type") == "indoor" else LocationType.OUTDOOR,
                entry_point_id=config.get("entry_point_id"),
            )
            state.sensors[sensor_id] = binding
        
        state.init_pipeline()
        state.update_modes(
            state.current_mode,
            state.current_night_sub,
            state.current_user_mode
        )
        
        return {
            "success": True,
            "message": "标准配置已加载",
            "details": {
                "zones": len(state.zones),
                "entry_points": len(state.entry_points),
                "sensors": len(state.sensors),
                "zone_list": [
                    {"id": z.zone_id, "name": z.name, "type": z.zone_type.value}
                    for z in state.zones.values()
                ],
                "sensor_list": [
                    {"id": s.sensor_id, "type": s.sensor_type}
                    for s in state.sensors.values()
                ]
            }
        }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"加载失败: {str(e)}")


# =============================================================================
# Drill Endpoints
# =============================================================================

@app.post("/api/drills/load")
async def load_drills(path: Optional[str] = None):
    """Load drill cases from file."""
    import os
    
    # 默认查找顺序
    search_paths = [
        path,  # 用户指定路径
        "NG-Drills-EDGE-v7.4.2.json",  # 当前目录
        "./NG-Drills-EDGE-v7.4.2.json",
        "../NG-Drills-EDGE-v7.4.2.json",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "NG-Drills-EDGE-v7.4.2.json"),
        "/home/claude/v742-pack/NG-Drills-EDGE-v7.4.2.json",  # 开发环境
    ]
    
    drills_path = None
    for p in search_paths:
        if p and os.path.exists(p):
            drills_path = p
            break
    
    if not drills_path:
        raise HTTPException(400, "Drills file not found. Place NG-Drills-EDGE-v7.4.2.json in current directory or specify path.")
    
    try:
        state.drill_runner = DrillRunner(drills_path)
        return {
            "status": "loaded",
            "path": drills_path,
            "case_count": len(state.drill_runner.cases),
            "cases": [
                {"case_id": c.case_id, "title": c.title, "tags": c.tags}
                for c in state.drill_runner.cases[:20]  # First 20
            ],
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to load drills: {str(e)}")


@app.post("/api/drills/run")
async def run_drills(request: DrillRunRequest):
    """Run drill cases."""
    if not state.drill_runner:
        raise HTTPException(400, "Drills not loaded. Call POST /api/drills/load first")
    
    if request.case_ids:
        results = []
        for case_id in request.case_ids:
            case = next((c for c in state.drill_runner.cases if c.case_id == case_id), None)
            if case:
                results.append(state.drill_runner.run_case(case))
    else:
        results = state.drill_runner.run_all(tags=request.tags)
    
    summary = state.drill_runner.get_summary(results)
    
    return {
        "summary": summary,
        "results": [
            {
                "case_id": r.case_id,
                "passed": r.passed,
                "failures": r.failures,
                "transitions": r.transitions,
                "final_state": r.final_state,
                "duration_ms": r.duration_ms,
            }
            for r in results
        ],
    }


@app.get("/api/drills/cases")
async def list_drill_cases():
    """List available drill cases."""
    if not state.drill_runner:
        return {"cases": [], "message": "Drills not loaded"}
    
    return {
        "cases": [
            {
                "case_id": c.case_id,
                "title": c.title,
                "mode": c.mode,
                "tags": c.tags,
                "signal_count": len(c.signals),
            }
            for c in state.drill_runner.cases
        ]
    }


# =============================================================================
# UI Endpoint
# =============================================================================

@app.get("/", response_class=HTMLResponse)
async def get_ui():
    """Serve the management UI."""
    return get_management_ui_html()


def get_management_ui_html() -> str:
    """Generate the management UI HTML."""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NG Edge Manager</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .status-normal { background-color: #10b981; }
        .status-quiet { background-color: #10b981; }
        .status-pre { background-color: #f59e0b; }
        .status-pending { background-color: #f97316; }
        .status-triggered { background-color: #ef4444; animation: pulse 1s infinite; }
        .status-canceled { background-color: #6b7280; }
        .status-resolved { background-color: #3b82f6; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-8 text-gray-800">NG Edge Manager v7.4.2</h1>
        
        <!-- Status Panel -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">System Status</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <label class="text-sm text-gray-600">Mode</label>
                    <div id="currentMode" class="text-lg font-medium">-</div>
                </div>
                <div>
                    <label class="text-sm text-gray-600">Alarm State</label>
                    <div id="alarmState" class="text-lg font-medium px-3 py-1 rounded inline-block">-</div>
                </div>
                <div>
                    <label class="text-sm text-gray-600">User Mode</label>
                    <div id="userModeDisplay" class="text-lg font-medium">-</div>
                </div>
                <div>
                    <label class="text-sm text-gray-600">Events</label>
                    <div id="activeEvent" class="text-lg font-medium">-</div>
                </div>
            </div>
            
            <!-- Entry Delay Countdown -->
            <div id="entryDelayPanel" class="mt-4 p-4 bg-orange-50 border-2 border-orange-400 rounded-lg hidden">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm text-orange-600 font-semibold">⏱️ ENTRY DELAY 倒计时</div>
                        <div class="text-xs text-orange-500 mt-1" id="entryDelayEntryPoint">-</div>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl font-bold text-orange-600" id="entryDelayCountdown">--</div>
                        <div class="text-xs text-orange-500">秒</div>
                    </div>
                </div>
                <div class="mt-2">
                    <div class="w-full bg-orange-200 rounded-full h-2">
                        <div id="entryDelayProgress" class="bg-orange-500 h-2 rounded-full transition-all duration-1000" style="width: 100%"></div>
                    </div>
                </div>
                <div class="mt-2 text-xs text-orange-600 text-center">
                    输入 PIN 撤防以取消报警
                </div>
            </div>
            
            <!-- Mode Controls -->
            <div class="mt-4 flex gap-2 flex-wrap">
                <button onclick="loadStandardConfig()" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-semibold">
                    📦 加载标准配置
                </button>
                <span class="border-l mx-2"></span>
                <button onclick="setModeWithPin('disarmed')" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">🔓 Disarm</button>
                <button onclick="setModeWithPin('home')" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">🏠 Home</button>
                <button onclick="setModeWithPin('away')" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">🚗 Away</button>
                <button onclick="setModeWithPin('night', 'occupied')" class="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">🌙 Night (Occupied)</button>
                <button onclick="setModeWithPin('night', 'perimeter')" class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">🌙 Night (Perimeter)</button>
                <span class="border-l mx-2"></span>
                <button id="btnCancel" onclick="cancelAlarm()" class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 hidden">⚠️ Cancel (PRE/PENDING)</button>
                <button id="btnResolve" onclick="resolveAlarm()" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 hidden">✓ Resolve (TRIGGERED)</button>
                <button onclick="resetPipeline()" class="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">🔄 Reset</button>
            </div>
            
            <!-- PIN Status Display -->
            <div id="pinStatusBar" class="mt-3 p-2 bg-yellow-100 border border-yellow-400 rounded hidden">
                <span class="text-sm text-yellow-800">⚠️ <span id="pinStatusMessage"></span></span>
            </div>
            
            <!-- Ring Keypad Status -->
            <div class="mt-3 p-3 bg-green-50 border border-green-300 rounded">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🔑</span>
                    <div class="flex-1">
                        <div class="font-semibold text-green-800">Ring Keypad 已连接</div>
                        <div class="text-sm text-green-700">使用 Ring Keypad 控制系统（按 DISARM/HOME/AWAY 按钮）</div>
                    </div>
                </div>
            </div>
            
            <!-- User Mode (Alert/Quiet) -->
            <div class="mt-4 flex items-center gap-4">
                <span class="text-sm text-gray-600">User Mode:</span>
                <label class="inline-flex items-center">
                    <input type="radio" name="userMode" value="alert" onchange="setUserMode('alert')" class="form-radio">
                    <span class="ml-2">Alert (更多提醒)</span>
                </label>
                <label class="inline-flex items-center">
                    <input type="radio" name="userMode" value="quiet" checked onchange="setUserMode('quiet')" class="form-radio">
                    <span class="ml-2">Quiet (减少打扰)</span>
                </label>
            </div>
        </div>
        
        <!-- Tabs -->
        <div class="bg-white rounded-lg shadow">
            <div class="border-b">
                <nav class="flex">
                    <button onclick="showTab('zones')" class="tab-btn px-6 py-3 border-b-2 border-blue-500 text-blue-600" data-tab="zones">Zones</button>
                    <button onclick="showTab('entrypoints')" class="tab-btn px-6 py-3 border-b-2 border-transparent" data-tab="entrypoints">Entry Points</button>
                    <button onclick="showTab('sensors')" class="tab-btn px-6 py-3 border-b-2 border-transparent" data-tab="sensors">Sensors</button>
                    <button onclick="showTab('simulate')" class="tab-btn px-6 py-3 border-b-2 border-transparent" data-tab="simulate">Simulate</button>
                    <button onclick="showTab('events')" class="tab-btn px-6 py-3 border-b-2 border-transparent" data-tab="events">Events</button>
                    <button onclick="showTab('drills')" class="tab-btn px-6 py-3 border-b-2 border-transparent" data-tab="drills">Drills</button>
                </nav>
            </div>
            
            <!-- Zones Tab -->
            <div id="tab-zones" class="tab-content p-6">
                <div class="flex justify-between mb-4">
                    <h3 class="text-lg font-semibold">Zones</h3>
                    <button onclick="showZoneForm()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">+ Add Zone</button>
                </div>
                <div id="zoneList" class="space-y-2"></div>
                
                <!-- Zone Form -->
                <div id="zoneForm" class="hidden mt-4 p-4 bg-gray-50 rounded">
                    <p class="text-sm text-gray-600 mb-3">Zone 是安全区域。先创建 Zone，然后才能添加 Entry Point 和 Sensor。</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Zone ID *</label>
                            <input id="zoneId" placeholder="例如: zone_backyard" class="w-full border rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">名称 *</label>
                            <input id="zoneName" placeholder="例如: Back Yard" class="w-full border rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Zone 类型 *</label>
                            <select id="zoneType" class="w-full border rounded px-3 py-2">
                                <option value="exterior">🌳 Exterior (室外，如院子)</option>
                                <option value="entry_exit">🚪 Entry/Exit (入口，如门廊)</option>
                                <option value="perimeter">🏠 Perimeter (周边，如窗户)</option>
                                <option value="interior_follower">👣 Interior Follower (室内跟随)</option>
                                <option value="interior_instant">⚡ Interior Instant (室内即时)</option>
                                <option value="fire_24h">🔥 Fire 24H</option>
                                <option value="co_24h">☁️ CO 24H</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">位置类型 *</label>
                            <select id="locationType" class="w-full border rounded px-3 py-2">
                                <option value="outdoor">Outdoor (室外)</option>
                                <option value="indoor">Indoor (室内)</option>
                                <option value="threshold">Threshold (门槛/入口)</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-3 p-3 bg-blue-50 rounded text-sm">
                        <strong>Zone 类型说明：</strong><br>
                        • <b>Exterior</b>: 室外区域（院子、车道），有人时预警<br>
                        • <b>Entry/Exit</b>: 入口（门），触发进入延迟倒计时<br>
                        • <b>Interior Instant</b>: 室内即时区域，无延迟直接报警<br>
                        • <b>Interior Follower</b>: 室内跟随区域，加速现有事件
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button onclick="createZone()" class="px-4 py-2 bg-green-500 text-white rounded">Create</button>
                        <button onclick="hideZoneForm()" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    </div>
                </div>
            </div>
            
            <!-- Entry Points Tab -->
            <div id="tab-entrypoints" class="tab-content p-6 hidden">
                <div class="flex justify-between mb-4">
                    <h3 class="text-lg font-semibold">Entry Points</h3>
                    <button onclick="showEPForm()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">+ Add Entry Point</button>
                </div>
                <div id="epList" class="space-y-2"></div>
                
                <!-- EP Form -->
                <div id="epForm" class="hidden mt-4 p-4 bg-gray-50 rounded">
                    <p class="text-sm text-gray-600 mb-3">Entry Point 定义入口延迟。必须先创建 Zone。</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Entry Point ID *</label>
                            <input id="epId" placeholder="例如: ep_front_door" class="w-full border rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">名称 *</label>
                            <input id="epName" placeholder="例如: Front Door" class="w-full border rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">所属 Zone *</label>
                            <select id="epZoneId" class="w-full border rounded px-3 py-2">
                                <option value="">-- 选择 Zone --</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">AWAY 延迟 (秒)</label>
                            <input id="epDelayAway" type="number" value="30" class="w-full border rounded px-3 py-2">
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button onclick="createEntryPoint()" class="px-4 py-2 bg-green-500 text-white rounded">Create</button>
                        <button onclick="hideEPForm()" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    </div>
                </div>
            </div>
            
            <!-- Sensors Tab -->
            <div id="tab-sensors" class="tab-content p-6 hidden">
                <div class="flex justify-between mb-4">
                    <h3 class="text-lg font-semibold">Sensors</h3>
                    <button onclick="showSensorForm()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">+ Add Sensor</button>
                </div>
                <div id="sensorList" class="space-y-2"></div>
                
                <!-- Sensor Form -->
                <div id="sensorForm" class="hidden mt-4 p-4 bg-gray-50 rounded">
                    <p class="text-sm text-gray-600 mb-3">传感器绑定到 Zone。必须先创建 Zone。</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Sensor ID *</label>
                            <input id="sensorId" placeholder="例如: cam_backyard" class="w-full border rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">类型 *</label>
                            <select id="sensorType" class="w-full border rounded px-3 py-2">
                                <option value="camera">Camera (摄像头)</option>
                                <option value="camera_ai">Camera AI (AI摄像头)</option>
                                <option value="door_contact">Door Contact (门磁)</option>
                                <option value="motion_pir">Motion PIR (红外)</option>
                                <option value="glass_break">Glass Break (玻璃破碎)</option>
                                <option value="smoke">Smoke Detector (烟感)</option>
                                <option value="co">CO Detector (一氧化碳)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">所属 Zone *</label>
                            <select id="sensorZoneId" class="w-full border rounded px-3 py-2">
                                <option value="">-- 选择 Zone --</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Entry Point (可选)</label>
                            <select id="sensorEPId" class="w-full border rounded px-3 py-2">
                                <option value="">-- 无 --</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button onclick="createSensor()" class="px-4 py-2 bg-green-500 text-white rounded">Create</button>
                        <button onclick="hideSensorForm()" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    </div>
                </div>
            </div>
            
            <!-- Simulate Tab -->
            <div id="tab-simulate" class="tab-content p-6 hidden">
                <h3 class="text-lg font-semibold mb-4">Signal Simulation</h3>
                
                <!-- Entry Points Signal Control -->
                <div id="entryPointsSimulate" class="space-y-4 mb-6">
                    <!-- 动态生成每个 Entry Point 的控制面板 -->
                </div>
                
                <!-- 传统传感器触发 (用于非入口点传感器) -->
                <div class="border-t pt-4 mt-4">
                    <h4 class="font-semibold mb-2 text-gray-600">其他传感器 (非入口点)</h4>
                    <div class="grid grid-cols-4 gap-4 mb-4">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Sensor</label>
                            <select id="triggerSensorId" onchange="updateSignalOptions()" class="w-full border rounded px-3 py-2"></select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Signal Type</label>
                            <select id="triggerSignalType" class="w-full border rounded px-3 py-2">
                                <option value="">-- 先选择传感器 --</option>
                            </select>
                        </div>
                        <div id="directionContainer">
                            <label class="block text-sm text-gray-600 mb-1">Direction (门磁)</label>
                            <select id="triggerDirection" class="w-full border rounded px-3 py-2">
                                <option value="auto">自动推断</option>
                                <option value="outside">从外面</option>
                                <option value="inside">从里面</option>
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button onclick="triggerSensor()" class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">Trigger</button>
                        </div>
                    </div>
                </div>
                
                <div class="text-sm text-gray-500 mb-4 p-3 bg-blue-50 rounded">
                    <strong>信号类型说明:</strong><br>
                    • 🚶 person: 外部摄像头检测到人<br>
                    • 🚪 door_out: 从外面开门 (入侵迹象)<br>
                    • 🚪 door_in: 从里面开门 (正常出门)<br>
                    • 👣 motion: 室内移动检测<br>
                    • 💥 glass: 玻璃破碎
                </div>
                
                <h4 class="font-semibold mb-2">Result</h4>
                <pre id="triggerResult" class="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-64"></pre>
            </div>
            
            <!-- Events Tab -->
            <div id="tab-events" class="tab-content p-6 hidden">
                <div class="flex justify-between mb-4">
                    <h3 class="text-lg font-semibold">Event Log (信号 & 状态变化)</h3>
                    <div class="flex gap-2">
                        <button onclick="refreshEvents()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Refresh</button>
                        <button onclick="clearEvents()" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">Clear</button>
                    </div>
                </div>
                
                <!-- 过滤器 -->
                <div class="flex gap-4 mb-4 p-3 bg-gray-50 rounded">
                    <label class="inline-flex items-center">
                        <input type="checkbox" id="filterSignals" checked class="form-checkbox" onchange="refreshEvents()">
                        <span class="ml-2">📡 Signals</span>
                    </label>
                    <label class="inline-flex items-center">
                        <input type="checkbox" id="filterStateChanges" checked class="form-checkbox" onchange="refreshEvents()">
                        <span class="ml-2">🔄 State Changes</span>
                    </label>
                    <label class="inline-flex items-center">
                        <input type="checkbox" id="filterModeChanges" checked class="form-checkbox" onchange="refreshEvents()">
                        <span class="ml-2">🏠 Mode Changes</span>
                    </label>
                    <label class="inline-flex items-center">
                        <input type="checkbox" id="filterUserActions" checked class="form-checkbox" onchange="refreshEvents()">
                        <span class="ml-2">👆 User Actions</span>
                    </label>
                </div>
                
                <!-- 当前状态摘要 -->
                <div id="currentStateSummary" class="mb-4 p-4 bg-blue-50 rounded">
                    <h4 class="font-semibold mb-2">Current State Summary</h4>
                    <div id="stateSummaryContent">Loading...</div>
                </div>
                
                <!-- 事件列表 -->
                <div id="eventList" class="space-y-1 max-h-[600px] overflow-auto font-mono text-sm">
                    <!-- 事件将在这里显示 -->
                </div>
            </div>
            
            <!-- Drills Tab -->
            <div id="tab-drills" class="tab-content p-6 hidden">
                <div class="flex gap-2 mb-4">
                    <button onclick="loadDrills()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Load Drills</button>
                    <button onclick="runAllDrills()" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Run All</button>
                    <button onclick="runSelectedDrills()" class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">Run Selected</button>
                </div>
                
                <div id="drillSummary" class="mb-4 p-4 bg-gray-50 rounded hidden">
                    <div class="grid grid-cols-4 gap-4 text-center">
                        <div><span class="text-2xl font-bold" id="drillTotal">0</span><br><span class="text-sm text-gray-600">Total</span></div>
                        <div><span class="text-2xl font-bold text-green-600" id="drillPassed">0</span><br><span class="text-sm text-gray-600">Passed</span></div>
                        <div><span class="text-2xl font-bold text-red-600" id="drillFailed">0</span><br><span class="text-sm text-gray-600">Failed</span></div>
                        <div><span class="text-2xl font-bold" id="drillRate">0%</span><br><span class="text-sm text-gray-600">Pass Rate</span></div>
                    </div>
                </div>
                
                <div id="drillList" class="space-y-2 max-h-96 overflow-auto"></div>
            </div>
        </div>
    </div>
    
    <script>
        // Refresh status every 2 seconds
        setInterval(refreshStatus, 2000);
        
        // Initial load
        document.addEventListener('DOMContentLoaded', () => {
            refreshStatus();
            refreshZones();
            refreshEntryPoints();
            refreshSensors();
        });
        
        async function refreshStatus() {
            try {
                const res = await fetch('/api/pipeline/status');
                const data = await res.json();
                
                document.getElementById('currentMode').textContent = data.mode + (data.night_sub_mode ? ` (${data.night_sub_mode})` : '');
                
                const stateEl = document.getElementById('alarmState');
                // 使用 NORMAL 替代 QUIET 显示
                const displayState = data.alarm_state === 'quiet' ? 'normal' : data.alarm_state;
                stateEl.textContent = displayState.toUpperCase();
                stateEl.className = `text-lg font-medium px-3 py-1 rounded inline-block text-white status-${data.alarm_state}`;
                
                // 显示 user_mode
                const userModeDisplay = data.user_mode === 'alert' ? '🔔 Alert' : '🔕 Quiet';
                document.getElementById('userModeDisplay').textContent = userModeDisplay;
                document.getElementById('activeEvent').textContent = data.event_count ? `${data.event_count} events` : 'None';
                
                // 更新 user_mode radio
                if (data.user_mode) {
                    document.querySelectorAll('input[name="userMode"]').forEach(r => {
                        r.checked = r.value === data.user_mode;
                    });
                    currentUserMode = data.user_mode;
                }
                
                // 处理 Entry Delay 倒计时显示
                updateEntryDelayDisplay(data);
                
                // 根据状态显示/隐藏 Cancel 和 Resolve 按钮
                const btnCancel = document.getElementById('btnCancel');
                const btnResolve = document.getElementById('btnResolve');
                
                if (data.alarm_state === 'pre' || data.alarm_state === 'pending') {
                    btnCancel.classList.remove('hidden');
                    btnResolve.classList.add('hidden');
                } else if (data.alarm_state === 'triggered') {
                    btnCancel.classList.add('hidden');
                    btnResolve.classList.remove('hidden');
                } else {
                    btnCancel.classList.add('hidden');
                    btnResolve.classList.add('hidden');
                }
                
                // 刷新 Entry Point 模拟面板（如果在 simulate tab）
                if (!document.getElementById('tab-simulate').classList.contains('hidden')) {
                    refreshEntryPointsSimulate();
                }
            } catch (e) {
                console.error('Failed to refresh status:', e);
            }
        }
        
        function updateEntryDelayDisplay(statusData) {
            const panel = document.getElementById('entryDelayPanel');
            const countdown = document.getElementById('entryDelayCountdown');
            const progress = document.getElementById('entryDelayProgress');
            const epName = document.getElementById('entryDelayEntryPoint');
            
            // 查找有 entry delay 的入口点
            let maxRemaining = 0;
            let activeEp = null;
            
            if (statusData.entry_points) {
                for (const [epId, ep] of Object.entries(statusData.entry_points)) {
                    if (ep.entry_delay_remaining > maxRemaining) {
                        maxRemaining = ep.entry_delay_remaining;
                        activeEp = epId;
                    }
                }
            }
            
            if (maxRemaining > 0 && activeEp) {
                // 显示倒计时面板
                panel.classList.remove('hidden');
                countdown.textContent = maxRemaining;
                epName.textContent = `入口点: ${activeEp}`;
                
                // 更新进度条（假设最大延时 30 秒）
                const maxDelay = 30;
                const percentage = (maxRemaining / maxDelay) * 100;
                progress.style.width = `${Math.min(100, percentage)}%`;
            } else {
                // 隐藏倒计时面板
                panel.classList.add('hidden');
            }
        }
        
        async function cancelAlarm() {
            const res = await fetch('/api/pipeline/cancel', {method: 'POST'});
            const data = await res.json();
            if (data.status === 'canceled') {
                console.log('Alarm canceled, event:', data.event_record);
            } else {
                alert('Cancel failed: ' + (data.error || 'Unknown error'));
            }
            refreshStatus();
        }
        
        async function resolveAlarm() {
            const res = await fetch('/api/pipeline/resolve', {method: 'POST'});
            const data = await res.json();
            if (data.status === 'resolved') {
                console.log('Alarm resolved, event:', data.event_record);
            } else {
                alert('Resolve failed: ' + (data.error || 'Unknown error'));
            }
            refreshStatus();
        }
        
        let currentUserMode = 'quiet';
        async function setUserMode(mode) {
            currentUserMode = mode;
            console.log('User mode set to:', mode);
            // 重新设置当前模式以应用新的 user_mode
            const statusRes = await fetch('/api/pipeline/status');
            const status = await statusRes.json();
            if (status.mode !== 'disarmed') {
                await fetch('/api/pipeline/mode', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        mode: status.mode,
                        night_sub_mode: status.night_sub_mode,
                        user_mode: mode
                    })
                });
                refreshStatus();
            }
        }
        
        async function setMode(mode, nightSub = null) {
            await fetch('/api/pipeline/mode', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({mode, night_sub_mode: nightSub, user_mode: currentUserMode})
            });
            refreshStatus();
        }
        
        async function disarmPipeline() {
            await fetch('/api/pipeline/disarm', {method: 'POST'});
            refreshStatus();
        }
        
        async function resetPipeline() {
            await fetch('/api/pipeline/reset', {method: 'POST'});
            refreshStatus();
        }
        
        // PIN 相关函数
        async function setModeWithPin(mode, nightSub = null) {
            // 检查 PIN 锁定状态
            const statusRes = await fetch('/api/pin/status');
            const status = await statusRes.json();
            
            if (status.locked) {
                showPinStatus(`PIN 已锁定，请 ${status.remaining_lockout_sec} 秒后重试`, 'error');
                return;
            }
            
            // 使用 Ring Keypad 而不是网页输入
            const message = `请使用 Ring Keypad 切换到 ${mode.toUpperCase()} 模式:\n\n` +
                          `方法 1: 直接按 ${mode.toUpperCase()} 按钮\n` +
                          `方法 2: 输入 PIN (1234) + ✓ 后按 ${mode.toUpperCase()}\n\n` +
                          `或者点击"确定"使用默认 PIN 从网页切换`;
            
            if (!confirm(message)) {
                return; // 用户取消
            }
            
            // 使用默认 PIN 从网页切换
            const pin = "1234";  // 默认 PIN
            
            try {
                const response = await fetch('/api/pipeline/mode-with-pin', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        mode: mode,
                        night_sub_mode: nightSub,
                        user_mode: currentUserMode,
                        pin: pin
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showPinStatus('✓ ' + data.message, 'success');
                    refreshStatus();
                } else {
                    showPinStatus('❌ ' + data.message, 'error');
                    
                    // 如果是 PIN 错误，刷新锁定状态
                    if (response.status === 401) {
                        setTimeout(() => checkPinStatus(), 1000);
                    }
                }
            } catch (error) {
                showPinStatus('❌ 网络错误: ' + error.message, 'error');
            }
        }
        
        function showPinStatus(message, type = 'info') {
            const bar = document.getElementById('pinStatusBar');
            const msg = document.getElementById('pinStatusMessage');
            
            msg.textContent = message;
            bar.classList.remove('hidden', 'bg-yellow-100', 'border-yellow-400', 'bg-green-100', 'border-green-400', 'bg-red-100', 'border-red-400');
            
            if (type === 'success') {
                bar.classList.add('bg-green-100', 'border-green-400');
            } else if (type === 'error') {
                bar.classList.add('bg-red-100', 'border-red-400');
            } else {
                bar.classList.add('bg-yellow-100', 'border-yellow-400');
            }
            
            // 3秒后自动隐藏（成功消息）
            if (type === 'success') {
                setTimeout(() => {
                    bar.classList.add('hidden');
                }, 3000);
            }
        }
        
        async function checkPinStatus() {
            const response = await fetch('/api/pin/status');
            const status = await response.json();
            
            if (status.locked) {
                showPinStatus(`PIN 已锁定 ${status.remaining_lockout_sec} 秒`, 'error');
            } else if (status.fail_count > 0) {
                const remaining = status.max_attempts - status.fail_count;
                showPinStatus(`⚠️ PIN 已错误 ${status.fail_count} 次，还有 ${remaining} 次机会`, 'error');
            }
        }
        
        // Tab switching
        function showTab(tab) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(el => {
                el.classList.remove('border-blue-500', 'text-blue-600');
                el.classList.add('border-transparent');
            });
            document.getElementById(`tab-${tab}`).classList.remove('hidden');
            document.querySelector(`[data-tab="${tab}"]`).classList.add('border-blue-500', 'text-blue-600');
            
            if (tab === 'simulate') {
                refreshSensorDropdown();
                refreshEntryPointsSimulate();
            }
            if (tab === 'events') {
                refreshEvents();
            }
        }
        
        // Events Tab functions
        async function refreshEvents() {
            const [eventsRes, statusRes] = await Promise.all([
                fetch('/api/pipeline/events'),
                fetch('/api/pipeline/status')
            ]);
            const eventsData = await eventsRes.json();
            const statusData = await statusRes.json();
            
            // 更新状态摘要
            const summaryEl = document.getElementById('stateSummaryContent');
            const epEntries = Object.entries(statusData.entry_points || {});
            summaryEl.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <strong>House Mode:</strong> ${statusData.house_mode}<br>
                        <strong>User Mode:</strong> ${statusData.user_mode}<br>
                        <strong>Global State:</strong> <span class="font-bold ${statusData.alarm_state === 'quiet' ? 'text-green-600' : 'text-red-600'}">${statusData.alarm_state}</span>
                    </div>
                    <div>
                        <strong>Entry Points:</strong><br>
                        ${epEntries.length === 0 ? '<span class="text-gray-500">No entry points</span>' : 
                          epEntries.map(([id, ep]) => `• ${id}: <span class="font-bold ${ep.state === 'quiet' ? 'text-green-600' : 'text-red-600'}">${ep.state}</span>${ep.entry_delay_remaining > 0 ? ` (${ep.entry_delay_remaining}s)` : ''}`).join('<br>')}
                    </div>
                </div>
            `;
            
            // 过滤器
            const showSignals = document.getElementById('filterSignals').checked;
            const showStateChanges = document.getElementById('filterStateChanges').checked;
            const showModeChanges = document.getElementById('filterModeChanges').checked;
            const showUserActions = document.getElementById('filterUserActions').checked;
            
            // 过滤事件
            const events = (eventsData.events || []).filter(e => {
                if (e.type === 'signal' && !showSignals) return false;
                if (e.type === 'state_change' && !showStateChanges) return false;
                if (e.type === 'mode_change' && !showModeChanges) return false;
                if (e.type === 'user_action' && !showUserActions) return false;
                return true;
            });
            
            // 渲染事件列表
            const listEl = document.getElementById('eventList');
            if (events.length === 0) {
                listEl.innerHTML = '<div class="text-gray-500 p-4">No events yet. Trigger some signals to see them here.</div>';
                return;
            }
            
            listEl.innerHTML = events.map(e => {
                const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
                let icon, bgColor, content;
                
                switch(e.type) {
                    case 'signal':
                        icon = '📡';
                        bgColor = 'bg-blue-50 border-blue-200';
                        const resultInfo = e.result ? 
                            `<span class="text-purple-600">${e.result.from_state} → ${e.result.to_state}</span> (${e.result.reason})` :
                            '<span class="text-gray-500">no state change</span>';
                        content = `
                            <strong>${e.sensor_id}</strong> → <span class="text-blue-600">${e.signal_type}</span>
                            | EP: ${e.entry_point_id} | Zone: ${e.zone_type}
                            ${e.from_inside !== undefined ? `| Dir: ${e.from_inside ? '内→外' : '外→内'}` : ''}
                            <br>
                            Mode: ${e.house_mode}/${e.user_mode} | Result: ${resultInfo}
                            ${e.result?.message ? `<br><span class="text-orange-600">💬 ${e.result.message}</span>` : ''}
                        `;
                        break;
                    case 'state_change':
                        icon = '🔄';
                        bgColor = e.to_state === 'triggered' ? 'bg-red-50 border-red-300' : 
                                  e.to_state === 'pending' ? 'bg-orange-50 border-orange-300' :
                                  'bg-yellow-50 border-yellow-200';
                        content = `
                            <strong>${e.entry_point_id}</strong>: 
                            <span class="text-gray-600">${e.from_state}</span> → 
                            <span class="font-bold ${e.to_state === 'triggered' ? 'text-red-600' : e.to_state === 'quiet' ? 'text-green-600' : 'text-orange-600'}">${e.to_state}</span>
                            ${e.message ? `<br><span class="text-orange-600">💬 ${e.message}</span>` : ''}
                        `;
                        break;
                    case 'mode_change':
                        icon = '🏠';
                        bgColor = 'bg-green-50 border-green-200';
                        content = `
                            Mode: <span class="text-gray-600">${e.old_mode}</span> → <span class="font-bold text-green-600">${e.new_mode}</span>
                            ${e.night_sub_mode ? ` (${e.night_sub_mode})` : ''}
                            | User: ${e.old_user_mode} → ${e.new_user_mode}
                        `;
                        break;
                    case 'user_action':
                        icon = '👆';
                        bgColor = e.success === false ? 'bg-red-50 border-red-200' : 'bg-purple-50 border-purple-200';
                        content = `
                            <strong>${e.action}</strong>
                            ${e.entry_point_id ? ` (${e.entry_point_id})` : ''}
                            ${e.success !== undefined ? `: ${e.success ? '✅' : '❌'}` : ''}
                            ${e.message ? ` - ${e.message}` : ''}
                        `;
                        break;
                    default:
                        icon = '📋';
                        bgColor = 'bg-gray-50 border-gray-200';
                        content = JSON.stringify(e);
                }
                
                return `
                    <div class="p-2 border rounded ${bgColor}">
                        <span class="text-gray-500 text-xs">${time}</span>
                        <span class="ml-2">${icon}</span>
                        <span class="ml-2">${content}</span>
                    </div>
                `;
            }).join('');
        }
        
        async function clearEvents() {
            await fetch('/api/pipeline/events', {method: 'DELETE'});
            refreshEvents();
        }
        
        // Zones
        async function refreshZones() {
            const res = await fetch('/api/zones');
            const data = await res.json();
            const list = document.getElementById('zoneList');
            list.innerHTML = data.zones.map(z => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                        <span class="font-medium">${z.zone_id}</span>
                        <span class="text-gray-500 ml-2">${z.name}</span>
                        <span class="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">${z.zone_type}</span>
                    </div>
                    <button onclick="deleteZone('${z.zone_id}')" class="text-red-500 hover:text-red-700">Delete</button>
                </div>
            `).join('');
        }
        
        function showZoneForm() { document.getElementById('zoneForm').classList.remove('hidden'); }
        function hideZoneForm() { document.getElementById('zoneForm').classList.add('hidden'); }
        
        async function createZone() {
            await fetch('/api/zones', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    zone_id: document.getElementById('zoneId').value,
                    name: document.getElementById('zoneName').value,
                    zone_type: document.getElementById('zoneType').value,
                    location_type: document.getElementById('locationType').value
                })
            });
            hideZoneForm();
            refreshZones();
        }
        
        async function deleteZone(id) {
            await fetch(`/api/zones/${id}`, {method: 'DELETE'});
            refreshZones();
        }
        
        // Entry Points
        async function refreshEntryPoints() {
            const res = await fetch('/api/entry-points');
            const data = await res.json();
            const list = document.getElementById('epList');
            list.innerHTML = data.entry_points.map(ep => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                        <span class="font-medium">${ep.entry_point_id}</span>
                        <span class="text-gray-500 ml-2">${ep.name}</span>
                        <span class="ml-2 text-sm">Delay: ${ep.entry_delay_away_sec}s</span>
                    </div>
                    <button onclick="deleteEntryPoint('${ep.entry_point_id}')" class="text-red-500 hover:text-red-700">Delete</button>
                </div>
            `).join('');
        }
        
        async function showEPForm() {
            // 填充 zone 下拉框 - 允许 entry_exit 和 perimeter 类型
            const res = await fetch('/api/zones');
            const data = await res.json();
            const select = document.getElementById('epZoneId');
            const validTypes = ['entry_exit', 'perimeter'];
            const validZones = data.zones.filter(z => validTypes.includes(z.zone_type));
            select.innerHTML = '<option value="">-- 选择 Zone --</option>' +
                validZones.map(z => 
                    `<option value="${z.zone_id}">${z.name} (${z.zone_type})</option>`
                ).join('');
            if (validZones.length === 0) {
                select.innerHTML = '<option value="">⚠️ 请先创建 entry_exit 或 perimeter 类型的 Zone</option>';
            }
            document.getElementById('epForm').classList.remove('hidden');
        }
        function hideEPForm() { document.getElementById('epForm').classList.add('hidden'); }
        
        async function createEntryPoint() {
            const zoneId = document.getElementById('epZoneId').value;
            if (!zoneId) {
                alert('请选择 Zone');
                return;
            }
            await fetch('/api/entry-points', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    entry_point_id: document.getElementById('epId').value,
                    name: document.getElementById('epName').value,
                    zone_id: zoneId,
                    entry_delay_away_sec: parseInt(document.getElementById('epDelayAway').value)
                })
            });
            hideEPForm();
            refreshEntryPoints();
        }
        
        async function deleteEntryPoint(id) {
            await fetch(`/api/entry-points/${id}`, {method: 'DELETE'});
            refreshEntryPoints();
        }
        
        // Sensors
        let allEntryPoints = [];
        
        async function refreshSensors() {
            // 先获取所有 entry points
            const epRes = await fetch('/api/entry-points');
            const epData = await epRes.json();
            allEntryPoints = epData.entry_points || [];
            
            const res = await fetch('/api/sensors');
            const data = await res.json();
            const list = document.getElementById('sensorList');
            list.innerHTML = data.sensors.map(s => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium">${s.sensor_id}</span>
                        <span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">${s.sensor_type}</span>
                        <span class="text-gray-500">→ ${s.zone_id}</span>
                        <span class="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">${s.zone_type || '?'}</span>
                        <span class="text-sm text-gray-600">EP:</span>
                        <select onchange="updateSensorEP('${s.sensor_id}', this.value)" class="border rounded px-2 py-1 text-sm ${s.entry_point_id ? 'bg-blue-50 border-blue-300' : 'bg-yellow-50 border-yellow-300'}">
                            <option value="">-- 无 --</option>
                            ${allEntryPoints.map(ep => 
                                `<option value="${ep.entry_point_id}" ${s.entry_point_id === ep.entry_point_id ? 'selected' : ''}>${ep.name}</option>`
                            ).join('')}
                        </select>
                        ${!s.entry_point_id ? '<span class="text-yellow-600 text-xs">⚠️ 未绑定</span>' : ''}
                    </div>
                    <button onclick="deleteSensor('${s.sensor_id}')" class="text-red-500 hover:text-red-700">Delete</button>
                </div>
            `).join('');
        }
        
        async function updateSensorEP(sensorId, entryPointId) {
            const res = await fetch(`/api/sensors/${sensorId}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({entry_point_id: entryPointId || null})
            });
            const data = await res.json();
            console.log('Sensor EP updated:', data);
            refreshSensors();
        }
        
        async function showSensorForm() {
            // 填充 zone 下拉框
            const zoneRes = await fetch('/api/zones');
            const zoneData = await zoneRes.json();
            const zoneSelect = document.getElementById('sensorZoneId');
            zoneSelect.innerHTML = '<option value="">-- 选择 Zone --</option>' +
                zoneData.zones.map(z => 
                    `<option value="${z.zone_id}">${z.name} (${z.zone_type})</option>`
                ).join('');
            if (zoneData.zones.length === 0) {
                zoneSelect.innerHTML = '<option value="">⚠️ 请先创建 Zone</option>';
            }
            
            // 填充 entry point 下拉框
            const epRes = await fetch('/api/entry-points');
            const epData = await epRes.json();
            const epSelect = document.getElementById('sensorEPId');
            epSelect.innerHTML = '<option value="">-- 无 --</option>' +
                epData.entry_points.map(ep => 
                    `<option value="${ep.entry_point_id}">${ep.name} (${ep.entry_point_id})</option>`
                ).join('');
            
            document.getElementById('sensorForm').classList.remove('hidden');
        }
        function hideSensorForm() { document.getElementById('sensorForm').classList.add('hidden'); }
        
        async function createSensor() {
            const zoneId = document.getElementById('sensorZoneId').value;
            if (!zoneId) {
                alert('请选择 Zone');
                return;
            }
            await fetch('/api/sensors', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    sensor_id: document.getElementById('sensorId').value,
                    sensor_type: document.getElementById('sensorType').value,
                    zone_id: zoneId,
                    entry_point_id: document.getElementById('sensorEPId').value || null
                })
            });
            hideSensorForm();
            refreshSensors();
        }
        
        async function deleteSensor(id) {
            await fetch(`/api/sensors/${id}`, {method: 'DELETE'});
            refreshSensors();
        }
        
        // Simulate
        // 传感器类型 → 可用信号映射 (匹配后端 sensor_type)
        const SENSOR_SIGNALS = {
            'camera': ['person_detected', 'vehicle_detected'],
            'camera_ai': ['person_detected', 'vehicle_detected'],
            'door_contact': ['door_open', 'door_close'],
            'motion_pir': ['motion_active', 'motion_inactive'],
            'glass_break': ['glass_break'],
            'smoke': ['smoke_detected'],
            'co': ['co_detected'],
        };
        
        let sensorTypeMap = {};  // sensor_id -> sensor_type
        
        async function refreshSensorDropdown() {
            const res = await fetch('/api/sensors');
            const data = await res.json();
            const select = document.getElementById('triggerSensorId');
            
            sensorTypeMap = {};
            data.sensors.forEach(s => {
                sensorTypeMap[s.sensor_id] = s.sensor_type;
            });
            
            select.innerHTML = '<option value="">-- 选择传感器 --</option>' + 
                data.sensors.map(s => `<option value="${s.sensor_id}">${s.sensor_id} (${s.sensor_type})</option>`).join('');
            
            // 清空信号选项
            document.getElementById('triggerSignalType').innerHTML = '<option value="">-- 先选择传感器 --</option>';
        }
        
        function updateSignalOptions() {
            const sensorId = document.getElementById('triggerSensorId').value;
            const signalSelect = document.getElementById('triggerSignalType');
            const directionContainer = document.getElementById('directionContainer');
            
            if (!sensorId) {
                signalSelect.innerHTML = '<option value="">-- 先选择传感器 --</option>';
                directionContainer.style.display = 'none';
                return;
            }
            
            const sensorType = sensorTypeMap[sensorId];
            const signals = SENSOR_SIGNALS[sensorType] || [];
            
            if (signals.length === 0) {
                signalSelect.innerHTML = '<option value="">-- 该传感器无可用信号 --</option>';
            } else {
                signalSelect.innerHTML = signals.map(s => `<option value="${s}">${s}</option>`).join('');
            }
            
            // 只有门磁显示方向选择
            if (sensorType === 'door_contact') {
                directionContainer.style.display = 'block';
            } else {
                directionContainer.style.display = 'none';
            }
        }
        
        async function triggerSensor() {
            const sensorId = document.getElementById('triggerSensorId').value;
            const signalType = document.getElementById('triggerSignalType').value;
            
            if (!sensorId || !signalType) {
                alert('请选择传感器和信号类型');
                return;
            }
            
            const body = {
                sensor_id: sensorId,
                signal_type: signalType,
                confidence: 0.95
            };
            
            // 如果是门磁，检查方向选择
            const sensorType = sensorTypeMap[sensorId];
            if (sensorType === 'door_contact') {
                const direction = document.getElementById('triggerDirection').value;
                if (direction === 'inside') {
                    body.from_inside = true;
                } else if (direction === 'outside') {
                    body.from_inside = false;
                }
                // direction === 'auto' 时不发送 from_inside，让后端自动推断
            }
            
            const res = await fetch('/api/sensors/trigger', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const data = await res.json();
            document.getElementById('triggerResult').textContent = JSON.stringify(data, null, 2);
            refreshStatus();
            refreshEntryPointsSimulate();  // 刷新状态显示
        }
        
        // Entry Point 信号模拟
        async function refreshEntryPointsSimulate() {
            const [epRes, sensorRes, statusRes] = await Promise.all([
                fetch('/api/entry-points'),
                fetch('/api/sensors'),
                fetch('/api/pipeline/status')
            ]);
            const epData = await epRes.json();
            const sensorData = await sensorRes.json();
            const statusData = await statusRes.json();
            
            // 调试：打印到控制台
            console.log('Entry Points:', epData.entry_points);
            console.log('Sensors:', sensorData.sensors);
            console.log('Status entry_points:', statusData.entry_points);
            
            const container = document.getElementById('entryPointsSimulate');
            
            if (!epData.entry_points || epData.entry_points.length === 0) {
                container.innerHTML = '<div class="text-gray-500 p-4 bg-gray-50 rounded">没有 Entry Point。请先在 Entry Points 标签页创建入口点。</div>';
                return;
            }
            
            // 按 entry_point 分组传感器
            const sensorsByEP = {};
            (sensorData.sensors || []).forEach(s => {
                const epId = s.entry_point_id || '_none';
                if (!sensorsByEP[epId]) sensorsByEP[epId] = [];
                sensorsByEP[epId].push(s);
            });
            
            console.log('Sensors by EP:', sensorsByEP);
            
            // Entry point 状态 - 使用合并后的状态
            const epStates = statusData.entry_points || {};
            
            container.innerHTML = epData.entry_points.map(ep => {
                const epState = epStates[ep.entry_point_id] || {state: 'quiet', entry_delay_remaining: 0};
                const currentState = epState.state || 'quiet';
                const stateClass = {
                    'quiet': 'bg-green-100 text-green-800',
                    'attention': 'bg-yellow-100 text-yellow-800',
                    'pre': 'bg-orange-100 text-orange-800',
                    'pending': 'bg-red-100 text-red-800',
                    'triggered': 'bg-red-500 text-white'
                }[currentState] || 'bg-gray-100';
                
                const sensors = sensorsByEP[ep.entry_point_id] || [];
                const hasDoor = sensors.some(s => s.sensor_type === 'door_contact');
                const hasCamera = sensors.some(s => s.sensor_type === 'camera' || s.sensor_type === 'camera_ai');
                const hasPIR = sensors.some(s => s.sensor_type === 'motion_pir');
                const hasGlass = sensors.some(s => s.sensor_type === 'glass_break');
                
                // 倒计时显示
                const countdown = epState.entry_delay_remaining > 0 ? 
                    `<span class="ml-2 text-red-600 font-bold">${epState.entry_delay_remaining}s</span>` : '';
                
                // Cancel 按钮条件
                const showCancel = currentState === 'pre' || currentState === 'pending';
                // Resolve 按钮条件
                const showResolve = currentState === 'triggered';
                
                return `
                <div class="border rounded-lg p-4 ${currentState === 'triggered' ? 'border-red-500 bg-red-50' : currentState === 'pending' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <span class="font-semibold text-lg">${ep.name || ep.entry_point_id}</span>
                            <span class="text-gray-500 text-sm ml-2">(${ep.entry_point_id})</span>
                        </div>
                        <div class="flex items-center">
                            ${countdown}
                            <span class="px-3 py-1 rounded-full text-sm font-medium ml-2 ${stateClass}">
                                ${currentState === 'quiet' ? 'Normal' : currentState.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap gap-2">
                        ${hasCamera ? `
                        <button onclick="triggerEPSignal('${ep.entry_point_id}', 'person')" 
                                class="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                            🚶 Person
                        </button>
                        ` : ''}
                        
                        ${hasDoor ? `
                        <button onclick="triggerEPSignal('${ep.entry_point_id}', 'door_out')" 
                                class="px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm">
                            🚪 Door (外→内)
                        </button>
                        <button onclick="triggerEPSignal('${ep.entry_point_id}', 'door_in')" 
                                class="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm">
                            🚪 Door (内→外)
                        </button>
                        ` : ''}
                        
                        ${hasPIR ? `
                        <button onclick="triggerEPSignal('${ep.entry_point_id}', 'motion')" 
                                class="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm">
                            👣 Motion
                        </button>
                        ` : ''}
                        
                        ${hasGlass ? `
                        <button onclick="triggerEPSignal('${ep.entry_point_id}', 'glass')" 
                                class="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                            💥 Glass
                        </button>
                        ` : ''}
                        
                        ${sensors.length === 0 ? '<span class="text-gray-400 text-sm">无绑定传感器</span>' : ''}
                    </div>
                    
                    <!-- Cancel/Resolve 按钮 (根据状态显示) -->
                    ${(showCancel || showResolve) ? `
                    <div class="mt-3 flex gap-2">
                        ${showCancel ? `
                        <button onclick="cancelEP('${ep.entry_point_id}')" 
                                class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium">
                            ❌ Cancel
                        </button>
                        ` : ''}
                        
                        ${showResolve ? `
                        <button onclick="resolveEP('${ep.entry_point_id}')" 
                                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium">
                            ✅ Resolve
                        </button>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <div class="mt-2 text-xs text-gray-500">
                        传感器: ${sensors.map(s => s.sensor_id).join(', ') || '无'}
                    </div>
                </div>
                `;
            }).join('');
        }
        
        async function cancelEP(entryPointId) {
            const res = await fetch('/api/pipeline/cancel/' + entryPointId, {method: 'POST'});
            const data = await res.json();
            document.getElementById('triggerResult').textContent = JSON.stringify(data, null, 2);
            refreshStatus();
        }
        
        async function resolveEP(entryPointId) {
            const res = await fetch('/api/pipeline/resolve/' + entryPointId, {method: 'POST'});
            const data = await res.json();
            document.getElementById('triggerResult').textContent = JSON.stringify(data, null, 2);
            refreshStatus();
        }
        
        async function triggerEPSignal(entryPointId, signalType) {
            // 找到该 entry point 的传感器
            const sensorRes = await fetch('/api/sensors');
            const sensorData = await sensorRes.json();
            
            const sensors = (sensorData.sensors || []).filter(s => s.entry_point_id === entryPointId);
            
            let sensorId, signal, fromInside;
            
            switch(signalType) {
                case 'person':
                    const cam = sensors.find(s => s.sensor_type === 'camera' || s.sensor_type === 'camera_ai');
                    if (!cam) return alert('该入口没有摄像头');
                    sensorId = cam.sensor_id;
                    signal = 'person_detected';
                    break;
                case 'door_out':
                    const doorOut = sensors.find(s => s.sensor_type === 'door_contact');
                    if (!doorOut) return alert('该入口没有门磁');
                    sensorId = doorOut.sensor_id;
                    signal = 'door_open';
                    fromInside = false;
                    break;
                case 'door_in':
                    const doorIn = sensors.find(s => s.sensor_type === 'door_contact');
                    if (!doorIn) return alert('该入口没有门磁');
                    sensorId = doorIn.sensor_id;
                    signal = 'door_open';
                    fromInside = true;
                    break;
                case 'motion':
                    const pir = sensors.find(s => s.sensor_type === 'motion_pir');
                    if (!pir) return alert('该入口没有PIR传感器');
                    sensorId = pir.sensor_id;
                    signal = 'motion_active';
                    break;
                case 'glass':
                    const glass = sensors.find(s => s.sensor_type === 'glass_break');
                    if (!glass) return alert('该入口没有玻璃破碎传感器');
                    sensorId = glass.sensor_id;
                    signal = 'glass_break';
                    break;
            }
            
            const body = {
                sensor_id: sensorId,
                signal_type: signal,
                confidence: 0.95
            };
            if (fromInside !== undefined) {
                body.from_inside = fromInside;
            }
            
            const res = await fetch('/api/sensors/trigger', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const data = await res.json();
            document.getElementById('triggerResult').textContent = JSON.stringify(data, null, 2);
            refreshStatus();
            refreshEntryPointsSimulate();
        }
        
        // Drills
        async function loadDrills() {
            const res = await fetch('/api/drills/load', {method: 'POST'});
            const data = await res.json();
            renderDrillList(data.cases || []);
        }
        
        function renderDrillList(cases) {
            const list = document.getElementById('drillList');
            list.innerHTML = cases.map(c => `
                <div class="flex items-center p-2 bg-gray-50 rounded">
                    <input type="checkbox" class="drill-check mr-3" value="${c.case_id}">
                    <div class="flex-1">
                        <span class="font-medium">${c.case_id}</span>
                        <span class="text-gray-500 ml-2 text-sm">${c.title}</span>
                    </div>
                    <span class="text-xs text-gray-400">${c.tags?.join(', ') || ''}</span>
                </div>
            `).join('');
        }
        
        async function runAllDrills() {
            const res = await fetch('/api/drills/run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({})
            });
            const data = await res.json();
            showDrillResults(data);
        }
        
        async function runSelectedDrills() {
            const selected = Array.from(document.querySelectorAll('.drill-check:checked')).map(el => el.value);
            if (selected.length === 0) return alert('Select at least one drill case');
            
            const res = await fetch('/api/drills/run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({case_ids: selected})
            });
            const data = await res.json();
            showDrillResults(data);
        }
        
        function showDrillResults(data) {
            const sum = data.summary;
            document.getElementById('drillSummary').classList.remove('hidden');
            document.getElementById('drillTotal').textContent = sum.total;
            document.getElementById('drillPassed').textContent = sum.passed;
            document.getElementById('drillFailed').textContent = sum.failed;
            document.getElementById('drillRate').textContent = sum.pass_rate;
            
            const list = document.getElementById('drillList');
            list.innerHTML = data.results.map(r => `
                <div class="p-3 rounded ${r.passed ? 'bg-green-50' : 'bg-red-50'}">
                    <div class="flex justify-between">
                        <span class="font-medium">${r.case_id}</span>
                        <span class="${r.passed ? 'text-green-600' : 'text-red-600'}">${r.passed ? '✓ PASS' : '✗ FAIL'}</span>
                    </div>
                    ${r.failures.length > 0 ? `<div class="text-sm text-red-700 mt-1">${r.failures.join('<br>')}</div>` : ''}
                    <div class="text-xs text-gray-500 mt-1">States: ${r.transitions.map(t => t.state).join(' → ')}</div>
                </div>
            `).join('');
        }
        
        // 加载标准配置
        async function loadStandardConfig() {
            const msg = '加载标准配置将清除所有现有配置。' + '\\n\\n' + 
                        '包含:' + '\\n' +
                        '• 后院摄像头' + '\\n' +
                        '• 后门门磁' + '\\n' +
                        '• 客厅PIR' + '\\n' +
                        '• 窗户玻璃破碎' + '\\n\\n' +
                        '确定继续？';
            
            if (!confirm(msg)) {
                return;
            }
            
            try {
                const response = await fetch('/api/load-standard-config', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'}
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    const successMsg = '✓ ' + data.message + '\\n\\n' +
                                      '区域: ' + data.details.zones + '\\n' +
                                      '入口点: ' + data.details.entry_points + '\\n' +
                                      '传感器: ' + data.details.sensors;
                    alert(successMsg);
                    
                    await Promise.all([
                        refreshZones(),
                        refreshEntryPoints(),
                        refreshSensors(),
                        refreshStatus()
                    ]);
                } else {
                    alert('❌ 加载失败: ' + (data.detail || '未知错误'));
                }
            } catch (error) {
                alert('❌ 网络错误: ' + error.message);
            }
        }
    </script>
</body>
</html>
"""
