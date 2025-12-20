"""
独立状态机架构 v5

新增功能：
1. Alert/Quiet 模式区分
2. 每个 Entry Point 独立状态机
3. 全局协调器

=== Alert Mode 行为矩阵 (更敏感) ===
| Signal/Mode      | DISARMED | HOME | AWAY    | NIGHT_OCC | NIGHT_PERI |
|------------------|----------|------|---------|-----------|------------|
| exterior person  | QUIET    | PRE  | PRE     | PRE       | PRE        |
| door open        | QUIET    | PRE  | PENDING | *方向b    | TRIGGERED  |
| interior motion  | QUIET    | PRE  | TRIGGER | ATTEN     | TRIGGERED  |
| glass break      | QUIET    | TRIG | TRIGGER | TRIGGERED | TRIGGERED  |

*方向b (Alert NIGHT_OCC): 外→内=PENDING, 内→外=PRE (家人出门风险)

=== Quiet Mode 行为矩阵 (减少打扰) ===
| Signal/Mode      | DISARMED | HOME    | AWAY    | NIGHT_OCC | NIGHT_PERI |
|------------------|----------|---------|---------|-----------|------------|
| exterior person  | QUIET    | ATTEN.  | PRE     | PRE       | PRE        |
| door open        | QUIET    | *方向a  | PENDING | *方向b    | TRIGGERED  |
| interior motion  | QUIET    | QUIET   | TRIGGER | QUIET     | TRIGGERED  |
| glass break      | QUIET    | TRIG    | TRIGGER | TRIGGERED | TRIGGERED  |

*方向a (Quiet HOME): 外→内=ATTEN., 内→外=QUIET
*方向b (Quiet NIGHT_OCC): 外→内=PENDING, 内→外=PRE

状态定义：
- QUIET: 正常/静默状态
- ATTENTION: 注意状态（通知后立即回QUIET）
- PRE: 预警状态（Cancel→QUIET）
- PENDING: 倒计时（Cancel→QUIET, 超时→TRIGGERED）
- TRIGGERED: 报警触发（Resolve→QUIET）
"""

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
    QUIET = "quiet"
    ATTENTION = "attention"
    PRE = "pre"
    PENDING = "pending"
    TRIGGERED = "triggered"


class UserMode(str, Enum):
    """用户模式"""
    ALERT = "alert"   # 警觉模式 - 更多提醒
    QUIET = "quiet"   # 安静模式 - 减少打扰


class HouseMode(str, Enum):
    """房屋模式"""
    DISARMED = "disarmed"
    HOME = "home"
    AWAY = "away"
    NIGHT_OCCUPIED = "night_occupied"
    NIGHT_PERIMETER = "night_perimeter"


class ZoneType(str, Enum):
    """区域类型"""
    EXTERIOR = "exterior"
    ENTRY_EXIT = "entry_exit"
    INTERIOR = "interior"
    PERIMETER = "perimeter"


class SignalType(str, Enum):
    """信号类型"""
    PERSON_DETECTED = "person_detected"
    VEHICLE_DETECTED = "vehicle_detected"
    DOOR_OPEN = "door_open"
    DOOR_CLOSE = "door_close"
    MOTION_ACTIVE = "motion_active"
    GLASS_BREAK = "glass_break"


# =============================================================================
# 数据结构
# =============================================================================

@dataclass
class Signal:
    """传感器信号"""
    entry_point_id: str  # 关联的入口点
    zone_type: ZoneType
    signal_type: SignalType
    from_inside: bool = False
    confidence: float = 1.0
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    signal_id: str = field(default_factory=lambda: f"sig_{uuid.uuid4().hex[:8]}")


@dataclass
class TransitionResult:
    """状态转换结果"""
    success: bool
    entry_point_id: str
    from_state: AlarmState
    to_state: AlarmState
    reason: str
    message: Optional[str] = None
    event_record: Optional['EventRecord'] = None


@dataclass
class EventRecord:
    """事件记录"""
    event_id: str
    entry_point_id: str
    start_time: datetime
    end_time: datetime
    start_state: AlarmState
    end_state: AlarmState
    end_reason: str
    signals: List[Signal] = field(default_factory=list)


# =============================================================================
# 单入口状态机
# =============================================================================

class EntryPointStateMachine:
    """
    单个入口点的状态机
    
    每个 Entry Point（门、窗等）有独立的状态机实例
    """
    
    def __init__(
        self,
        entry_point_id: str,
        entry_point_name: str = "",
        house_mode: HouseMode = HouseMode.DISARMED,
        user_mode: UserMode = UserMode.QUIET,
        entry_delay_sec: int = 30,
        on_state_change: Optional[Callable[['EntryPointStateMachine', TransitionResult], None]] = None,
    ):
        self.entry_point_id = entry_point_id
        self.entry_point_name = entry_point_name or entry_point_id
        self._house_mode = house_mode
        self._user_mode = user_mode
        self._entry_delay_sec = entry_delay_sec
        self._state = AlarmState.QUIET
        self._pending_started_at: Optional[datetime] = None
        self._event_start_time: Optional[datetime] = None
        self._event_signals: List[Signal] = []
        self._events: List[EventRecord] = []
        
        # 用于 HOME 模式的链条检测（Quiet 模式特有）
        self._recent_exterior_person: Optional[datetime] = None
        self._chain_window_sec = 30
        
        # 回调
        self.on_state_change = on_state_change
    
    @property
    def state(self) -> AlarmState:
        return self._state
    
    @property
    def house_mode(self) -> HouseMode:
        return self._house_mode
    
    @property
    def user_mode(self) -> UserMode:
        return self._user_mode
    
    def set_modes(self, house_mode: HouseMode, user_mode: UserMode):
        """设置模式并重置状态"""
        self._house_mode = house_mode
        self._user_mode = user_mode
        self.reset()
    
    def process(self, signal: Signal) -> TransitionResult:
        """处理信号"""
        print(f"\n{'='*60}")
        print(f"🎯 [PROCESS] Entry Point: {self.entry_point_id}")
        print(f"  Signal: {signal.signal_type} | Zone: {signal.zone_type}")
        print(f"  Current State: {self._state}")
        print(f"  House Mode: {self._house_mode} | User Mode: {self._user_mode}")
        print(f"{'='*60}")
        
        # 根据 house_mode 和 user_mode 选择处理逻辑
        if self._house_mode == HouseMode.DISARMED:
            print(f"  路由到: _process_disarmed")
            return self._process_disarmed(signal)
        elif self._house_mode == HouseMode.HOME:
            if self._user_mode == UserMode.ALERT:
                print(f"  路由到: _process_home_alert")
                return self._process_home_alert(signal)
            else:
                print(f"  路由到: _process_home_quiet")
                return self._process_home_quiet(signal)
        elif self._house_mode == HouseMode.AWAY:
            print(f"  路由到: _process_away")
            return self._process_away(signal)
        elif self._house_mode == HouseMode.NIGHT_OCCUPIED:
            if self._user_mode == UserMode.ALERT:
                print(f"  路由到: _process_night_occupied_alert")
                return self._process_night_occupied_alert(signal)
            else:
                print(f"  路由到: _process_night_occupied_quiet")
                return self._process_night_occupied_quiet(signal)
        elif self._house_mode == HouseMode.NIGHT_PERIMETER:
            print(f"  路由到: _process_night_perimeter")
            return self._process_night_perimeter(signal)
        else:
            print(f"  ⚠ 未知模式")
            return self._stay_quiet("Unknown mode")
    
    # =========================================================================
    # DISARMED - 所有信号忽略
    # =========================================================================
    
    def _process_disarmed(self, signal: Signal) -> TransitionResult:
        return self._stay_quiet("DISARMED - all signals ignored")
    
    # =========================================================================
    # HOME - Alert 模式 (更多提醒)
    # =========================================================================
    
    def _process_home_alert(self, signal: Signal) -> TransitionResult:
        """HOME + Alert: 任意传感器触发 → PRE"""
        # Glass break 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        # 任意其他传感器 → PRE
        # Exterior person
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            return self._to_pre(signal, "👁️ 外部检测到人")
        
        # Door open
        if signal.signal_type == SignalType.DOOR_OPEN:
            if signal.from_inside:
                return self._to_pre(signal, "🚪 有人出门")
            else:
                return self._to_pre(signal, "🚪 有人进门")
        
        # Interior motion
        if signal.zone_type == ZoneType.INTERIOR and signal.signal_type == SignalType.MOTION_ACTIVE:
            return self._to_pre(signal, "🏠 室内有活动")
        
        return self._stay_quiet("Signal ignored in HOME Alert mode")
    
    # =========================================================================
    # HOME - Quiet 模式 (减少打扰)
    # =========================================================================
    
    def _process_home_quiet(self, signal: Signal) -> TransitionResult:
        """HOME + Quiet: exterior person 和 door(外→内) 直接通知"""
        # Glass break 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        # Exterior person → ATTENTION (直接通知)
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            return self._to_attention(signal, "👁️ 外部检测到人")
        
        # Door open
        if signal.signal_type == SignalType.DOOR_OPEN:
            # 外→内 = ATTENTION
            if not signal.from_inside:
                return self._to_attention(signal, "🚪 有人从外面进来")
            # 内→外 = QUIET (忽略)
            return self._stay_quiet("Interior door opening ignored in HOME Quiet mode")
        
        # Interior motion - 忽略
        return self._stay_quiet("Signal ignored in HOME Quiet mode")
    
    # =========================================================================
    # AWAY - Alert/Quiet 相同
    # =========================================================================
    
    def _process_away(self, signal: Signal) -> TransitionResult:
        """AWAY: 外部人=PRE, 门=PENDING, 室内=TRIGGERED"""
        # 处理非 QUIET 状态
        if self._state == AlarmState.PRE:
            if signal.signal_type == SignalType.DOOR_OPEN:
                return self._to_pending(signal, "⏱️ 入侵检测，请输入密码")
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
            # PRE 状态下的其他信号：保持 PRE，记录
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PRE,
                to_state=AlarmState.PRE,
                reason="Signal recorded in PRE state",
            )
        
        if self._state == AlarmState.PENDING:
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
            # PENDING 状态下的其他信号：保持 PENDING，记录
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PENDING,
                to_state=AlarmState.PENDING,
                reason="Signal recorded in PENDING state",
            )
        
        if self._state == AlarmState.TRIGGERED:
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if signal.zone_type == ZoneType.INTERIOR and signal.signal_type == SignalType.MOTION_ACTIVE:
            return self._to_triggered(signal, "🚨 室内移动检测!")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            return self._to_pending(signal, "⏱️ 门被打开，请输入密码")
        
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            return self._to_pre(signal, "⚠️ 外部检测到人员")
        
        return self._stay_quiet("Signal ignored in AWAY mode")
    
    # =========================================================================
    # NIGHT_OCCUPIED - Alert 模式
    # =========================================================================
    
    def _process_night_occupied_alert(self, signal: Signal) -> TransitionResult:
        """NIGHT_OCC + Alert: 内→外=PRE"""
        # 处理非 QUIET 状态
        if self._state == AlarmState.PRE:
            if signal.signal_type == SignalType.DOOR_OPEN and not signal.from_inside:
                return self._to_pending(signal, "⏱️ 外部开门，请输入密码")
            if signal.signal_type == SignalType.GLASS_BREAK:
                return self._to_triggered(signal, "🚨 玻璃破碎!")
            # PRE 状态下的其他信号：保持 PRE，记录信号
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PRE,
                to_state=AlarmState.PRE,
                reason="Signal recorded in PRE state",
            )
        
        if self._state == AlarmState.PENDING:
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 入侵确认!")
            # PENDING 状态下的其他信号：保持 PENDING，记录信号
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PENDING,
                to_state=AlarmState.PENDING,
                reason="Signal recorded in PENDING state",
            )
        
        if self._state == AlarmState.TRIGGERED:
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            return self._to_pre(signal, "⚠️ 夜间外部检测到人员")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            if signal.from_inside:
                # Alert 模式：内→外 = PRE (家里有人出门，孩子丢失风险)
                return self._to_pre(signal, "🌙 夜间有人出门")
            else:
                return self._to_pending(signal, "⏱️ 夜间外部开门")
        
        # Interior motion - Alert 模式 → ATTENTION
        if signal.zone_type == ZoneType.INTERIOR and signal.signal_type == SignalType.MOTION_ACTIVE:
            return self._to_attention(signal, "🌙 夜间室内活动")
        
        return self._stay_quiet("Signal ignored in NIGHT_OCC Alert mode")
    
    # =========================================================================
    # NIGHT_OCCUPIED - Quiet 模式
    # =========================================================================
    
    def _process_night_occupied_quiet(self, signal: Signal) -> TransitionResult:
        """NIGHT_OCC + Quiet: 内→外=PRE, 起夜忽略"""
        # ========== DEBUG: 打印详细信息 ==========
        print(f"\n🔍 [DEBUG] _process_night_occupied_quiet called")
        print(f"  Entry Point: {self.entry_point_id}")
        print(f"  Current State: {self._state}")
        print(f"  Signal Type: {signal.signal_type}")
        print(f"  Zone Type: {signal.zone_type}")
        print(f"  From Inside: {signal.from_inside}")
        print(f"  House Mode: {self._house_mode}")
        print(f"  User Mode: {self._user_mode}")
        
        # 处理非 QUIET 状态
        if self._state == AlarmState.PRE:
            print(f"  → 进入 PRE 分支")
            if signal.signal_type == SignalType.DOOR_OPEN and not signal.from_inside:
                print(f"  ✓ 匹配: DOOR_OPEN 外→内，转换到 PENDING")
                return self._to_pending(signal, "⏱️ 外部开门，请输入密码")
            if signal.signal_type == SignalType.GLASS_BREAK:
                print(f"  ✓ 匹配: GLASS_BREAK，直接 TRIGGERED")
                return self._to_triggered(signal, "🚨 玻璃破碎!")
            # PRE 状态下的其他信号：保持 PRE，记录信号
            print(f"  ⚠ 未匹配特定升级条件，保持 PRE 状态")
            self._event_signals.append(signal)
            result = TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PRE,
                to_state=AlarmState.PRE,
                reason="Signal recorded in PRE state",
            )
            print(f"  返回: {result.from_state} → {result.to_state}")
            return result
        
        if self._state == AlarmState.PENDING:
            print(f"  → 进入 PENDING 分支")
            print(f"  检查条件: signal.signal_type={signal.signal_type} (type: {type(signal.signal_type)})")
            print(f"  检查条件: SignalType.MOTION_ACTIVE={SignalType.MOTION_ACTIVE} (type: {type(SignalType.MOTION_ACTIVE)})")
            print(f"  相等比较: {signal.signal_type == SignalType.MOTION_ACTIVE}")
            print(f"  in 比较: {signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK)}")
            
            if signal.signal_type in (SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                print(f"  ✓✓✓ 条件匹配！调用 _to_triggered")
                result = self._to_triggered(signal, "🚨 入侵确认!")
                print(f"  _to_triggered 返回: {result.from_state} → {result.to_state}")
                return result
            # PENDING 状态下的其他信号：保持 PENDING，记录信号
            print(f"  ⚠ 未匹配升级条件，保持 PENDING")
            self._event_signals.append(signal)
            result = TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.PENDING,
                to_state=AlarmState.PENDING,
                reason="Signal recorded in PENDING state",
            )
            print(f"  返回: {result.from_state} → {result.to_state}")
            return result
        
        if self._state == AlarmState.TRIGGERED:
            print(f"  → 进入 TRIGGERED 分支（已触发，记录额外信号）")
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        print(f"  → 当前状态为 QUIET，处理 QUIET 状态逻辑")
        if signal.signal_type == SignalType.GLASS_BREAK:
            print(f"  ✓ GLASS_BREAK，直接 TRIGGERED")
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            print(f"  ✓ 外部人员检测，转换到 PRE")
            return self._to_pre(signal, "⚠️ 夜间外部检测到人员")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            if signal.from_inside:
                # Quiet 模式：内→外 = PRE
                print(f"  ✓ 门从内→外，转换到 PRE")
                return self._to_pre(signal, "⚠️ 夜间有人出门")
            else:
                print(f"  ✓ 门从外→内，转换到 PENDING")
                return self._to_pending(signal, "⏱️ 夜间外部开门")
        
        # Interior motion - Quiet 模式忽略（起夜）
        print(f"  ⚠ 未匹配任何条件，返回 _stay_quiet")
        result = self._stay_quiet("Night motion ignored (起夜)")
        print(f"  返回: {result.from_state} → {result.to_state}")
        return result
    
    # =========================================================================
    # NIGHT_PERIMETER - 无延迟，立即触发
    # =========================================================================
    
    def _process_night_perimeter(self, signal: Signal) -> TransitionResult:
        """NIGHT_PERIMETER: 门/室内移动 = TRIGGERED"""
        # 处理非 QUIET 状态
        if self._state in (AlarmState.PRE, AlarmState.PENDING):
            if signal.signal_type in (SignalType.DOOR_OPEN, SignalType.MOTION_ACTIVE, SignalType.GLASS_BREAK):
                return self._to_triggered(signal, "🚨 周界入侵!")
        
        if self._state == AlarmState.TRIGGERED:
            self._event_signals.append(signal)
            return TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=AlarmState.TRIGGERED,
                to_state=AlarmState.TRIGGERED,
                reason="Additional signal recorded",
            )
        
        # QUIET 状态
        if signal.signal_type == SignalType.GLASS_BREAK:
            return self._to_triggered(signal, "🚨 玻璃破碎!")
        
        if signal.signal_type == SignalType.DOOR_OPEN:
            return self._to_triggered(signal, "🚨 夜间周界入侵 - 门被打开!")
        
        if signal.zone_type == ZoneType.INTERIOR and signal.signal_type == SignalType.MOTION_ACTIVE:
            return self._to_triggered(signal, "🚨 夜间周界入侵 - 室内移动!")
        
        if signal.zone_type == ZoneType.EXTERIOR and signal.signal_type == SignalType.PERSON_DETECTED:
            return self._to_pre(signal, "⚠️ 夜间周界检测到人员")
        
        return self._stay_quiet("Signal ignored in NIGHT_PERIMETER mode")
    
    # =========================================================================
    # 用户操作
    # =========================================================================
    
    def cancel(self) -> TransitionResult:
        """取消 PRE/PENDING"""
        if self._state in (AlarmState.PRE, AlarmState.PENDING):
            return self._record_and_return_quiet("canceled", f"{self._state.value} canceled by user")
        return TransitionResult(
            success=False,
            entry_point_id=self.entry_point_id,
            from_state=self._state,
            to_state=self._state,
            reason=f"Cannot cancel from {self._state.value}",
        )
    
    def resolve(self) -> TransitionResult:
        """解除 TRIGGERED"""
        if self._state == AlarmState.TRIGGERED:
            return self._record_and_return_quiet("resolved", "TRIGGERED resolved by user")
        return TransitionResult(
            success=False,
            entry_point_id=self.entry_point_id,
            from_state=self._state,
            to_state=self._state,
            reason=f"Cannot resolve from {self._state.value}",
        )
    
    def trigger_entry_delay_expired(self) -> TransitionResult:
        """入口延迟超时"""
        if self._state == AlarmState.PENDING:
            from_state = self._state
            self._state = AlarmState.TRIGGERED
            result = TransitionResult(
                success=True,
                entry_point_id=self.entry_point_id,
                from_state=from_state,
                to_state=AlarmState.TRIGGERED,
                reason="Entry delay expired",
                message="⚠️ ALARM TRIGGERED!",
            )
            if self.on_state_change:
                self.on_state_change(self, result)
            return result
        return TransitionResult(
            success=False,
            entry_point_id=self.entry_point_id,
            from_state=self._state,
            to_state=self._state,
            reason="Not in PENDING state",
        )
    
    def reset(self):
        """重置状态"""
        self._state = AlarmState.QUIET
        self._pending_started_at = None
        self._event_start_time = None
        self._event_signals.clear()
        self._recent_exterior_person = None
    
    # =========================================================================
    # 辅助方法
    # =========================================================================
    
    def _check_chain(self) -> bool:
        """检查是否在链条窗口期内"""
        if self._recent_exterior_person is None:
            return False
        elapsed = (datetime.now(timezone.utc) - self._recent_exterior_person).total_seconds()
        return elapsed <= self._chain_window_sec
    
    def _start_event(self, signal: Signal):
        if self._event_start_time is None:
            self._event_start_time = datetime.now(timezone.utc)
        self._event_signals.append(signal)
    
    def _record_and_return_quiet(self, end_reason: str, reason: str) -> TransitionResult:
        from_state = self._state
        
        event_record = EventRecord(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            entry_point_id=self.entry_point_id,
            start_time=self._event_start_time or datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            start_state=from_state,
            end_state=AlarmState.QUIET,
            end_reason=end_reason,
            signals=list(self._event_signals),
        )
        self._events.append(event_record)
        
        self._state = AlarmState.QUIET
        self._pending_started_at = None
        self._event_start_time = None
        self._event_signals.clear()
        
        result = TransitionResult(
            success=True,
            entry_point_id=self.entry_point_id,
            from_state=from_state,
            to_state=AlarmState.QUIET,
            reason=reason,
            event_record=event_record,
        )
        if self.on_state_change:
            self.on_state_change(self, result)
        return result
    
    def _to_attention(self, signal: Signal, message: str) -> TransitionResult:
        self._start_event(signal)
        
        event_record = EventRecord(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            entry_point_id=self.entry_point_id,
            start_time=self._event_start_time or datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            start_state=AlarmState.QUIET,
            end_state=AlarmState.QUIET,
            end_reason="attention_logged",
            signals=list(self._event_signals),
        )
        self._events.append(event_record)
        
        self._event_start_time = None
        self._event_signals.clear()
        
        result = TransitionResult(
            success=True,
            entry_point_id=self.entry_point_id,
            from_state=AlarmState.QUIET,
            to_state=AlarmState.QUIET,
            reason="ATTENTION logged",
            message=message,
            event_record=event_record,
        )
        if self.on_state_change:
            self.on_state_change(self, result)
        return result
    
    def _to_pre(self, signal: Signal, message: str) -> TransitionResult:
        from_state = self._state
        self._state = AlarmState.PRE
        self._start_event(signal)
        result = TransitionResult(
            success=True,
            entry_point_id=self.entry_point_id,
            from_state=from_state,
            to_state=AlarmState.PRE,
            reason="Entered PRE state",
            message=message,
        )
        if self.on_state_change:
            self.on_state_change(self, result)
        return result
    
    def _to_pending(self, signal: Signal, message: str) -> TransitionResult:
        from_state = self._state
        self._state = AlarmState.PENDING
        self._pending_started_at = datetime.now(timezone.utc)
        self._start_event(signal)
        result = TransitionResult(
            success=True,
            entry_point_id=self.entry_point_id,
            from_state=from_state,
            to_state=AlarmState.PENDING,
            reason=f"Entered PENDING ({self._entry_delay_sec}s countdown)",
            message=message,
        )
        if self.on_state_change:
            self.on_state_change(self, result)
        return result
    
    def _to_triggered(self, signal: Signal, message: str) -> TransitionResult:
        from_state = self._state
        self._state = AlarmState.TRIGGERED
        self._start_event(signal)
        result = TransitionResult(
            success=True,
            entry_point_id=self.entry_point_id,
            from_state=from_state,
            to_state=AlarmState.TRIGGERED,
            reason="TRIGGERED!",
            message=message,
        )
        if self.on_state_change:
            self.on_state_change(self, result)
        return result
    
    def _stay_quiet(self, reason: str) -> TransitionResult:
        return TransitionResult(
            success=False,  # 信号未被接受/忽略
            entry_point_id=self.entry_point_id,
            from_state=self._state,  # 使用当前实际状态
            to_state=self._state,    # 保持当前状态  
            reason=reason,
        )


# =============================================================================
# 全局协调器
# =============================================================================

class SecurityCoordinator:
    """
    全局安全协调器
    
    管理所有 Entry Point 的状态机，提供统一接口
    """
    
    def __init__(
        self,
        house_mode: HouseMode = HouseMode.DISARMED,
        user_mode: UserMode = UserMode.QUIET,
        entry_delay_sec: int = 30,
        on_global_state_change: Optional[Callable[[str, TransitionResult], None]] = None,
    ):
        self._house_mode = house_mode
        self._user_mode = user_mode
        self._entry_delay_sec = entry_delay_sec
        self._entry_points: Dict[str, EntryPointStateMachine] = {}
        self._global_events: List[EventRecord] = []
        self.on_global_state_change = on_global_state_change
        
        # 创建默认的全局入口（用于非入口点信号）
        self._create_entry_point("_global", "Global")
    
    def _on_entry_state_change(self, sm: EntryPointStateMachine, result: TransitionResult):
        """入口状态变化回调"""
        if result.event_record:
            self._global_events.append(result.event_record)
        if self.on_global_state_change:
            self.on_global_state_change(sm.entry_point_id, result)
    
    def _create_entry_point(self, entry_point_id: str, name: str = "", entry_delay_sec: int = None) -> EntryPointStateMachine:
        """创建入口状态机"""
        delay = entry_delay_sec if entry_delay_sec is not None else self._entry_delay_sec
        sm = EntryPointStateMachine(
            entry_point_id=entry_point_id,
            entry_point_name=name or entry_point_id,
            house_mode=self._house_mode,  # 使用当前模式！
            user_mode=self._user_mode,    # 使用当前模式！
            entry_delay_sec=delay,
            on_state_change=self._on_entry_state_change,
        )
        self._entry_points[entry_point_id] = sm
        return sm
    
    def register_entry_point(self, entry_point_id: str, name: str = "", entry_delay_sec: int = None) -> EntryPointStateMachine:
        """注册入口点"""
        if entry_point_id in self._entry_points:
            # 更新已存在的入口点的名称和延时
            sm = self._entry_points[entry_point_id]
            sm.entry_point_name = name or entry_point_id
            if entry_delay_sec is not None:
                sm._entry_delay_sec = entry_delay_sec
            # 只在模式不同步时才调用 set_modes（避免重置状态）
            if sm._house_mode != self._house_mode or sm._user_mode != self._user_mode:
                print(f"⚠️ [SYNC] Entry Point {entry_point_id} 模式不同步，同步模式")
                sm.set_modes(self._house_mode, self._user_mode)
            return sm
        return self._create_entry_point(entry_point_id, name, entry_delay_sec)
    
    def get_entry_point(self, entry_point_id: str) -> Optional[EntryPointStateMachine]:
        """获取入口状态机"""
        return self._entry_points.get(entry_point_id)
    
    def set_modes(self, house_mode: HouseMode, user_mode: UserMode):
        """设置全局模式"""
        self._house_mode = house_mode
        self._user_mode = user_mode
        for sm in self._entry_points.values():
            sm.set_modes(house_mode, user_mode)
    
    @property
    def house_mode(self) -> HouseMode:
        return self._house_mode
    
    @property
    def user_mode(self) -> UserMode:
        return self._user_mode
    
    def process(self, signal: Signal) -> TransitionResult:
        """处理信号，路由到对应的入口状态机"""
        entry_point_id = signal.entry_point_id or "_global"
        
        # 自动创建入口点（如果不存在）
        if entry_point_id not in self._entry_points:
            self._create_entry_point(entry_point_id)
        
        sm = self._entry_points[entry_point_id]
        return sm.process(signal)
    
    def cancel(self, entry_point_id: str = "_global") -> TransitionResult:
        """取消指定入口的报警"""
        sm = self._entry_points.get(entry_point_id)
        if not sm:
            return TransitionResult(
                success=False,
                entry_point_id=entry_point_id,
                from_state=AlarmState.QUIET,
                to_state=AlarmState.QUIET,
                reason=f"Entry point not found: {entry_point_id}",
            )
        return sm.cancel()
    
    def cancel_all(self) -> List[TransitionResult]:
        """取消所有入口的报警"""
        results = []
        for sm in self._entry_points.values():
            if sm.state in (AlarmState.PRE, AlarmState.PENDING):
                results.append(sm.cancel())
        return results
    
    def resolve(self, entry_point_id: str = "_global") -> TransitionResult:
        """解除指定入口的报警"""
        sm = self._entry_points.get(entry_point_id)
        if not sm:
            return TransitionResult(
                success=False,
                entry_point_id=entry_point_id,
                from_state=AlarmState.QUIET,
                to_state=AlarmState.QUIET,
                reason=f"Entry point not found: {entry_point_id}",
            )
        return sm.resolve()
    
    def resolve_all(self) -> List[TransitionResult]:
        """解除所有入口的报警"""
        results = []
        for sm in self._entry_points.values():
            if sm.state == AlarmState.TRIGGERED:
                results.append(sm.resolve())
        return results
    
    def reset(self):
        """重置所有状态"""
        for sm in self._entry_points.values():
            sm.reset()
        self._global_events.clear()
    
    def get_status(self) -> Dict[str, Any]:
        """获取全局状态"""
        entry_states = {}
        highest_state = AlarmState.QUIET
        priority = {
            AlarmState.QUIET: 0,
            AlarmState.ATTENTION: 1,
            AlarmState.PRE: 2,
            AlarmState.PENDING: 3,
            AlarmState.TRIGGERED: 4,
        }
        
        for ep_id, sm in self._entry_points.items():
            # _global 不显示在 entry_states 列表中，但参与 highest_state 计算
            if priority[sm.state] > priority[highest_state]:
                highest_state = sm.state
            
            if ep_id == "_global":
                continue
            
            entry_states[ep_id] = {
                "name": sm.entry_point_name,
                "state": sm.state.value,
            }
        
        return {
            "house_mode": self._house_mode.value,
            "user_mode": self._user_mode.value,
            "global_state": highest_state.value,
            "entry_points": entry_states,
            "event_count": len(self._global_events),
        }
    
    def get_events(self, limit: int = 50) -> List[EventRecord]:
        """获取最近的事件"""
        return self._global_events[-limit:]
