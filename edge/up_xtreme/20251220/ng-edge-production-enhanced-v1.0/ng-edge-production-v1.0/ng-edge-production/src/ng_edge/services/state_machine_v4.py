"""
独立状态机架构 v4

Quiet Mode 行为矩阵：
| Signal/Mode      | DISARMED | HOME | AWAY    | NIGHT_OCC | NIGHT_PERI |
|------------------|----------|------|---------|-----------|------------|
| exterior person  | QUIET    |*链条a| PRE     | PRE       | PRE        |
| door open        | QUIET    |*方向a| PENDING | *方向b    | TRIGGERED  |
| interior motion  | QUIET    | QUIET| TRIGGER | QUIET     | TRIGGERED  |
| glass break      | QUIET    | TRIG | TRIGGER | TRIGGERED | TRIGGERED  |

*链条a: exterior person 记录，等待 door open
*方向a: 外→内配合exterior person=ATTENTION→QUIET, 其余=QUIET
*方向b: 外→内=PENDING, 内→外=PRE

状态定义：
- QUIET: 正常状态（初始/结束状态）
- ATTENTION: 注意状态（记录后立即回QUIET）
- PRE: 预警状态（需要Cancel→记录→QUIET）
- PENDING: 倒计时（Cancel→记录→QUIET, 超时→TRIGGERED）
- TRIGGERED: 报警触发（Resolve→记录→QUIET）
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Optional, Callable, List, Dict, Any
import uuid


# =============================================================================
# 枚举定义
# =============================================================================

class AlarmState(str, Enum):
    """报警状态"""
    QUIET = "quiet"            # 正常/静默状态
    ATTENTION = "attention"    # 注意状态（记录后立即回QUIET）
    PRE = "pre"                # 预警状态
    PENDING = "pending"        # 倒计时
    TRIGGERED = "triggered"    # 报警触发


class UserMode(str, Enum):
    """用户选择的报警模式"""
    ALERT = "alert"  # 警觉模式 - 更多提醒
    QUIET = "quiet"  # 安静模式 - 减少打扰


class ZoneType(str, Enum):
    """区域类型"""
    EXTERIOR = "exterior"       # 户外（摄像头）
    ENTRY_EXIT = "entry_exit"   # 出入口（门磁）
    INTERIOR = "interior"       # 室内（PIR）
    PERIMETER = "perimeter"     # 周界


class SensorType(str, Enum):
    """传感器类型"""
    CAMERA = "camera"
    DOOR_CONTACT = "door_contact"
    PIR = "pir"
    GLASS_BREAK = "glass_break"


class SignalType(str, Enum):
    """信号类型"""
    PERSON_DETECTED = "person_detected"
    VEHICLE_DETECTED = "vehicle_detected"
    DOOR_OPEN = "door_open"
    DOOR_CLOSE = "door_close"
    MOTION_ACTIVE = "motion_active"
    MOTION_INACTIVE = "motion_inactive"
    GLASS_BREAK = "glass_break"


# =============================================================================
# 信号数据结构
# =============================================================================

@dataclass
class Signal:
    """传感器信号"""
    zone_type: ZoneType
    sensor_type: SensorType
    signal_type: SignalType
    from_inside: bool = False  # 门磁方向：True=从里面开门
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    signal_id: str = field(default_factory=lambda: f"sig_{uuid.uuid4().hex[:8]}")


@dataclass
class TransitionResult:
    """状态转换结果"""
    success: bool
    from_state: AlarmState
    to_state: AlarmState
    reason: str
    message: Optional[str] = None  # 用户提示消息
    event_record: Optional['EventRecord'] = None


@dataclass
class EventRecord:
    """事件记录"""
    event_id: str
    start_time: datetime
    end_time: datetime
    start_state: AlarmState
    end_state: AlarmState
    end_reason: str  # "canceled", "resolved", "attention_logged"
    signals: List[Signal] = field(default_factory=list)


# =============================================================================
# 事件存储
# =============================================================================

class EventStore:
    """事件存储（单例模式）"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._events = []
        return cls._instance
    
    def save(self, record: EventRecord):
        self._events.append(record)
    
    def get_all(self) -> List[EventRecord]:
        return list(self._events)
    
    def get_recent(self, n: int = 10) -> List[EventRecord]:
        return self._events[-n:]
    
    def clear(self):
        self._events.clear()


# =============================================================================
# 抽象状态机基类
# =============================================================================

class ModeStateMachine(ABC):
    """模式状态机抽象基类"""
    
    def __init__(
        self,
        user_mode: UserMode = UserMode.QUIET,
        entry_delay_sec: int = 30,
        on_attention: Optional[Callable[[str, Signal], None]] = None,
        on_pre_alert: Optional[Callable[[str], None]] = None,
        on_pending_started: Optional[Callable[[int], None]] = None,
        on_triggered: Optional[Callable[[str], None]] = None,
    ):
        self._state = AlarmState.QUIET
        self._user_mode = user_mode
        self._entry_delay_sec = entry_delay_sec
        self._pending_started_at: Optional[datetime] = None
        self._event_start_time: Optional[datetime] = None
        self._event_signals: List[Signal] = []
        self._event_store = EventStore()
        
        # 用于 HOME 模式的链条检测
        self._recent_exterior_person: Optional[datetime] = None
        self._exterior_person_window_sec = 30  # 30秒窗口
        
        # 回调
        self.on_attention = on_attention
        self.on_pre_alert = on_pre_alert
        self.on_pending_started = on_pending_started
        self.on_triggered = on_triggered
    
    @property
    def state(self) -> AlarmState:
        return self._state
    
    @property
    def user_mode(self) -> UserMode:
        return self._user_mode
    
    def set_user_mode(self, mode: UserMode):
        self._user_mode = mode
    
    @abstractmethod
    def process(self, signal: Signal) -> TransitionResult:
        """处理信号，返回状态转换结果"""
        pass
    
    def cancel(self) -> TransitionResult:
        """取消预警/倒计时"""
        if self._state == AlarmState.PRE:
            return self._record_and_return_quiet("canceled", "PRE canceled by user")
        elif self._state == AlarmState.PENDING:
            return self._record_and_return_quiet("canceled", "PENDING canceled by user")
        else:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                reason=f"Cannot cancel from {self._state.value}",
            )
    
    def resolve(self) -> TransitionResult:
        """解除报警"""
        if self._state == AlarmState.TRIGGERED:
            return self._record_and_return_quiet("resolved", "TRIGGERED resolved by user")
        else:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                reason=f"Cannot resolve from {self._state.value}, only TRIGGERED can be resolved",
            )
    
    def trigger_entry_delay_expired(self) -> TransitionResult:
        """入口延迟超时"""
        if self._state == AlarmState.PENDING:
            from_state = self._state
            self._state = AlarmState.TRIGGERED
            if self.on_triggered:
                self.on_triggered("Entry delay expired - ALARM!")
            return TransitionResult(
                success=True,
                from_state=from_state,
                to_state=AlarmState.TRIGGERED,
                reason="Entry delay expired",
                message="⚠️ ALARM TRIGGERED!",
            )
        return TransitionResult(
            success=False,
            from_state=self._state,
            to_state=self._state,
            reason="Not in PENDING state",
        )
    
    def reset(self):
        """重置状态机"""
        self._state = AlarmState.QUIET
        self._pending_started_at = None
        self._event_start_time = None
        self._event_signals.clear()
        self._recent_exterior_person = None
    
    # 辅助方法
    def _start_event(self, signal: Signal):
        """开始事件记录"""
        if self._event_start_time is None:
            self._event_start_time = datetime.now(timezone.utc)
        self._event_signals.append(signal)
    
    def _record_and_return_quiet(self, end_reason: str, reason: str) -> TransitionResult:
        """记录事件并回到 QUIET"""
        from_state = self._state
        
        # 创建事件记录
        event_record = EventRecord(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            start_time=self._event_start_time or datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            start_state=from_state,
            end_state=AlarmState.QUIET,
            end_reason=end_reason,
            signals=list(self._event_signals),
        )
        self._event_store.save(event_record)
        
        # 重置状态
        self._state = AlarmState.QUIET
        self._pending_started_at = None
        self._event_start_time = None
        self._event_signals.clear()
        
        return TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.QUIET,
            reason=reason,
            event_record=event_record,
        )
    
    def _to_attention(self, signal: Signal, message: str) -> TransitionResult:
        """转到 ATTENTION 状态，记录后立即回 QUIET"""
        self._start_event(signal)
        
        # 记录事件
        event_record = EventRecord(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            start_time=self._event_start_time or datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            start_state=AlarmState.QUIET,
            end_state=AlarmState.QUIET,
            end_reason="attention_logged",
            signals=list(self._event_signals),
        )
        self._event_store.save(event_record)
        
        # 触发回调
        if self.on_attention:
            self.on_attention(message, signal)
        
        # 清理
        self._event_start_time = None
        self._event_signals.clear()
        
        return TransitionResult(
            success=True,
            from_state=AlarmState.QUIET,
            to_state=AlarmState.QUIET,
            reason="ATTENTION logged and returned to QUIET",
            message=message,
            event_record=event_record,
        )
    
    def _to_pre(self, signal: Signal, message: str) -> TransitionResult:
        """转到 PRE 状态"""
        from_state = self._state
        self._state = AlarmState.PRE
        self._start_event(signal)
        if self.on_pre_alert:
            self.on_pre_alert(message)
        return TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.PRE,
            reason="Entered PRE state",
            message=message,
        )
    
    def _to_pending(self, signal: Signal, message: str) -> TransitionResult:
        """转到 PENDING 状态"""
        from_state = self._state
        self._state = AlarmState.PENDING
        self._pending_started_at = datetime.now(timezone.utc)
        self._start_event(signal)
        if self.on_pending_started:
            self.on_pending_started(self._entry_delay_sec)
        return TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.PENDING,
            reason=f"Entered PENDING state, {self._entry_delay_sec}s countdown",
            message=message,
        )
    
    def _to_triggered(self, signal: Signal, message: str) -> TransitionResult:
        """转到 TRIGGERED 状态"""
        from_state = self._state
        self._state = AlarmState.TRIGGERED
        self._start_event(signal)
        if self.on_triggered:
            self.on_triggered(message)
        return TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.TRIGGERED,
            reason="TRIGGERED!",
            message=message,
        )
    
    def _stay_quiet(self, reason: str = "Signal ignored") -> TransitionResult:
        """保持 QUIET 状态"""
        return TransitionResult(
            success=True,
            from_state=AlarmState.QUIET,
            to_state=AlarmState.QUIET,
            reason=reason,
        )
    
    def _check_exterior_person_chain(self) -> bool:
        """检查是否在窗口期内有 exterior person 信号"""
        if self._recent_exterior_person is None:
            return False
        elapsed = (datetime.now(timezone.utc) - self._recent_exterior_person).total_seconds()
        return elapsed <= self._exterior_person_window_sec


# =============================================================================
# 各模式状态机实现
# =============================================================================

class DisarmedStateMachine(ModeStateMachine):
    """DISARMED 模式 - 所有信号忽略（glass_break 除外？）"""
    
    def process(self, signal: Signal) -> TransitionResult:
        # DISARMED 模式忽略所有信号
        return self._stay_quiet("DISARMED mode - all signals ignored")


class HomeStateMachine(ModeStateMachine):
    """
    HOME 模式
    
    行为：
    - exterior person: 记录，等待 door open 链条
    - door open: 
      - 从外面 + 有 exterior person 链条 = ATTENTION → QUIET
      - 其余 = QUIET
    - interior motion: QUIET
    - glass break: TRIGGERED
    """
    
    def process(self, signal: Signal) -> TransitionResult:
        # Glass break 直接触发报警
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎检测到!")
        
        # Exterior person - 记录时间，等待 door open
        if (signal.zone_type == ZoneType.EXTERIOR and 
            signal.signal_type == SignalType.PERSON_DETECTED):
            self._recent_exterior_person = datetime.now(timezone.utc)
            return self._stay_quiet("Exterior person recorded, waiting for door chain")
        
        # Door open
        if signal.signal_type == SignalType.DOOR_OPEN:
            # 从外面开门 + 有 exterior person 链条
            if not signal.from_inside and self._check_exterior_person_chain():
                self._recent_exterior_person = None  # 清除链条
                return self._to_attention(signal, "👋 有人从外面进来")
            else:
                # 其余情况（从里面开门，或没有 exterior person 链条）
                return self._stay_quiet("Door activity ignored in HOME mode")
        
        # Interior motion - 忽略
        if (signal.zone_type == ZoneType.INTERIOR and 
            signal.signal_type == SignalType.MOTION_ACTIVE):
            return self._stay_quiet("Interior motion ignored in HOME mode")
        
        # 其他信号忽略
        return self._stay_quiet("Signal ignored in HOME mode")


class AwayStateMachine(ModeStateMachine):
    """
    AWAY 模式
    
    行为：
    - exterior person: PRE
    - door open: PENDING (30秒倒计时)
    - interior motion: TRIGGERED
    - glass break: TRIGGERED
    """
    
    def process(self, signal: Signal) -> TransitionResult:
        # 如果已经在非 QUIET 状态，根据当前状态处理
        if self._state == AlarmState.PRE:
            # PRE 状态下，门打开升级到 PENDING
            if signal.signal_type == SignalType.DOOR_OPEN:
                return self._to_pending(signal, "⏱️ 入侵检测，请在30秒内输入密码")
            # 室内移动或玻璃破碎升级到 TRIGGERED
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
        
        if self._state == AlarmState.PENDING:
            # PENDING 状态下，室内移动或玻璃破碎立即触发
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
        
        if self._state == AlarmState.TRIGGERED:
            # 已触发，记录更多信号
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态下的处理
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if (signal.zone_type == ZoneType.INTERIOR and 
            signal.signal_type == SignalType.MOTION_ACTIVE):
            return self._to_triggered(signal, "🚨 室内移动检测!")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            return self._to_pending(signal, "⏱️ 门被打开，请在30秒内输入密码")
        
        if (signal.zone_type == ZoneType.EXTERIOR and 
            signal.signal_type == SignalType.PERSON_DETECTED):
            return self._to_pre(signal, "⚠️ 外部检测到人员")
        
        return self._stay_quiet("Signal ignored in AWAY mode")


class NightOccupiedStateMachine(ModeStateMachine):
    """
    NIGHT_OCCUPIED 模式
    
    行为：
    - exterior person: PRE
    - door open:
      - 从外面 = PENDING
      - 从里面 = PRE (夜间有人出门)
    - interior motion: QUIET (起夜)
    - glass break: TRIGGERED
    """
    
    def process(self, signal: Signal) -> TransitionResult:
        # 处理非 QUIET 状态
        if self._state == AlarmState.PRE:
            if signal.signal_type == SignalType.DOOR_OPEN and not signal.from_inside:
                return self._to_pending(signal, "⏱️ 外部开门，请输入密码")
            if signal.signal_type == SignalType.GLASS_BREAK:
                return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if self._state == AlarmState.PENDING:
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
        
        if self._state == AlarmState.TRIGGERED:
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if (signal.zone_type == ZoneType.EXTERIOR and 
            signal.signal_type == SignalType.PERSON_DETECTED):
            return self._to_pre(signal, "⚠️ 夜间外部检测到人员")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            if signal.from_inside:
                # 从里面开门 - PRE（夜间有人出门需要注意）
                return self._to_pre(signal, "⚠️ 夜间有人出门")
            else:
                # 从外面开门 - PENDING
                return self._to_pending(signal, "⏱️ 夜间外部开门，请输入密码")
        
        # Interior motion - 忽略（起夜）
        if (signal.zone_type == ZoneType.INTERIOR and 
            signal.signal_type == SignalType.MOTION_ACTIVE):
            return self._stay_quiet("Night motion ignored (起夜)")
        
        return self._stay_quiet("Signal ignored in NIGHT_OCCUPIED mode")


class NightPerimeterStateMachine(ModeStateMachine):
    """
    NIGHT_PERIMETER 模式 - 无延迟，立即触发
    
    行为：
    - exterior person: PRE
    - door open: TRIGGERED (无延迟)
    - interior motion: TRIGGERED
    - glass break: TRIGGERED
    """
    
    def process(self, signal: Signal) -> TransitionResult:
        # 处理非 QUIET 状态
        if self._state in (AlarmState.PRE, AlarmState.PENDING):
            if signal.signal_type in (SignalType.DOOR_OPEN, SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 周界入侵!")
        
        if self._state == AlarmState.TRIGGERED:
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            # 周界模式门打开立即触发
            return self._to_triggered(signal, "🚨 夜间周界入侵 - 门被打开!")
        
        if (signal.zone_type == ZoneType.INTERIOR and 
            signal.signal_type == SignalType.MOTION_ACTIVE):
            return self._to_triggered(signal, "🚨 夜间周界入侵 - 室内移动!")
        
        if (signal.zone_type == ZoneType.EXTERIOR and 
            signal.signal_type == SignalType.PERSON_DETECTED):
            return self._to_pre(signal, "⚠️ 夜间周界检测到人员")
        
        return self._stay_quiet("Signal ignored in NIGHT_PERIMETER mode")


# =============================================================================
# 状态机工厂
# =============================================================================

class StateMachineFactory:
    """状态机工厂"""
    
    @staticmethod
    def create(
        mode: str,
        user_mode: str = "quiet",
        entry_delay_sec: int = 30,
        **kwargs
    ) -> ModeStateMachine:
        """
        创建状态机
        
        Args:
            mode: 模式名称 (disarmed, home, away, night_occupied, night_perimeter)
            user_mode: 用户模式 (alert, quiet)
            entry_delay_sec: 入口延迟秒数
            **kwargs: 回调函数等
        """
        user_mode_enum = UserMode(user_mode) if isinstance(user_mode, str) else user_mode
        
        mode_map = {
            "disarmed": DisarmedStateMachine,
            "home": HomeStateMachine,
            "away": AwayStateMachine,
            "night_occupied": NightOccupiedStateMachine,
            "night_perimeter": NightPerimeterStateMachine,
        }
        
        sm_class = mode_map.get(mode.lower())
        if not sm_class:
            raise ValueError(f"Unknown mode: {mode}")
        
        return sm_class(
            user_mode=user_mode_enum,
            entry_delay_sec=entry_delay_sec,
            **kwargs
        )


# =============================================================================
# 便捷函数
# =============================================================================

def create_signal(
    zone_type: ZoneType,
    sensor_type: SensorType,
    signal_type: SignalType,
    from_inside: bool = False,
) -> Signal:
    """创建信号的便捷函数"""
    return Signal(
        zone_type=zone_type,
        sensor_type=sensor_type,
        signal_type=signal_type,
        from_inside=from_inside,
    )
