"""
用户报警行为模式配置

两种预设模式：
1. Alert Mode（警觉模式）- 更多预警
2. Quiet Mode（静默模式）- 更少打扰

用户还可以自定义每个场景的行为。
"""

from enum import Enum
from typing import Dict, Optional
from pydantic import BaseModel

from ng_edge.domain.enums import HouseMode, NightSubMode, ZoneType, SignalType, AlarmState


class UserAlertMode(str, Enum):
    """用户选择的报警行为模式"""
    ALERT = "alert"    # 警觉模式 - 更多预警
    QUIET = "quiet"    # 静默模式 - 更少打扰
    CUSTOM = "custom"  # 自定义模式


class SignalBehavior(BaseModel):
    """单个信号场景的行为配置"""
    target_state: AlarmState  # QUIET, PRE, PENDING, TRIGGERED


class ModeSignalConfig(BaseModel):
    """一个 HouseMode 下所有信号的行为配置"""
    exterior_person: AlarmState = AlarmState.PRE
    door_open: AlarmState = AlarmState.PENDING
    interior_motion: AlarmState = AlarmState.TRIGGERED
    glass_break: AlarmState = AlarmState.TRIGGERED
    
    # 方向检测特殊情况
    door_open_from_inside: Optional[AlarmState] = None  # 内→外
    door_open_from_outside: Optional[AlarmState] = None  # 外→内


# =============================================================================
# 预设模式定义
# =============================================================================

# Alert Mode（警觉模式）- 更多预警
ALERT_MODE_CONFIG = {
    HouseMode.DISARMED: ModeSignalConfig(
        exterior_person=AlarmState.QUIET,
        door_open=AlarmState.QUIET,
        interior_motion=AlarmState.QUIET,
        glass_break=AlarmState.QUIET,
    ),
    HouseMode.HOME: ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.PRE,
        interior_motion=AlarmState.PRE,
        glass_break=AlarmState.TRIGGERED,
    ),
    HouseMode.AWAY: ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.PENDING,
        interior_motion=AlarmState.TRIGGERED,
        glass_break=AlarmState.TRIGGERED,
    ),
    (HouseMode.NIGHT, NightSubMode.NIGHT_OCCUPIED): ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.PRE,  # 默认值，方向检测覆盖
        door_open_from_inside=AlarmState.PRE,
        door_open_from_outside=AlarmState.PENDING,
        interior_motion=AlarmState.PRE,
        glass_break=AlarmState.TRIGGERED,
    ),
    (HouseMode.NIGHT, NightSubMode.NIGHT_PERIMETER): ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.TRIGGERED,
        interior_motion=AlarmState.TRIGGERED,
        glass_break=AlarmState.TRIGGERED,
    ),
}

# Quiet Mode（静默模式）- 更少打扰
QUIET_MODE_CONFIG = {
    HouseMode.DISARMED: ModeSignalConfig(
        exterior_person=AlarmState.QUIET,
        door_open=AlarmState.QUIET,
        interior_motion=AlarmState.QUIET,
        glass_break=AlarmState.QUIET,
    ),
    HouseMode.HOME: ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.QUIET,  # 默认静默
        door_open_from_inside=AlarmState.QUIET,
        door_open_from_outside=AlarmState.PRE,
        interior_motion=AlarmState.QUIET,
        glass_break=AlarmState.TRIGGERED,
    ),
    HouseMode.AWAY: ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.PENDING,
        interior_motion=AlarmState.TRIGGERED,
        glass_break=AlarmState.TRIGGERED,
    ),
    (HouseMode.NIGHT, NightSubMode.NIGHT_OCCUPIED): ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.PRE,  # 默认值
        door_open_from_inside=AlarmState.PRE,
        door_open_from_outside=AlarmState.PENDING,
        interior_motion=AlarmState.QUIET,  # 起夜不打扰
        glass_break=AlarmState.TRIGGERED,
    ),
    (HouseMode.NIGHT, NightSubMode.NIGHT_PERIMETER): ModeSignalConfig(
        exterior_person=AlarmState.PRE,
        door_open=AlarmState.TRIGGERED,
        interior_motion=AlarmState.TRIGGERED,
        glass_break=AlarmState.TRIGGERED,
    ),
}


class UserAlertConfig:
    """用户报警配置管理器"""
    
    def __init__(self, mode: UserAlertMode = UserAlertMode.ALERT):
        self.mode = mode
        self._custom_config: Dict = {}
        self._load_preset(mode)
    
    def _load_preset(self, mode: UserAlertMode):
        """加载预设配置"""
        if mode == UserAlertMode.ALERT:
            self._config = ALERT_MODE_CONFIG.copy()
        elif mode == UserAlertMode.QUIET:
            self._config = QUIET_MODE_CONFIG.copy()
        else:
            self._config = ALERT_MODE_CONFIG.copy()  # 自定义从警觉模式开始
    
    def set_mode(self, mode: UserAlertMode):
        """切换模式"""
        self.mode = mode
        self._load_preset(mode)
    
    def get_behavior(
        self,
        house_mode: HouseMode,
        zone_type: ZoneType,
        signal_type: SignalType,
        night_sub_mode: Optional[NightSubMode] = None,
        from_inside: bool = False,  # 方向检测
    ) -> AlarmState:
        """获取指定场景的目标状态"""
        
        # 获取模式配置
        key = house_mode
        if house_mode == HouseMode.NIGHT and night_sub_mode:
            key = (house_mode, night_sub_mode)
        
        config = self._config.get(key)
        if not config:
            return AlarmState.QUIET
        
        # 玻璃破碎
        if signal_type == SignalType.GLASS_BREAK:
            return config.glass_break
        
        # 外部人员
        if zone_type == ZoneType.EXTERIOR:
            return config.exterior_person
        
        # 门
        if zone_type == ZoneType.ENTRY_EXIT:
            if from_inside and config.door_open_from_inside is not None:
                return config.door_open_from_inside
            elif not from_inside and config.door_open_from_outside is not None:
                return config.door_open_from_outside
            return config.door_open
        
        # 室内
        if zone_type == ZoneType.INTERIOR:
            return config.interior_motion
        
        return AlarmState.QUIET
    
    def customize(
        self,
        house_mode: HouseMode,
        zone_type: ZoneType,
        target_state: AlarmState,
        night_sub_mode: Optional[NightSubMode] = None,
        from_inside: Optional[bool] = None,
    ):
        """自定义特定场景的行为"""
        self.mode = UserAlertMode.CUSTOM
        
        key = house_mode
        if house_mode == HouseMode.NIGHT and night_sub_mode:
            key = (house_mode, night_sub_mode)
        
        if key not in self._config:
            self._config[key] = ModeSignalConfig()
        
        config = self._config[key]
        
        if zone_type == ZoneType.EXTERIOR:
            config.exterior_person = target_state
        elif zone_type == ZoneType.ENTRY_EXIT:
            if from_inside is True:
                config.door_open_from_inside = target_state
            elif from_inside is False:
                config.door_open_from_outside = target_state
            else:
                config.door_open = target_state
        elif zone_type == ZoneType.INTERIOR:
            config.interior_motion = target_state
        elif zone_type == ZoneType.PERIMETER:
            config.glass_break = target_state


# =============================================================================
# 导出配置矩阵（用于文档/UI）
# =============================================================================

def get_mode_matrix(user_mode: UserAlertMode) -> str:
    """生成模式配置矩阵（Markdown格式）"""
    config = UserAlertConfig(user_mode)
    
    modes = [
        (HouseMode.DISARMED, None),
        (HouseMode.HOME, None),
        (HouseMode.AWAY, None),
        (HouseMode.NIGHT, NightSubMode.NIGHT_OCCUPIED),
        (HouseMode.NIGHT, NightSubMode.NIGHT_PERIMETER),
    ]
    
    def short_state(s: AlarmState) -> str:
        return {"quiet": "Q", "pre": "PRE", "pending": "PEN", "triggered": "TRI"}[s.value]
    
    header = "| Signal | DISARMED | HOME | AWAY | NIGHT_OCC | NIGHT_PERI |"
    sep = "|--------|----------|------|------|-----------|------------|"
    
    rows = []
    for signal_name, zone_type, signal_type in [
        ("exterior", ZoneType.EXTERIOR, SignalType.PERSON_DETECTED),
        ("door", ZoneType.ENTRY_EXIT, SignalType.DOOR_OPEN),
        ("interior", ZoneType.INTERIOR, SignalType.MOTION_ACTIVE),
        ("glass", ZoneType.PERIMETER, SignalType.GLASS_BREAK),
    ]:
        row = [signal_name]
        for hm, nsm in modes:
            state = config.get_behavior(hm, zone_type, signal_type, nsm)
            row.append(short_state(state))
        rows.append("| " + " | ".join(row) + " |")
    
    return "\n".join([header, sep] + rows)
