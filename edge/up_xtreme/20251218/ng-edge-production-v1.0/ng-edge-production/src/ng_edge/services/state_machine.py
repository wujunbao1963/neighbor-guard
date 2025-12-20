"""
独立状态机架构 v3

修复：
1. Cancel/Resolve 正确记录事件并回到 NORMAL
2. 添加 user_mode (alert/quiet) 参数
3. 传感器信号映射更清晰

状态定义：
- NORMAL: 正常状态（初始/结束状态）
- NOTICE: 通知状态（发通知→自动回NORMAL）
- PRE: 预警状态（需要处理，Cancel→记录→NORMAL）
- PENDING: 确认入侵，倒计时（Cancel→记录→NORMAL, 超时→TRIGGERED）
- TRIGGERED: 报警触发（Resolve→记录→NORMAL）
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Callable, List, Dict, Any
import uuid


# =============================================================================
# 枚举定义
# =============================================================================

class AlarmState(str, Enum):
    """报警状态"""
    NORMAL = "normal"        # 正常状态
    NOTICE = "notice"        # 通知状态（短暂）
    PRE = "pre"              # 预警状态
    PENDING = "pending"      # 倒计时
    TRIGGERED = "triggered"  # 报警触发


class UserMode(str, Enum):
    """用户选择的报警模式"""
    ALERT = "alert"  # 警觉模式 - 更多提醒
    QUIET = "quiet"  # 安静模式 - 减少打扰


class ZoneType(str, Enum):
    """区域类型"""
    EXTERIOR = "exterior"       # 户外（摄像头）
    ENTRY_EXIT = "entry_exit"   # 出入口（门磁）
    INTERIOR = "interior"       # 室内（PIR）
    PERIMETER = "perimeter"     # 周界（玻璃破碎）


class SensorType(str, Enum):
    """传感器类型"""
    CAMERA = "camera"           # 摄像头
    DOOR_CONTACT = "door_contact"  # 门磁
    PIR = "pir"                 # 红外传感器
    GLASS_BREAK = "glass_break"  # 玻璃破碎传感器


class SignalType(str, Enum):
    """信号类型"""
    # 摄像头信号
    PERSON_DETECTED = "person_detected"
    VEHICLE_DETECTED = "vehicle_detected"
    
    # 门磁信号
    DOOR_OPEN = "door_open"
    DOOR_CLOSE = "door_close"
    
    # PIR信号
    MOTION_ACTIVE = "motion_active"
    MOTION_INACTIVE = "motion_inactive"
    
    # 玻璃破碎信号
    GLASS_BREAK = "glass_break"


# 传感器→可用信号映射
SENSOR_SIGNALS: Dict[SensorType, List[SignalType]] = {
    SensorType.CAMERA: [SignalType.PERSON_DETECTED, SignalType.VEHICLE_DETECTED],
    SensorType.DOOR_CONTACT: [SignalType.DOOR_OPEN, SignalType.DOOR_CLOSE],
    SensorType.PIR: [SignalType.MOTION_ACTIVE, SignalType.MOTION_INACTIVE],
    SensorType.GLASS_BREAK: [SignalType.GLASS_BREAK],
}

# 区域→典型传感器映射
ZONE_SENSORS: Dict[ZoneType, List[SensorType]] = {
    ZoneType.EXTERIOR: [SensorType.CAMERA],
    ZoneType.ENTRY_EXIT: [SensorType.DOOR_CONTACT, SensorType.CAMERA],
    ZoneType.INTERIOR: [SensorType.PIR, SensorType.CAMERA],
    ZoneType.PERIMETER: [SensorType.GLASS_BREAK, SensorType.DOOR_CONTACT],
}


# =============================================================================
# 数据结构
# =============================================================================

@dataclass
class Signal:
    """输入信号"""
    zone_type: ZoneType
    signal_type: SignalType
    sensor_type: SensorType
    from_inside: bool = False  # 方向检测（仅门磁有效）
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    zone_id: str = ""
    sensor_id: str = ""
    
    @classmethod
    def create(
        cls,
        zone_type: ZoneType,
        sensor_type: SensorType,
        signal_type: SignalType,
        from_inside: bool = False,
    ) -> "Signal":
        """工厂方法 - 验证信号类型匹配传感器"""
        valid_signals = SENSOR_SIGNALS.get(sensor_type, [])
        if signal_type not in valid_signals:
            raise ValueError(
                f"传感器 {sensor_type.value} 不能产生 {signal_type.value} 信号。"
                f"可用信号: {[s.value for s in valid_signals]}"
            )
        return cls(
            zone_type=zone_type,
            signal_type=signal_type,
            sensor_type=sensor_type,
            from_inside=from_inside,
        )


@dataclass
class EventRecord:
    """事件记录"""
    event_id: str
    start_time: datetime
    end_time: datetime
    start_state: AlarmState
    end_state: AlarmState
    end_reason: str  # "canceled", "resolved", "timeout"
    signals: List[Signal]
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass 
class StateTransition:
    """状态转换结果"""
    success: bool
    from_state: AlarmState
    to_state: AlarmState
    reason: str
    entry_delay_sec: int = 0
    notice_sent: bool = False
    event_record: Optional[EventRecord] = None  # 结束时的事件记录


# =============================================================================
# 事件存储
# =============================================================================

class EventStore:
    """事件存储"""
    
    def __init__(self):
        self._events: List[EventRecord] = []
    
    def save(self, record: EventRecord):
        """保存事件记录"""
        self._events.append(record)
    
    def get_all(self) -> List[EventRecord]:
        """获取所有事件"""
        return self._events.copy()
    
    def get_recent(self, n: int = 10) -> List[EventRecord]:
        """获取最近 n 条事件"""
        return self._events[-n:]
    
    def clear(self):
        """清空所有事件"""
        self._events.clear()


# =============================================================================
# 状态机基类
# =============================================================================

class ModeStateMachine(ABC):
    """状态机基类"""
    
    def __init__(
        self,
        user_mode: UserMode = UserMode.ALERT,
        entry_delay_sec: int = 30,
        event_store: Optional[EventStore] = None,
        on_pending_started: Optional[Callable[[int], None]] = None,
        on_notice: Optional[Callable[[str, Signal], None]] = None,
        on_pre_alert: Optional[Callable[[str], None]] = None,
        on_triggered: Optional[Callable[[str], None]] = None,
    ):
        self._user_mode = user_mode
        self._state = AlarmState.NORMAL
        self._entry_delay_sec = entry_delay_sec
        self._event_store = event_store or EventStore()
        
        # 当前事件跟踪
        self._current_event_id: Optional[str] = None
        self._current_event_start: Optional[datetime] = None
        self._current_signals: List[Signal] = []
        self._current_start_state: Optional[AlarmState] = None
        
        # 回调
        self.on_pending_started = on_pending_started
        self.on_notice = on_notice
        self.on_pre_alert = on_pre_alert
        self.on_triggered = on_triggered
    
    @property
    def state(self) -> AlarmState:
        return self._state
    
    @property
    def user_mode(self) -> UserMode:
        return self._user_mode
    
    @property
    def entry_delay_sec(self) -> int:
        return self._entry_delay_sec if self._state == AlarmState.PENDING else 0
    
    @property
    def event_store(self) -> EventStore:
        return self._event_store
    
    def set_user_mode(self, mode: UserMode):
        """切换用户模式（alert/quiet）"""
        self._user_mode = mode
    
    def reset(self):
        """深度重置 - 清除当前状态但保留历史事件"""
        self._state = AlarmState.NORMAL
        self._current_event_id = None
        self._current_event_start = None
        self._current_signals = []
        self._current_start_state = None
    
    @abstractmethod
    def process(self, signal: Signal) -> StateTransition:
        """处理信号"""
        pass
    
    def trigger_timeout(self) -> StateTransition:
        """计时器超时"""
        if self._state == AlarmState.PENDING:
            return self._to_triggered("Entry delay expired")
        return StateTransition(False, self._state, self._state, "Not in PENDING")
    
    def cancel(self) -> StateTransition:
        """
        用户取消（PRE 或 PENDING）
        记录事件 → 回到 NORMAL
        """
        if self._state not in (AlarmState.PRE, AlarmState.PENDING):
            return StateTransition(
                False, self._state, self._state, 
                f"Cannot cancel from {self._state.value}"
            )
        
        from_state = self._state
        record = self._end_event("canceled")
        self._state = AlarmState.NORMAL
        
        return StateTransition(
            success=True,
            from_state=from_state,
            to_state=AlarmState.NORMAL,
            reason="User canceled",
            event_record=record,
        )
    
    def resolve(self) -> StateTransition:
        """
        解除报警（仅 TRIGGERED）
        记录事件 → 回到 NORMAL
        """
        if self._state != AlarmState.TRIGGERED:
            return StateTransition(
                False, self._state, self._state,
                f"Can only resolve from TRIGGERED, current: {self._state.value}"
            )
        
        record = self._end_event("resolved")
        self._state = AlarmState.NORMAL
        
        return StateTransition(
            success=True,
            from_state=AlarmState.TRIGGERED,
            to_state=AlarmState.NORMAL,
            reason="Alarm resolved",
            event_record=record,
        )
    
    # === 内部方法 ===
    
    def _start_event(self, signal: Signal):
        """开始新事件"""
        if self._current_event_id is None:
            self._current_event_id = f"evt_{uuid.uuid4().hex[:8]}"
            self._current_event_start = datetime.now(timezone.utc)
            self._current_signals = []
            self._current_start_state = self._state
        self._current_signals.append(signal)
    
    def _end_event(self, reason: str) -> Optional[EventRecord]:
        """结束当前事件，保存并返回记录"""
        if self._current_event_id is None:
            return None
        
        record = EventRecord(
            event_id=self._current_event_id,
            start_time=self._current_event_start,
            end_time=datetime.now(timezone.utc),
            start_state=self._current_start_state or AlarmState.NORMAL,
            end_state=self._state,
            end_reason=reason,
            signals=self._current_signals.copy(),
        )
        
        # 保存到事件存储
        self._event_store.save(record)
        
        # 清理当前事件
        self._current_event_id = None
        self._current_event_start = None
        self._current_signals = []
        self._current_start_state = None
        
        return record
    
    # === 状态转换辅助方法 ===
    
    def _send_notice(self, reason: str, signal: Signal) -> StateTransition:
        """发送通知（不改变状态）"""
        if self.on_notice:
            self.on_notice(reason, signal)
        
        return StateTransition(
            success=True,
            from_state=self._state,
            to_state=self._state,
            reason=reason,
            notice_sent=True,
        )
    
    def _to_pre(self, reason: str, signal: Signal) -> StateTransition:
        """转换到 PRE"""
        if self._state not in (AlarmState.NORMAL, AlarmState.PRE):
            return StateTransition(
                False, self._state, self._state, 
                f"Cannot PRE from {self._state.value}"
            )
        
        from_state = self._state
        self._start_event(signal)
        self._state = AlarmState.PRE
        
        if self.on_pre_alert:
            self.on_pre_alert(reason)
        
        return StateTransition(True, from_state, AlarmState.PRE, reason)
    
    def _to_pending(self, reason: str, signal: Signal, delay: int = None) -> StateTransition:
        """转换到 PENDING"""
        if self._state not in (AlarmState.NORMAL, AlarmState.PRE):
            return StateTransition(
                False, self._state, self._state,
                f"Cannot PENDING from {self._state.value}"
            )
        
        from_state = self._state
        delay = delay if delay is not None else self._entry_delay_sec
        
        self._start_event(signal)
        
        if delay == 0:
            return self._to_triggered(f"{reason} (instant)")
        
        self._state = AlarmState.PENDING
        
        if self.on_pending_started:
            self.on_pending_started(delay)
        
        return StateTransition(True, from_state, AlarmState.PENDING, reason, delay)
    
    def _to_triggered(self, reason: str) -> StateTransition:
        """转换到 TRIGGERED"""
        from_state = self._state
        self._state = AlarmState.TRIGGERED
        
        if self.on_triggered:
            self.on_triggered(reason)
        
        return StateTransition(True, from_state, AlarmState.TRIGGERED, reason)
    
    def _stay_normal(self, reason: str) -> StateTransition:
        """保持 NORMAL"""
        return StateTransition(True, self._state, self._state, reason)


# =============================================================================
# DISARMED 状态机
# =============================================================================

class DisarmedStateMachine(ModeStateMachine):
    """DISARMED: 系统撤防，忽略所有信号"""
    
    def process(self, signal: Signal) -> StateTransition:
        return self._stay_normal(f"DISARMED: {signal.signal_type.value} ignored")


# =============================================================================
# HOME 状态机
# =============================================================================

class HomeStateMachine(ModeStateMachine):
    """
    HOME 模式 - 家人在家
    
    Alert 模式:
    | exterior person | NOTICE   | 通知"有人在外面"        |
    | door (outside)  | NOTICE   | 通知"有人开门"          |
    | door (inside)   | NORMAL   | 忽略                   |
    | interior motion | NORMAL   | 忽略                   |
    | glass break     | TRIGGERED| 报警                   |
    
    Quiet 模式: 同 Alert（HOME 没有区别）
    """
    
    def process(self, signal: Signal) -> StateTransition:
        # 玻璃破碎 - 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            self._start_event(signal)
            return self._to_triggered("Glass break detected")
        
        # 外部人员 - 通知
        if signal.zone_type == ZoneType.EXTERIOR:
            if signal.signal_type == SignalType.PERSON_DETECTED:
                return self._send_notice("有人在外面", signal)
        
        # 门 - 方向检测
        if signal.zone_type == ZoneType.ENTRY_EXIT:
            if signal.signal_type == SignalType.DOOR_OPEN:
                if not signal.from_inside:
                    return self._send_notice("有人从外面开门", signal)
        
        return self._stay_normal("HOME: normal activity")


# =============================================================================
# AWAY 状态机
# =============================================================================

class AwayStateMachine(ModeStateMachine):
    """
    AWAY 模式 - 无人在家，全保护
    
    | exterior person | PRE      | 预警                   |
    | door open       | PENDING  | 倒计时30秒             |
    | interior motion | TRIGGERED| 立即报警               |
    | glass break     | TRIGGERED| 立即报警               |
    
    Alert/Quiet 模式无区别
    """
    
    def process(self, signal: Signal) -> StateTransition:
        # 玻璃破碎 - 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            self._start_event(signal)
            return self._to_triggered("Glass break detected")
        
        # 室内活动 - 直接触发或加速
        if signal.zone_type == ZoneType.INTERIOR:
            if signal.signal_type == SignalType.MOTION_ACTIVE:
                if self._state == AlarmState.PENDING:
                    return self._to_triggered("Interior motion - accelerated")
                self._start_event(signal)
                return self._to_triggered("Interior motion detected")
        
        # 门 - PENDING
        if signal.zone_type == ZoneType.ENTRY_EXIT:
            if signal.signal_type == SignalType.DOOR_OPEN:
                return self._to_pending("Door opened", signal)
        
        # 外部人员 - PRE
        if signal.zone_type == ZoneType.EXTERIOR:
            if signal.signal_type == SignalType.PERSON_DETECTED:
                if self._state == AlarmState.NORMAL:
                    return self._to_pre("Exterior person detected", signal)
        
        return StateTransition(True, self._state, self._state, "No state change")


# =============================================================================
# NIGHT_OCCUPIED 状态机
# =============================================================================

class NightOccupiedStateMachine(ModeStateMachine):
    """
    NIGHT_OCCUPIED 模式 - 夜间有人，方向检测
    
    Alert 模式:
    | exterior person | PRE      | 预警                   |
    | door (outside)  | PENDING  | 入侵，倒计时15秒        |
    | door (inside)   | NOTICE   | 通知"家人出门"          |
    | interior motion | PRE      | 起夜，预警              |
    | glass break     | TRIGGERED| 立即报警               |
    
    Quiet 模式:
    | door (inside)   | NORMAL   | 静默                   |
    | interior motion | NORMAL   | 起夜不打扰             |
    """
    
    def __init__(self, entry_delay_sec: int = 15, **kwargs):
        super().__init__(entry_delay_sec=entry_delay_sec, **kwargs)
    
    def process(self, signal: Signal) -> StateTransition:
        is_quiet = self._user_mode == UserMode.QUIET
        
        # 玻璃破碎 - 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            self._start_event(signal)
            return self._to_triggered("Glass break detected")
        
        # 室内活动
        if signal.zone_type == ZoneType.INTERIOR:
            if signal.signal_type == SignalType.MOTION_ACTIVE:
                # 加速 PENDING
                if self._state == AlarmState.PENDING:
                    return self._to_triggered("Interior motion - accelerated")
                
                # Quiet 模式：起夜不打扰
                if is_quiet:
                    return self._stay_normal("Night Quiet: interior activity ignored")
                
                # Alert 模式：PRE
                if self._state == AlarmState.NORMAL:
                    return self._to_pre("Night: interior activity (getting up)", signal)
        
        # 门 - 方向检测
        if signal.zone_type == ZoneType.ENTRY_EXIT:
            if signal.signal_type == SignalType.DOOR_OPEN:
                if signal.from_inside:
                    # 从里面出去
                    if is_quiet:
                        return self._stay_normal("Night Quiet: door from inside ignored")
                    return self._send_notice("家人出门", signal)
                else:
                    # 从外面进来 - PENDING
                    return self._to_pending("Night: door from outside (intrusion)", signal)
        
        # 外部人员 - PRE
        if signal.zone_type == ZoneType.EXTERIOR:
            if signal.signal_type == SignalType.PERSON_DETECTED:
                if self._state == AlarmState.NORMAL:
                    return self._to_pre("Night: exterior person", signal)
        
        return StateTransition(True, self._state, self._state, "No state change")


# =============================================================================
# NIGHT_PERIMETER 状态机
# =============================================================================

class NightPerimeterStateMachine(ModeStateMachine):
    """
    NIGHT_PERIMETER 模式 - 夜间无人，全保护，无延迟
    
    | exterior person | PRE      | 预警                   |
    | door open       | TRIGGERED| 立即报警（无延迟）       |
    | interior motion | TRIGGERED| 立即报警               |
    | glass break     | TRIGGERED| 立即报警               |
    """
    
    def __init__(self, **kwargs):
        super().__init__(entry_delay_sec=0, **kwargs)
    
    def process(self, signal: Signal) -> StateTransition:
        # 玻璃破碎 - 直接触发
        if signal.signal_type == SignalType.GLASS_BREAK:
            self._start_event(signal)
            return self._to_triggered("Glass break detected")
        
        # 室内活动 - 直接触发
        if signal.zone_type == ZoneType.INTERIOR:
            if signal.signal_type == SignalType.MOTION_ACTIVE:
                self._start_event(signal)
                return self._to_triggered("Interior motion - no one should be home")
        
        # 门 - 直接触发
        if signal.zone_type == ZoneType.ENTRY_EXIT:
            if signal.signal_type == SignalType.DOOR_OPEN:
                self._start_event(signal)
                return self._to_triggered("Door opened - no one should be home")
        
        # 外部人员 - PRE
        if signal.zone_type == ZoneType.EXTERIOR:
            if signal.signal_type == SignalType.PERSON_DETECTED:
                if self._state == AlarmState.NORMAL:
                    return self._to_pre("Exterior person detected", signal)
        
        return StateTransition(True, self._state, self._state, "No state change")


# =============================================================================
# 状态机工厂
# =============================================================================

class StateMachineFactory:
    """状态机工厂"""
    
    @staticmethod
    def create(
        house_mode: str,
        user_mode: str = "alert",
        entry_delay_sec: int = 30,
        event_store: Optional[EventStore] = None,
        **callbacks,
    ) -> ModeStateMachine:
        """
        创建状态机
        
        Args:
            house_mode: "disarmed", "home", "away", "night_occupied", "night_perimeter"
            user_mode: "alert" or "quiet"
            entry_delay_sec: PENDING 延迟秒数
            event_store: 事件存储（共享）
            **callbacks: on_pending_started, on_notice, on_pre_alert, on_triggered
        """
        um = UserMode.QUIET if user_mode == "quiet" else UserMode.ALERT
        store = event_store or EventStore()
        
        kwargs = {
            "user_mode": um,
            "event_store": store,
            **callbacks,
        }
        
        if house_mode == "disarmed":
            return DisarmedStateMachine(**kwargs)
        
        elif house_mode == "home":
            return HomeStateMachine(entry_delay_sec=entry_delay_sec, **kwargs)
        
        elif house_mode == "away":
            return AwayStateMachine(entry_delay_sec=entry_delay_sec, **kwargs)
        
        elif house_mode == "night_occupied":
            delay = min(entry_delay_sec, 15)
            return NightOccupiedStateMachine(entry_delay_sec=delay, **kwargs)
        
        elif house_mode == "night_perimeter":
            return NightPerimeterStateMachine(**kwargs)
        
        else:
            raise ValueError(f"Unknown house_mode: {house_mode}")


# =============================================================================
# 信号创建辅助
# =============================================================================

def create_signal(
    zone_type: ZoneType,
    sensor_type: SensorType,
    signal_type: SignalType,
    from_inside: bool = False,
) -> Signal:
    """
    创建信号（带验证）
    
    Example:
        # 摄像头检测到人
        sig = create_signal(ZoneType.EXTERIOR, SensorType.CAMERA, SignalType.PERSON_DETECTED)
        
        # 门磁检测到开门（从外面）
        sig = create_signal(ZoneType.ENTRY_EXIT, SensorType.DOOR_CONTACT, SignalType.DOOR_OPEN)
        
        # 门磁检测到开门（从里面）
        sig = create_signal(ZoneType.ENTRY_EXIT, SensorType.DOOR_CONTACT, SignalType.DOOR_OPEN, from_inside=True)
    """
    return Signal.create(zone_type, sensor_type, signal_type, from_inside)


def get_available_signals(sensor_type: SensorType) -> List[SignalType]:
    """获取传感器可用的信号类型"""
    return SENSOR_SIGNALS.get(sensor_type, [])


def get_zone_sensors(zone_type: ZoneType) -> List[SensorType]:
    """获取区域典型的传感器类型"""
    return ZONE_SENSORS.get(zone_type, [])
