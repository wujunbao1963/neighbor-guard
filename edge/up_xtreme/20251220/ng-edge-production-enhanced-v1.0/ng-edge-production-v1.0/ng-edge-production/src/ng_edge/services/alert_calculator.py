"""
NG Edge Alert Level Calculator - PRD v7.4.2 §1.4.1 & §1.4.2

Calculates:
- userAlertLevel (0-3): Wake/notification intensity for user
- dispatchReadinessLocal (0-3): Local dispatch preparation level

Key rules:
- LIFE_SAFETY always level 3
- SECURITY_HEAVY escalates by AlarmState
- SUSPICION_LIGHT max level 1 (with conditions)
- LOGISTICS max level 1 (with conditions)
- Mode affects levels (Away/Night/Home)
"""

from dataclasses import dataclass, field
from typing import Optional

from ..domain.enums import (
    WorkflowClass,
    AlarmState,
    HouseMode,
    NightSubMode,
    UserAlertLevel,
    DispatchReadinessLevel,
    DispatchRecommendation,
    EventDisposition,
    ZoneType,
    SignalType,
)


@dataclass
class AlertPolicy:
    """User alert policy configuration (PRD §1.4.3).
    
    Controls notification behavior without changing security semantics.
    """
    # SUSPICION_LIGHT in HOME: notify or not
    notify_suspicion_in_home: bool = False
    
    # LOGISTICS: notify on delivery
    notify_logistics: bool = False
    
    # Night package theft protection
    night_package_protection: bool = False
    
    # Quiet hours (may enable suspicion alerts at entry points)
    quiet_hours: bool = False
    
    # Per-zone/entry-point overrides (zone_id -> notify in HOME)
    home_notify_zones: set[str] = field(default_factory=set)


@dataclass
class AlertContext:
    """Context for alert level calculation."""
    workflow_class: WorkflowClass
    alarm_state: AlarmState
    house_mode: HouseMode
    night_sub_mode: Optional[NightSubMode] = None
    
    # Zone info for conditional alerts
    zone_type: Optional[ZoneType] = None
    zone_id: Optional[str] = None
    entry_point_id: Optional[str] = None
    signal_type: Optional[SignalType] = None
    
    # For dispatch calculation
    event_disposition: Optional[EventDisposition] = None
    avs_level: int = 0
    has_follower_confirmation: bool = False  # Interior motion after entry
    has_multi_zone: bool = False  # Multiple zones triggered
    has_video_confirmation: bool = False  # Tier-V video confirmation


@dataclass
class AlertLevelResult:
    """Result of alert level calculation."""
    user_alert_level: UserAlertLevel
    dispatch_readiness_local: DispatchReadinessLevel
    dispatch_recommendation: DispatchRecommendation
    reason: str


class AlertLevelCalculator:
    """Calculates user alert and dispatch readiness levels (PRD §1.4).
    
    Stateless calculator - each calculation is independent.
    """
    
    def __init__(self, policy: Optional[AlertPolicy] = None):
        self.policy = policy or AlertPolicy()
    
    def calculate(self, context: AlertContext) -> AlertLevelResult:
        """Calculate alert levels based on context.
        
        Args:
            context: Current event context
        
        Returns:
            AlertLevelResult with user_alert_level and dispatch info
        """
        # Calculate user alert level
        user_level = self._calculate_user_alert_level(context)
        
        # Calculate dispatch readiness (local)
        dispatch_level, dispatch_rec = self._calculate_dispatch_readiness(context)
        
        # Build reason
        reason = self._build_reason(context, user_level, dispatch_level)
        
        return AlertLevelResult(
            user_alert_level=user_level,
            dispatch_readiness_local=dispatch_level,
            dispatch_recommendation=dispatch_rec,
            reason=reason,
        )
    
    def _calculate_user_alert_level(self, context: AlertContext) -> UserAlertLevel:
        """Calculate userAlertLevel (PRD §1.4.1 table)."""
        
        # LIFE_SAFETY: always level 3 (PRD §1.4.1 row 5)
        if context.workflow_class == WorkflowClass.LIFE_SAFETY:
            return UserAlertLevel.ALARM
        
        # LOGISTICS: 0 or 1 based on policy (PRD §1.4.1 row 6)
        if context.workflow_class == WorkflowClass.LOGISTICS:
            return self._calculate_logistics_level(context)
        
        # SUSPICION_LIGHT: 0 or 1 based on mode/policy (PRD §1.4.1 row 1)
        if context.workflow_class == WorkflowClass.SUSPICION_LIGHT:
            return self._calculate_suspicion_level(context)
        
        # SECURITY_HEAVY: depends on AlarmState and Mode (PRD §1.4.1 rows 2-4)
        return self._calculate_security_heavy_level(context)
    
    def _calculate_security_heavy_level(self, context: AlertContext) -> UserAlertLevel:
        """Calculate level for SECURITY_HEAVY workflow (PRD §1.4.1 rows 2-4).
        
        | AlarmSM State | Away | Night (occupied) | Night (perimeter) | Home |
        |---------------|------|------------------|-------------------|------|
        | PRE           | 2    | 1                | 1                 | 1    |
        | PENDING       | 3    | 2                | 3                 | 2    |
        | TRIGGERED     | 3    | 3                | 3                 | 3    |
        """
        state = context.alarm_state
        mode = context.house_mode
        night_sub = context.night_sub_mode
        
        # TRIGGERED: always 3 (PRD §1.4.1 row 4)
        if state == AlarmState.TRIGGERED:
            return UserAlertLevel.ALARM
        
        # PENDING (PRD §1.4.1 row 3)
        if state == AlarmState.PENDING:
            if mode == HouseMode.AWAY:
                return UserAlertLevel.ALARM  # 3
            elif mode == HouseMode.NIGHT:
                if night_sub == NightSubMode.NIGHT_PERIMETER:
                    return UserAlertLevel.ALARM  # 3
                return UserAlertLevel.STRONG  # 2 (night_occupied)
            elif mode == HouseMode.HOME:
                return UserAlertLevel.STRONG  # 2
            else:
                return UserAlertLevel.NONE  # DISARMED
        
        # PRE (PRD §1.4.1 row 2) - Pre-alert for exterior activity
        # AWAY/NIGHT: STRONG (2) to wake user and enable early response
        if state == AlarmState.PRE:
            if mode in (HouseMode.AWAY, HouseMode.NIGHT):
                return UserAlertLevel.STRONG  # 2 - wake user for exterior threat
            else:
                return UserAlertLevel.SOFT  # 1 (Home - aware but not alarming)
        
        # QUIET, CANCELED, RESOLVED: no active alert
        return UserAlertLevel.NONE
    
    def _calculate_suspicion_level(self, context: AlertContext) -> UserAlertLevel:
        """Calculate level for SUSPICION_LIGHT workflow (PRD §1.4.1 row 1).
        
        Default: 1 for Away/Night, 0-1 for Home
        
        PRE state in AWAY/NIGHT: elevated to 2 (STRONG) for early warning
        """
        mode = context.house_mode
        state = context.alarm_state
        
        # DISARMED: no alerts
        if mode == HouseMode.DISARMED:
            return UserAlertLevel.NONE
        
        # PRE state in AWAY/NIGHT: STRONG alert for early warning
        # This is critical for exterior threats (person in yard before entry)
        if state == AlarmState.PRE and mode in (HouseMode.AWAY, HouseMode.NIGHT):
            return UserAlertLevel.STRONG  # 2 - wake user for exterior threat
        
        # Away/Night: level 1
        if mode in (HouseMode.AWAY, HouseMode.NIGHT):
            return UserAlertLevel.SOFT
        
        # HOME: conditional 0 or 1
        if mode == HouseMode.HOME:
            # Policy override
            if self.policy.notify_suspicion_in_home:
                return UserAlertLevel.SOFT
            
            # Quiet hours near entry point
            if self.policy.quiet_hours:
                if context.zone_type in (ZoneType.ENTRY_EXIT, ZoneType.PERIMETER):
                    return UserAlertLevel.SOFT
                if context.entry_point_id:
                    return UserAlertLevel.SOFT
            
            # Zone-specific override
            if context.zone_id and context.zone_id in self.policy.home_notify_zones:
                return UserAlertLevel.SOFT
            
            # Vehicle without approach/loiter defaults to 0
            if context.signal_type == SignalType.VEHICLE_DETECTED:
                return UserAlertLevel.NONE
            
            # Default: no notification
            return UserAlertLevel.NONE
        
        return UserAlertLevel.NONE
    
    def _calculate_logistics_level(self, context: AlertContext) -> UserAlertLevel:
        """Calculate level for LOGISTICS workflow (PRD §1.4.1 row 6).
        
        Default: 0 (no notification)
        Can be 1 if:
        - notifyLogistics=true
        - night_package_protection=true
        Never 2 or 3.
        """
        # Policy override
        if self.policy.notify_logistics:
            return UserAlertLevel.SOFT
        
        # Night package protection
        if self.policy.night_package_protection and context.house_mode == HouseMode.NIGHT:
            return UserAlertLevel.SOFT
        
        # Default: no notification
        return UserAlertLevel.NONE
    
    def _calculate_dispatch_readiness(
        self,
        context: AlertContext,
    ) -> tuple[DispatchReadinessLevel, DispatchRecommendation]:
        """Calculate dispatchReadinessLocal (PRD §1.4.2 A).
        
        Returns:
            Tuple of (readiness_level, recommendation)
        """
        # Canceled/verified_false: level 0, recommendation none
        if context.event_disposition in (
            EventDisposition.CANCELED_BEFORE_TRIGGER,
            EventDisposition.CANCELED_AFTER_TRIGGER,
            EventDisposition.VERIFIED_FALSE,
        ):
            return DispatchReadinessLevel.NONE, DispatchRecommendation.NONE
        
        # SUSPICION_LIGHT/LOGISTICS: level 0
        if context.workflow_class in (
            WorkflowClass.SUSPICION_LIGHT,
            WorkflowClass.LOGISTICS,
        ):
            return DispatchReadinessLevel.NONE, DispatchRecommendation.NONE
        
        # LIFE_SAFETY: level 3 (high risk)
        if context.workflow_class == WorkflowClass.LIFE_SAFETY:
            return (
                DispatchReadinessLevel.HIGH_RISK,
                DispatchRecommendation.RECOMMEND_CALL_FOR_SERVICE,
            )
        
        # SECURITY_HEAVY: depends on evidence
        return self._calculate_security_dispatch(context)
    
    def _calculate_security_dispatch(
        self,
        context: AlertContext,
    ) -> tuple[DispatchReadinessLevel, DispatchRecommendation]:
        """Calculate dispatch for SECURITY_HEAVY (PRD §1.4.2 A).
        
        Level 0: avs=0 or quiet
        Level 1: Entry/Perimeter in PENDING/TRIGGERED
        Level 2: Confirmed intrusion (follower, multi-zone, video)
        """
        # Not in active alarm state
        if context.alarm_state in (AlarmState.QUIET, AlarmState.PRE):
            return DispatchReadinessLevel.NONE, DispatchRecommendation.NONE
        
        # PENDING or TRIGGERED: at least level 1
        if context.alarm_state in (AlarmState.PENDING, AlarmState.TRIGGERED):
            # Check for confirmed intrusion (level 2)
            if self._has_intrusion_confirmation(context):
                level = DispatchReadinessLevel.VERIFIED
                # Recommend dispatch if AVS >= 2
                if context.avs_level >= 2:
                    return level, DispatchRecommendation.RECOMMEND_CALL_FOR_SERVICE
                return level, DispatchRecommendation.CONTINUE_VERIFY
            
            # Basic entry evidence (level 1)
            return (
                DispatchReadinessLevel.CONTINUE_VERIFY,
                DispatchRecommendation.CONTINUE_VERIFY,
            )
        
        # CANCELED/RESOLVED: level 0
        return DispatchReadinessLevel.NONE, DispatchRecommendation.NONE
    
    def _has_intrusion_confirmation(self, context: AlertContext) -> bool:
        """Check if there's confirmed intrusion evidence (PRD §1.4.2 A level 2).
        
        Confirmed by:
        - Interior follower motion after entry
        - Multiple zones triggered
        - Tier-V video confirmation
        """
        return (
            context.has_follower_confirmation or
            context.has_multi_zone or
            context.has_video_confirmation
        )
    
    def _build_reason(
        self,
        context: AlertContext,
        user_level: UserAlertLevel,
        dispatch_level: DispatchReadinessLevel,
    ) -> str:
        """Build explanation string."""
        parts = [
            f"{context.workflow_class.value}",
            f"state={context.alarm_state.value}",
            f"mode={context.house_mode.value}",
        ]
        
        if context.night_sub_mode:
            parts.append(f"sub={context.night_sub_mode.value}")
        
        parts.append(f"→ alert={user_level}, dispatch={dispatch_level}")
        
        return " ".join(parts)


# =============================================================================
# Convenience Functions
# =============================================================================

def calculate_user_alert_level(
    workflow_class: WorkflowClass,
    alarm_state: AlarmState,
    house_mode: HouseMode,
    night_sub_mode: Optional[NightSubMode] = None,
) -> UserAlertLevel:
    """Quick calculation without full context.
    
    Uses default policy and minimal context.
    """
    calculator = AlertLevelCalculator()
    context = AlertContext(
        workflow_class=workflow_class,
        alarm_state=alarm_state,
        house_mode=house_mode,
        night_sub_mode=night_sub_mode,
    )
    result = calculator.calculate(context)
    return result.user_alert_level


def calculate_dispatch_readiness(
    workflow_class: WorkflowClass,
    alarm_state: AlarmState,
    avs_level: int = 0,
    has_follower: bool = False,
    event_disposition: Optional[EventDisposition] = None,
) -> tuple[DispatchReadinessLevel, DispatchRecommendation]:
    """Quick dispatch calculation.
    
    Returns tuple of (readiness_level, recommendation).
    """
    calculator = AlertLevelCalculator()
    context = AlertContext(
        workflow_class=workflow_class,
        alarm_state=alarm_state,
        house_mode=HouseMode.AWAY,  # Mode doesn't affect dispatch
        avs_level=avs_level,
        has_follower_confirmation=has_follower,
        event_disposition=event_disposition,
    )
    result = calculator.calculate(context)
    return result.dispatch_readiness_local, result.dispatch_recommendation
