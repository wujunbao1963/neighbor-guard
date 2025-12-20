"""
AVS Assessment - 信号质量评估系统

评估信号的 Accuracy（准确性）、Validity（有效性）、Significance（重要性）
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from enum import Enum

from ..domain.models import Signal
from ..domain.enums import SignalType, ZoneType, HouseMode, LocationType


# =============================================================================
# AVS 评估结果
# =============================================================================

@dataclass
class AVSScore:
    """AVS 评估结果"""
    accuracy: float      # 准确性 (0.0 - 1.0)
    validity: float      # 有效性 (0.0 - 1.0)
    significance: float  # 重要性 (0.0 - 1.0)
    
    @property
    def composite_score(self) -> float:
        """综合评分"""
        return (self.accuracy + self.validity + self.significance) / 3.0
    
    @property
    def is_reliable(self) -> bool:
        """是否可靠（综合评分 >= 0.6）"""
        return self.composite_score >= 0.6
    
    @property
    def is_high_quality(self) -> bool:
        """是否高质量（综合评分 >= 0.8）"""
        return self.composite_score >= 0.8
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "accuracy": round(self.accuracy, 3),
            "validity": round(self.validity, 3),
            "significance": round(self.significance, 3),
            "composite_score": round(self.composite_score, 3),
            "is_reliable": self.is_reliable,
            "is_high_quality": self.is_high_quality,
        }


# =============================================================================
# 传感器可靠性配置
# =============================================================================

class SensorReliability(Enum):
    """传感器可靠性等级"""
    HIGH = 0.95      # 高可靠性（门磁、玻璃破碎）
    MEDIUM = 0.85    # 中等可靠性（PIR、摄像头）
    LOW = 0.70       # 低可靠性（声音检测、震动）
    UNKNOWN = 0.60   # 未知可靠性


# 信号类型到可靠性的映射
SIGNAL_RELIABILITY_MAP = {
    # 高可靠性
    SignalType.DOOR_OPEN: SensorReliability.HIGH,
    SignalType.DOOR_CLOSE: SensorReliability.HIGH,
    SignalType.WINDOW_OPEN: SensorReliability.HIGH,
    SignalType.WINDOW_CLOSE: SensorReliability.HIGH,
    SignalType.GLASS_BREAK: SensorReliability.HIGH,
    SignalType.FORCED_ENTRY: SensorReliability.HIGH,
    
    # 中等可靠性
    SignalType.MOTION_ACTIVE: SensorReliability.MEDIUM,
    SignalType.MOTION_CLEAR: SensorReliability.MEDIUM,
    SignalType.PERSON_DETECTED: SensorReliability.MEDIUM,
    SignalType.VEHICLE_DETECTED: SensorReliability.MEDIUM,
    SignalType.LOITER: SensorReliability.MEDIUM,
    SignalType.APPROACH_ENTRY: SensorReliability.MEDIUM,
}


# =============================================================================
# AVS Assessor
# =============================================================================

class AVSAssessor:
    """
    AVS 评估器
    
    评估信号的 Accuracy、Validity、Significance
    """
    
    def __init__(
        self,
        max_signal_age_sec: int = 60,
        accuracy_weight: float = 1.0,
        validity_weight: float = 1.0,
        significance_weight: float = 1.0,
    ):
        """
        初始化 AVS 评估器
        
        Args:
            max_signal_age_sec: 信号最大有效期（秒）
            accuracy_weight: 准确性权重
            validity_weight: 有效性权重
            significance_weight: 重要性权重
        """
        self.max_signal_age_sec = max_signal_age_sec
        self.accuracy_weight = accuracy_weight
        self.validity_weight = validity_weight
        self.significance_weight = significance_weight
        
        # 传感器历史准确率（可动态更新）
        self.sensor_history: Dict[str, Dict[str, Any]] = {}
    
    def assess_signal(
        self,
        signal: Signal,
        house_mode: HouseMode,
        zone_type: Optional[ZoneType] = None,
        location_type: Optional[LocationType] = None,
    ) -> AVSScore:
        """
        评估信号的 AVS 得分
        
        Args:
            signal: 待评估的信号
            house_mode: 当前房屋模式
            zone_type: 区域类型
            location_type: 位置类型
        
        Returns:
            AVSScore 评估结果
        """
        # 1. Accuracy - 准确性
        accuracy = self._assess_accuracy(signal)
        
        # 2. Validity - 有效性
        validity = self._assess_validity(signal, zone_type, location_type)
        
        # 3. Significance - 重要性
        significance = self._assess_significance(signal, house_mode, zone_type)
        
        return AVSScore(
            accuracy=accuracy,
            validity=validity,
            significance=significance,
        )
    
    def adjust_confidence(self, signal: Signal, avs_score: AVSScore) -> float:
        """
        根据 AVS 评分调整信号置信度
        
        Args:
            signal: 原始信号
            avs_score: AVS 评分
        
        Returns:
            调整后的置信度
        """
        adjusted = signal.confidence * avs_score.composite_score
        return max(0.0, min(1.0, adjusted))  # 限制在 [0, 1]
    
    # =========================================================================
    # Accuracy Assessment - 准确性评估
    # =========================================================================
    
    def _assess_accuracy(self, signal: Signal) -> float:
        """
        评估信号的准确性
        
        考虑因素:
        - 传感器类型的基础可靠性
        - 信号原始置信度
        - 传感器历史准确率
        
        Returns:
            准确性得分 (0.0 - 1.0)
        """
        # 1. 传感器基础可靠性
        base_reliability = self._get_sensor_reliability(signal.signal_type)
        
        # 2. 信号原始置信度
        signal_confidence = signal.confidence
        
        # 3. 传感器历史准确率（如果有记录）
        historical_accuracy = self._get_sensor_historical_accuracy(signal.sensor_id)
        
        # 加权平均
        weights = [0.4, 0.3, 0.3]
        scores = [base_reliability, signal_confidence, historical_accuracy]
        
        accuracy = sum(w * s for w, s in zip(weights, scores))
        return max(0.0, min(1.0, accuracy))
    
    def _get_sensor_reliability(self, signal_type: SignalType) -> float:
        """获取传感器类型的基础可靠性"""
        reliability = SIGNAL_RELIABILITY_MAP.get(
            signal_type,
            SensorReliability.UNKNOWN
        )
        return reliability.value
    
    def _get_sensor_historical_accuracy(self, sensor_id: str) -> float:
        """
        获取传感器的历史准确率
        
        如果没有历史记录，返回默认值 0.8
        """
        if sensor_id not in self.sensor_history:
            return 0.8  # 默认中等准确率
        
        history = self.sensor_history[sensor_id]
        total = history.get("total_signals", 0)
        confirmed = history.get("confirmed_signals", 0)
        
        if total == 0:
            return 0.8
        
        return confirmed / total
    
    def update_sensor_accuracy(
        self,
        sensor_id: str,
        was_confirmed: bool,
    ):
        """
        更新传感器历史准确率
        
        Args:
            sensor_id: 传感器 ID
            was_confirmed: 信号是否被确认为真实
        """
        if sensor_id not in self.sensor_history:
            self.sensor_history[sensor_id] = {
                "total_signals": 0,
                "confirmed_signals": 0,
            }
        
        history = self.sensor_history[sensor_id]
        history["total_signals"] += 1
        
        if was_confirmed:
            history["confirmed_signals"] += 1
    
    # =========================================================================
    # Validity Assessment - 有效性评估
    # =========================================================================
    
    def _assess_validity(
        self,
        signal: Signal,
        zone_type: Optional[ZoneType],
        location_type: Optional[LocationType],
    ) -> float:
        """
        评估信号的有效性
        
        考虑因素:
        - 时间有效性（信号是否过期）
        - 空间有效性（位置是否合理）
        - 模式有效性（信号类型与区域类型是否匹配）
        
        Returns:
            有效性得分 (0.0 - 1.0)
        """
        # 1. 时间有效性
        time_validity = self._assess_time_validity(signal)
        
        # 2. 空间有效性
        spatial_validity = self._assess_spatial_validity(signal, location_type)
        
        # 3. 模式有效性
        pattern_validity = self._assess_pattern_validity(signal, zone_type)
        
        # 加权平均
        weights = [0.4, 0.3, 0.3]
        scores = [time_validity, spatial_validity, pattern_validity]
        
        validity = sum(w * s for w, s in zip(weights, scores))
        return max(0.0, min(1.0, validity))
    
    def _assess_time_validity(self, signal: Signal) -> float:
        """
        评估时间有效性
        
        信号越新，有效性越高
        """
        now = datetime.now(timezone.utc)
        age = (now - signal.timestamp).total_seconds()
        
        if age < 0:
            # 未来时间戳（异常）
            return 0.0
        
        if age <= self.max_signal_age_sec:
            # 在有效期内，线性衰减
            decay = 1.0 - (age / self.max_signal_age_sec) * 0.3
            return decay
        else:
            # 超过有效期
            return 0.5  # 仍有一定价值，但大幅降低
    
    def _assess_spatial_validity(
        self,
        signal: Signal,
        location_type: Optional[LocationType],
    ) -> float:
        """
        评估空间有效性
        
        检查信号类型与位置类型是否合理
        """
        if location_type is None:
            return 0.9  # 无位置信息时给予高分
        
        # 室外信号
        if signal.signal_type in (
            SignalType.PERSON_DETECTED,
            SignalType.VEHICLE_DETECTED,
        ):
            if location_type == LocationType.OUTDOOR:
                return 1.0  # 完美匹配
            else:
                return 0.7  # 室内也可能检测到，但不太常见
        
        # 室内信号
        if signal.signal_type in (
            SignalType.MOTION_ACTIVE,
            SignalType.MOTION_CLEAR,
        ):
            if location_type == LocationType.INDOOR:
                return 1.0  # 完美匹配
            else:
                return 0.8  # 室外 PIR 也存在
        
        # 其他信号类型，无强制要求
        return 0.9
    
    def _assess_pattern_validity(
        self,
        signal: Signal,
        zone_type: Optional[ZoneType],
    ) -> float:
        """
        评估模式有效性
        
        检查信号类型与区域类型是否匹配
        """
        if zone_type is None:
            return 0.9  # 无区域信息时给予高分
        
        # ENTRY_EXIT 区域应该有门窗信号
        if zone_type == ZoneType.ENTRY_EXIT:
            if signal.signal_type in (
                SignalType.DOOR_OPEN,
                SignalType.DOOR_CLOSE,
                SignalType.WINDOW_OPEN,
                SignalType.WINDOW_CLOSE,
            ):
                return 1.0  # 完美匹配
            elif signal.signal_type in (
                SignalType.MOTION_ACTIVE,
                SignalType.PERSON_DETECTED,
            ):
                return 0.9  # 也合理
            else:
                return 0.7  # 不太常见
        
        # PERIMETER 区域应该有窗户、玻璃破碎信号
        if zone_type == ZoneType.PERIMETER:
            if signal.signal_type in (
                SignalType.WINDOW_OPEN,
                SignalType.WINDOW_CLOSE,
                SignalType.GLASS_BREAK,
            ):
                return 1.0  # 完美匹配
            elif signal.signal_type == SignalType.PERSON_DETECTED:
                return 0.8  # 也合理（窗外检测）
            else:
                return 0.7
        
        # INTERIOR 区域应该有运动信号
        if zone_type == ZoneType.INTERIOR:
            if signal.signal_type in (
                SignalType.MOTION_ACTIVE,
                SignalType.MOTION_CLEAR,
            ):
                return 1.0  # 完美匹配
            else:
                return 0.8
        
        # EXTERIOR 区域应该有室外检测信号
        if zone_type == ZoneType.EXTERIOR:
            if signal.signal_type in (
                SignalType.PERSON_DETECTED,
                SignalType.VEHICLE_DETECTED,
            ):
                return 1.0  # 完美匹配
            else:
                return 0.7
        
        # 其他情况
        return 0.8
    
    # =========================================================================
    # Significance Assessment - 重要性评估
    # =========================================================================
    
    def _assess_significance(
        self,
        signal: Signal,
        house_mode: HouseMode,
        zone_type: Optional[ZoneType],
    ) -> float:
        """
        评估信号的重要性
        
        考虑因素:
        - 信号类型的威胁级别
        - 房屋模式的相关性
        - 区域类型的安全优先级
        
        Returns:
            重要性得分 (0.0 - 1.0)
        """
        # 1. 信号威胁级别
        threat_level = self._assess_threat_level(signal.signal_type)
        
        # 2. 模式相关性
        mode_relevance = self._assess_mode_relevance(signal.signal_type, house_mode, zone_type)
        
        # 3. 区域优先级
        zone_priority = self._assess_zone_priority(zone_type)
        
        # 加权平均
        weights = [0.5, 0.3, 0.2]
        scores = [threat_level, mode_relevance, zone_priority]
        
        significance = sum(w * s for w, s in zip(weights, scores))
        return max(0.0, min(1.0, significance))
    
    def _assess_threat_level(self, signal_type: SignalType) -> float:
        """
        评估信号类型的威胁级别
        
        Returns:
            威胁级别 (0.0 - 1.0)
        """
        # 高威胁
        if signal_type in (
            SignalType.GLASS_BREAK,
            SignalType.FORCED_ENTRY,
        ):
            return 1.0
        
        # 中高威胁
        if signal_type in (
            SignalType.DOOR_OPEN,
            SignalType.WINDOW_OPEN,
            SignalType.PERSON_DETECTED,
            SignalType.LOITER,
        ):
            return 0.8
        
        # 中等威胁
        if signal_type in (
            SignalType.MOTION_ACTIVE,
            SignalType.VEHICLE_DETECTED,
            SignalType.APPROACH_ENTRY,
        ):
            return 0.6
        
        # 低威胁
        if signal_type in (
            SignalType.DOOR_CLOSE,
            SignalType.WINDOW_CLOSE,
            SignalType.MOTION_CLEAR,
        ):
            return 0.3
        
        # 默认
        return 0.5
    
    def _assess_mode_relevance(
        self,
        signal_type: SignalType,
        house_mode: HouseMode,
        zone_type: Optional[ZoneType],
    ) -> float:
        """
        评估信号在当前模式下的相关性
        
        Returns:
            相关性 (0.0 - 1.0)
        """
        # DISARMED 模式 - 所有信号重要性降低
        if house_mode == HouseMode.DISARMED:
            return 0.3
        
        # AWAY 模式 - 所有信号都高度重要
        if house_mode == HouseMode.AWAY:
            return 1.0
        
        # HOME 模式 - INTERIOR 区域信号重要性降低
        if house_mode == HouseMode.HOME:
            if zone_type == ZoneType.INTERIOR:
                return 0.2  # 室内活动正常
            else:
                return 0.9  # 其他区域仍重要
        
        # NIGHT 模式 - 类似 HOME
        if house_mode == HouseMode.NIGHT:
            if zone_type == ZoneType.INTERIOR:
                return 0.3  # 可能有夜间活动
            else:
                return 0.95  # 外围更重要
        
        return 0.7
    
    def _assess_zone_priority(self, zone_type: Optional[ZoneType]) -> float:
        """
        评估区域类型的安全优先级
        
        Returns:
            优先级 (0.0 - 1.0)
        """
        if zone_type is None:
            return 0.7
        
        # 入口区域最高优先级
        if zone_type == ZoneType.ENTRY_EXIT:
            return 1.0
        
        # 外围区域高优先级
        if zone_type == ZoneType.PERIMETER:
            return 0.9
        
        # 外部区域高优先级
        if zone_type == ZoneType.EXTERIOR:
            return 0.85
        
        # 内部区域较低优先级
        if zone_type == ZoneType.INTERIOR:
            return 0.5
        
        return 0.7
    
    # =========================================================================
    # 统计和诊断
    # =========================================================================
    
    def get_sensor_statistics(self) -> Dict[str, Any]:
        """获取传感器统计信息"""
        return {
            sensor_id: {
                "total_signals": history["total_signals"],
                "confirmed_signals": history["confirmed_signals"],
                "accuracy": (
                    history["confirmed_signals"] / history["total_signals"]
                    if history["total_signals"] > 0
                    else 0.0
                ),
            }
            for sensor_id, history in self.sensor_history.items()
        }
    
    def reset_sensor_history(self, sensor_id: Optional[str] = None):
        """
        重置传感器历史记录
        
        Args:
            sensor_id: 传感器 ID，None 表示重置所有
        """
        if sensor_id is None:
            self.sensor_history.clear()
        elif sensor_id in self.sensor_history:
            del self.sensor_history[sensor_id]
