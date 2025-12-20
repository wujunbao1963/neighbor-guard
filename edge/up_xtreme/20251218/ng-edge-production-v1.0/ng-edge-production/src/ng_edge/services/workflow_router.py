"""
NG Edge Workflow Router - PRD v7.4.2 §0.2.1

Routes signals to appropriate WorkflowClass based on:
- ZoneType + SignalType + Mode (primary routing)
- ServiceAccessWindow authorization (override)
- LIFE_SAFETY priority (highest)

Routing priority (high to low):
0) ServiceAccessWindow AUTHORIZED → SUSPICION_LIGHT (audit session)
1) LIFE_SAFETY signals → LIFE_SAFETY (24H, ignores mode)
2) SECURITY_HEAVY zones + signals → SECURITY_HEAVY
3) EXTERIOR zone signals → SUSPICION_LIGHT
4) LOGISTICS signals → LOGISTICS
"""

from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime, timedelta

from ..domain.enums import (
    WorkflowClass,
    EventType,
    ZoneType,
    SignalType,
    HouseMode,
    NightSubMode,
    AccessDecision,
)


@dataclass
class ContextSignal:
    """A SUSPICION_LIGHT signal that can serve as context evidence (PRD §0.2.2).
    
    These are signals that occurred before a SECURITY_HEAVY trigger and can
    increase confidence that the Heavy event is a genuine intrusion.
    """
    signal_type: SignalType
    timestamp: datetime
    entry_point_id: str
    zone_id: str
    zone_type: ZoneType


@dataclass
class RouteResult:
    """Result of workflow routing decision."""
    workflow_class: WorkflowClass
    event_type: EventType
    access_decision: Optional[AccessDecision] = None
    reason: str = ""
    
    # Context evidence flags (PRD §0.2.2)
    has_context_evidence: bool = False  # True if SUSPICION_LIGHT context detected
    context_signal_count: int = 0  # Number of context signals found
    shortened_entry_delay_sec: Optional[int] = None  # Shortened delay for Night_occupied


class ContextEvidenceChecker:
    """Checks for context evidence per PRD §0.2.2.
    
    Context Evidence: SUSPICION_LIGHT signals (person_detected, loiter, approach_entry)
    that occur within T_context_sec before a SECURITY_HEAVY trigger can serve as
    evidence that increases confidence in the intrusion.
    
    PRD Rules:
    - T_context_sec = 30: Look back 30 seconds from Heavy trigger
    - Signals: approach_entry, loiter, person_detected (if near entry)
    - Effect: Mark event with contextEvidence=true, attemptedBreakInSatisfied=true
    - Night_occupied: Shorten entry delay to min(10, floor(entryDelay/3))
    - Away: Do NOT shorten delay (avoid false alarms)
    """
    
    # Configuration (PRD §0.2.2 defaults)
    T_CONTEXT_SEC = 30  # Context window in seconds
    
    # Signals that count as context evidence
    CONTEXT_EVIDENCE_SIGNALS = frozenset({
        SignalType.APPROACH_ENTRY,
        SignalType.LOITER,
        SignalType.PERSON_DETECTED,  # Only if in EXTERIOR near entry point
    })
    
    # Triggers that can be enhanced by context
    CONTEXT_ENHANCEABLE_TRIGGERS = frozenset({
        SignalType.DOOR_OPEN,
        SignalType.WINDOW_OPEN,
        SignalType.GLASS_BREAK,
        SignalType.FORCED_ENTRY,
    })
    
    def check_for_context_evidence(
        self,
        trigger_signal: SignalType,
        trigger_timestamp: datetime,
        entry_point_id: Optional[str],
        recent_signals: List[ContextSignal],
        house_mode: HouseMode,
        night_sub_mode: Optional[NightSubMode],
        base_entry_delay_sec: int = 30,
    ) -> tuple[bool, int, Optional[int]]:
        """Check if a SECURITY_HEAVY trigger has context evidence.
        
        Args:
            trigger_signal: The SECURITY_HEAVY signal (door_open, forced_entry, etc.)
            trigger_timestamp: When the trigger occurred
            entry_point_id: The entry point where trigger occurred (for matching)
            recent_signals: List of recent ContextSignal objects
            house_mode: Current house mode
            night_sub_mode: Night sub-mode (if applicable)
            base_entry_delay_sec: Base entry delay (for shortening calculation)
        
        Returns:
            Tuple of:
            - has_context: True if context evidence found
            - context_count: Number of context signals found
            - shortened_delay: Shortened entry delay (if applicable), else None
        
        PRD §0.2.2 Rules:
        1. Look back T_context_sec (30s) from trigger
        2. Find SUSPICION_LIGHT signals at same entry point
        3. For Night_occupied ONLY: shorten delay to min(10, floor(delay/3))
        4. Away mode: NO shortening (avoid false alarm acceleration)
        """
        # Only certain triggers can be enhanced
        if trigger_signal not in self.CONTEXT_ENHANCEABLE_TRIGGERS:
            return False, 0, None
        
        # No signals to check
        if not recent_signals:
            return False, 0, None
        
        # Find context signals within time window
        cutoff_time = trigger_timestamp - timedelta(seconds=self.T_CONTEXT_SEC)
        
        matching_signals = []
        for sig in recent_signals:
            # Must be within time window
            if sig.timestamp < cutoff_time:
                continue
            
            # Must be a context-eligible signal type
            if sig.signal_type not in self.CONTEXT_EVIDENCE_SIGNALS:
                continue
            
            # If entry_point_id specified, must match (or be nearby)
            # For now, simple match; could expand to "nearby" logic
            if entry_point_id and sig.entry_point_id != entry_point_id:
                continue
            
            matching_signals.append(sig)
        
        has_context = len(matching_signals) > 0
        context_count = len(matching_signals)
        
        # Calculate shortened delay (PRD §0.2.2)
        shortened_delay = None
        if has_context and house_mode == HouseMode.NIGHT:
            # Only shorten for Night_occupied (PRD: "不得用于 Away")
            # Default to occupied if sub_mode not specified
            is_occupied = (night_sub_mode != NightSubMode.NIGHT_PERIMETER 
                          if night_sub_mode else True)
            
            if is_occupied:
                # min(10, floor(entryDelaySec/3))
                shortened_delay = min(10, base_entry_delay_sec // 3)
        
        return has_context, context_count, shortened_delay


# =============================================================================
# Signal Classification Sets
# =============================================================================

# LIFE_SAFETY signals (PRD §0.2.1 priority 1) - 24H, ignores mode
LIFE_SAFETY_SIGNALS = frozenset({
    SignalType.SMOKE_DETECTED,
    SignalType.CO_DETECTED,
    SignalType.FIRE_ALARM,
})

# SECURITY_HEAVY signals (PRD §0.2.1 priority 2)
SECURITY_HEAVY_SIGNALS = frozenset({
    SignalType.DOOR_OPEN,
    SignalType.WINDOW_OPEN,
    SignalType.FORCED_ENTRY,
    SignalType.GLASS_BREAK,
    SignalType.PANIC,
})

# Break-in signals that override ServiceAccessWindow (PRD §1.3.1)
BREAK_IN_SIGNALS = frozenset({
    SignalType.GLASS_BREAK,
    SignalType.FORCED_ENTRY,
})

# SUSPICION_LIGHT signals (PRD §0.2.1 priority 3)
SUSPICION_LIGHT_SIGNALS = frozenset({
    SignalType.PERSON_DETECTED,
    SignalType.VEHICLE_DETECTED,
    SignalType.LOITER,
    SignalType.APPROACH_ENTRY,
    SignalType.MOTION_ACTIVE,
})

# LOGISTICS signals (PRD §0.2.1 priority 4)
LOGISTICS_SIGNALS = frozenset({
    SignalType.PACKAGE_DELIVERED,
    SignalType.PACKAGE_REMOVED,
    SignalType.COURIER_ARRIVED,
})

# Zones that trigger SECURITY_HEAVY (PRD §0.2.1 priority 2)
SECURITY_HEAVY_ZONES = frozenset({
    ZoneType.ENTRY_EXIT,
    ZoneType.PERIMETER,
    ZoneType.INTERIOR,  # Interior motion triggers alarm in armed modes
    ZoneType.FIRE_24H,
    ZoneType.CO_24H,
})

# 24H zones (always armed)
ALWAYS_ARMED_ZONES = frozenset({
    ZoneType.FIRE_24H,
    ZoneType.CO_24H,
})


class WorkflowRouter:
    """Routes signals to WorkflowClass based on PRD §0.2.1 rules.
    
    Thread-safe, stateless router. Each route() call is independent.
    """
    
    def __init__(self):
        """Initialize the router with a context evidence checker."""
        self.context_checker = ContextEvidenceChecker()
    
    def route(
        self,
        signal_type: SignalType,
        zone_type: ZoneType,
        house_mode: HouseMode,
        access_decision: Optional[AccessDecision] = None,
        recent_interior_activity: bool = False,
        recent_exterior_activity: bool = False,
        night_sub_mode: Optional[NightSubMode] = None,
        # Context Evidence (PRD §0.2.2) - NEW parameters
        recent_signals: Optional[List[ContextSignal]] = None,
        signal_timestamp: Optional[datetime] = None,
        entry_point_id: Optional[str] = None,
        base_entry_delay_sec: int = 30,
    ) -> RouteResult:
        """Route a signal to appropriate WorkflowClass.
        
        Args:
            signal_type: Type of signal received
            zone_type: Zone where signal originated
            house_mode: Current house mode
            access_decision: ServiceAccessWindow decision (if applicable)
            recent_interior_activity: True if recent motion/activity inside (NIGHT mode direction)
            recent_exterior_activity: True if recent person detected outside (NIGHT mode direction)
            night_sub_mode: NIGHT mode sub-mode (OCCUPIED vs PERIMETER)
            recent_signals: Recent SUSPICION_LIGHT signals for context evidence (PRD §0.2.2)
            signal_timestamp: When this signal occurred (for context window calculation)
            entry_point_id: Entry point ID (for context matching)
            base_entry_delay_sec: Base entry delay (for shortening calculation)
        
        Returns:
            RouteResult with workflow_class, event_type, context evidence, and routing reason
        """
        # Priority 1: LIFE_SAFETY (24H, ignores mode) - highest priority
        # Must check BEFORE ServiceAccessWindow authorization
        if signal_type in LIFE_SAFETY_SIGNALS:
            return self._route_life_safety(signal_type, access_decision)
        
        # Priority 0: ServiceAccessWindow AUTHORIZED override
        # But BREAK_IN signals always override authorization (PRD §1.3.1)
        if access_decision == AccessDecision.AUTHORIZED:
            if signal_type not in BREAK_IN_SIGNALS:
                return RouteResult(
                    workflow_class=WorkflowClass.SUSPICION_LIGHT,
                    event_type=EventType.AUTHORIZED_ACCESS_SESSION,
                    access_decision=access_decision,
                    reason="ServiceAccessWindow AUTHORIZED - routed to audit session",
                )
            # Break-in during authorized window - continue to normal routing
            # but mark access_decision for audit
        
        # (LIFE_SAFETY already handled above)
        if signal_type in LIFE_SAFETY_SIGNALS:
            return self._route_life_safety(signal_type, access_decision)
        
        # Priority 4: LOGISTICS (before security check, mode-independent)
        if signal_type in LOGISTICS_SIGNALS:
            return self._route_logistics(signal_type)
        
        # Check if system is armed (for security routing)
        is_armed = house_mode != HouseMode.DISARMED
        is_24h_zone = zone_type in ALWAYS_ARMED_ZONES
        
        # HOME mode special handling:
        # - ENTRY_EXIT zones: no alarm (family coming/going)
        # - INTERIOR zones: no alarm (family moving around)
        # - BREAK_IN signals (forced_entry, glass_break): ALWAYS alarm
        # - EXTERIOR: suspicion_light only
        is_home_mode = house_mode == HouseMode.HOME
        
        # NIGHT mode special handling with DIRECTION DETECTION:
        # Intrusion pattern (ALARM): outside activity → door opens
        # Family pattern (NO ALARM): inside activity → door opens, or door opens alone
        #
        # Rules:
        # - BREAK_IN signals: ALWAYS alarm
        # - INTERIOR motion: no alarm (family getting up)
        # - EXTERIOR person/vehicle with NO prior interior activity: PRE-ALERT
        # - ENTRY_EXIT door_open:
        #   - If recent_exterior_activity (someone outside first): ALARM (intrusion)
        #   - If recent_interior_activity (family moved first): NO ALARM (family leaving)
        #   - If no prior activity: NO ALARM (family leaving, benefit of doubt)
        is_night_mode = house_mode == HouseMode.NIGHT
        
        # Priority 2: SECURITY_HEAVY
        if signal_type in SECURITY_HEAVY_SIGNALS:
            # Only route to SECURITY_HEAVY if armed or 24H zone
            if is_armed or is_24h_zone:
                # HOME mode special handling
                if is_home_mode:
                    # BREAK_IN signals always trigger alarm in any zone
                    if signal_type in BREAK_IN_SIGNALS:
                        return self._route_security_heavy(
                            signal_type, zone_type, access_decision,
                            recent_signals, signal_timestamp, entry_point_id,
                            house_mode, night_sub_mode, base_entry_delay_sec
                        )
                    # HOME mode: ENTRY_EXIT and INTERIOR activity - no alarm
                    elif zone_type in (ZoneType.ENTRY_EXIT, ZoneType.INTERIOR):
                        return RouteResult(
                            workflow_class=WorkflowClass.SUSPICION_LIGHT,
                            event_type=EventType.ACTIVITY_DETECTED,
                            access_decision=access_decision,
                            reason=f"HOME mode: {zone_type.value} activity - no alarm",
                        )
                # NIGHT mode special handling with direction detection
                elif is_night_mode:
                    # NIGHT_PERIMETER: Full protection, no direction detection
                    # (nobody should be home, any door open is intrusion)
                    is_night_perimeter = night_sub_mode == NightSubMode.NIGHT_PERIMETER
                    
                    # BREAK_IN signals always trigger alarm
                    if signal_type in BREAK_IN_SIGNALS:
                        return self._route_security_heavy(
                            signal_type, zone_type, access_decision,
                            recent_signals, signal_timestamp, entry_point_id,
                            house_mode, night_sub_mode, base_entry_delay_sec
                        )
                    
                    # NIGHT_PERIMETER: treat like AWAY mode (full protection)
                    if is_night_perimeter:
                        if zone_type in SECURITY_HEAVY_ZONES:
                            return self._route_security_heavy(
                                signal_type, zone_type, access_decision,
                                recent_signals, signal_timestamp, entry_point_id,
                                house_mode, night_sub_mode, base_entry_delay_sec
                            )
                    
                    # NIGHT_OCCUPIED: direction detection for smart behavior
                    # Interior motion - no alarm (family getting up)
                    if zone_type == ZoneType.INTERIOR:
                        return RouteResult(
                            workflow_class=WorkflowClass.SUSPICION_LIGHT,
                            event_type=EventType.ACTIVITY_DETECTED,
                            access_decision=access_decision,
                            reason=f"NIGHT mode: interior activity - no alarm (family moving)",
                        )
                    # ENTRY_EXIT door open - check direction!
                    elif zone_type == ZoneType.ENTRY_EXIT:
                        # Intrusion pattern: exterior activity preceded this door open
                        if recent_exterior_activity and not recent_interior_activity:
                            return self._route_security_heavy(
                                signal_type, zone_type, access_decision,
                                recent_signals, signal_timestamp, entry_point_id,
                                house_mode, night_sub_mode, base_entry_delay_sec
                            )
                        # Family pattern: interior activity first, or no prior activity
                        else:
                            return RouteResult(
                                workflow_class=WorkflowClass.SUSPICION_LIGHT,
                                event_type=EventType.ACTIVITY_DETECTED,
                                access_decision=access_decision,
                                reason="NIGHT mode: door open from inside - no alarm (family leaving)",
                            )
                    # PERIMETER zone - alarm
                    elif zone_type == ZoneType.PERIMETER:
                        return self._route_security_heavy(
                            signal_type, zone_type, access_decision,
                            recent_signals, signal_timestamp, entry_point_id,
                            house_mode, night_sub_mode, base_entry_delay_sec
                        )
                else:
                    # AWAY mode: normal security routing (full protection)
                    # INTERIOR is now in SECURITY_HEAVY_ZONES
                    if zone_type in SECURITY_HEAVY_ZONES:
                        return self._route_security_heavy(
                            signal_type, zone_type, access_decision,
                            recent_signals, signal_timestamp, entry_point_id,
                            house_mode, night_sub_mode, base_entry_delay_sec
                        )
        
        # Priority 3: SUSPICION_LIGHT
        if signal_type in SUSPICION_LIGHT_SIGNALS:
            if zone_type == ZoneType.EXTERIOR:
                # HOME mode: exterior activity is normal, no alert needed
                if is_home_mode:
                    return RouteResult(
                        workflow_class=WorkflowClass.SUSPICION_LIGHT,
                        event_type=EventType.ACTIVITY_DETECTED,
                        access_decision=access_decision,
                        reason="HOME mode: exterior activity - no alert (normal)",
                    )
                return self._route_suspicion_light(signal_type, access_decision,
                                                   house_mode, night_sub_mode)
            elif zone_type == ZoneType.INTERIOR:
                # HOME mode: interior activity is normal, no alarm
                if is_home_mode:
                    return RouteResult(
                        workflow_class=WorkflowClass.SUSPICION_LIGHT,
                        event_type=EventType.ACTIVITY_DETECTED,
                        access_decision=access_decision,
                        reason="HOME mode: interior activity - no alarm (family moving)",
                    )
                # NIGHT_OCCUPIED mode: interior activity is normal (family getting up)
                if is_night_mode and night_sub_mode != NightSubMode.NIGHT_PERIMETER:
                    return RouteResult(
                        workflow_class=WorkflowClass.SUSPICION_LIGHT,
                        event_type=EventType.ACTIVITY_DETECTED,
                        access_decision=access_decision,
                        reason="NIGHT mode: interior activity - no alarm (family getting up)",
                    )
                # AWAY or NIGHT_PERIMETER: INTERIOR motion - security event
                # (Merged: instant + follower → unified INTERIOR)
                if is_armed:
                    return RouteResult(
                        workflow_class=WorkflowClass.SECURITY_HEAVY,
                        event_type=EventType.INTRUSION_CONFIRMED,
                        access_decision=access_decision,
                        reason="INTERIOR motion in armed mode - immediate alarm",
                    )
        
        # Default: No workflow (signal filtered/ignored)
        return RouteResult(
            workflow_class=WorkflowClass.SUSPICION_LIGHT,
            event_type=EventType.PRE_ALERT,
            access_decision=access_decision,
            reason=f"No specific routing rule for {signal_type.value} in {zone_type.value}",
        )
    
    def _route_life_safety(
        self,
        signal_type: SignalType,
        access_decision: Optional[AccessDecision],
    ) -> RouteResult:
        """Route LIFE_SAFETY signals (PRD §0.2.1 priority 1)."""
        if signal_type == SignalType.SMOKE_DETECTED:
            event_type = EventType.SMOKE_ALARM
        elif signal_type == SignalType.CO_DETECTED:
            event_type = EventType.CO_ALARM
        else:
            event_type = EventType.SMOKE_ALARM  # fire_alarm maps to smoke
        
        return RouteResult(
            workflow_class=WorkflowClass.LIFE_SAFETY,
            event_type=event_type,
            access_decision=access_decision,
            reason=f"LIFE_SAFETY signal ({signal_type.value}) - 24H priority",
        )
    
    def _route_security_heavy(
        self,
        signal_type: SignalType,
        zone_type: ZoneType,
        access_decision: Optional[AccessDecision],
        # Context evidence parameters (PRD §0.2.2)
        recent_signals: Optional[List[ContextSignal]] = None,
        signal_timestamp: Optional[datetime] = None,
        entry_point_id: Optional[str] = None,
        house_mode: Optional[HouseMode] = None,
        night_sub_mode: Optional[NightSubMode] = None,
        base_entry_delay_sec: int = 30,
    ) -> RouteResult:
        """Route SECURITY_HEAVY signals (PRD §0.2.1 priority 2).
        
        Also checks for context evidence (PRD §0.2.2) if applicable.
        """
        # Determine event type based on signal
        if signal_type == SignalType.GLASS_BREAK:
            event_type = EventType.GLASS_BREAK
        elif signal_type == SignalType.FORCED_ENTRY:
            event_type = EventType.FORCED_ENTRY
        elif zone_type == ZoneType.PERIMETER:
            event_type = EventType.PERIMETER_BREACH
        else:
            event_type = EventType.INTRUSION_ATTEMPTED
        
        reason = f"SECURITY_HEAVY: {signal_type.value} in {zone_type.value}"
        if access_decision == AccessDecision.AUTHORIZED:
            reason += " (break-in signal overrides authorization)"
        
        # Check for context evidence (PRD §0.2.2)
        has_context = False
        context_count = 0
        shortened_delay = None
        
        if recent_signals and signal_timestamp and house_mode:
            has_context, context_count, shortened_delay = (
                self.context_checker.check_for_context_evidence(
                    trigger_signal=signal_type,
                    trigger_timestamp=signal_timestamp,
                    entry_point_id=entry_point_id,
                    recent_signals=recent_signals,
                    house_mode=house_mode,
                    night_sub_mode=night_sub_mode,
                    base_entry_delay_sec=base_entry_delay_sec,
                )
            )
            
            if has_context:
                reason += f" [context: {context_count} prior signals]"
                if shortened_delay:
                    reason += f" [delay shortened to {shortened_delay}s]"
        
        return RouteResult(
            workflow_class=WorkflowClass.SECURITY_HEAVY,
            event_type=event_type,
            access_decision=access_decision,
            reason=reason,
            has_context_evidence=has_context,
            context_signal_count=context_count,
            shortened_entry_delay_sec=shortened_delay,
        )
    
    
    def _route_suspicion_light(
        self,
        signal_type: SignalType,
        access_decision: Optional[AccessDecision],
        house_mode: Optional[HouseMode] = None,
        night_sub_mode: Optional[NightSubMode] = None,
    ) -> RouteResult:
        """Route SUSPICION_LIGHT signals (PRD §0.2.1 priority 3)."""
        # Determine event type based on mode
        # NIGHT_OCCUPIED: exterior activity might be normal (e.g., family taking out trash)
        # Use PRE_ALERT for actual suspicious activity that needs attention
        if house_mode == HouseMode.NIGHT and night_sub_mode == NightSubMode.NIGHT_OCCUPIED:
            # In NIGHT_OCCUPIED, exterior PERSON_DETECTED should be PRE_ALERT
            # (someone outside while family is sleeping = worth noticing)
            event_type = EventType.PRE_ALERT
        else:
            # AWAY/NIGHT_PERIMETER: definitely suspicious
            event_type = EventType.PRE_ALERT
        
        return RouteResult(
            workflow_class=WorkflowClass.SUSPICION_LIGHT,
            event_type=event_type,
            access_decision=access_decision,
            reason=f"SUSPICION_LIGHT: {signal_type.value} in EXTERIOR zone",
        )
    
    def _route_logistics(self, signal_type: SignalType) -> RouteResult:
        """Route LOGISTICS signals (PRD §0.2.1 priority 4)."""
        if signal_type == SignalType.PACKAGE_DELIVERED:
            event_type = EventType.PACKAGE_DELIVERED
        elif signal_type == SignalType.PACKAGE_REMOVED:
            event_type = EventType.PACKAGE_REMOVED
        else:
            event_type = EventType.PACKAGE_DELIVERED
        
        return RouteResult(
            workflow_class=WorkflowClass.LOGISTICS,
            event_type=event_type,
            reason=f"LOGISTICS signal ({signal_type.value})",
        )
    
    def should_create_event(
        self,
        result: RouteResult,
        house_mode: HouseMode,
    ) -> bool:
        """Determine if this routing result should create a new event.
        
        All routed signals create events except in DISARMED mode
        (where only authorized sessions and life safety create events).
        """
        # LIFE_SAFETY always creates events (24H)
        if result.workflow_class == WorkflowClass.LIFE_SAFETY:
            return True
        
        # LOGISTICS always creates events (mode-independent)
        if result.workflow_class == WorkflowClass.LOGISTICS:
            return True
        
        # DISARMED mode: only create for authorized sessions and life safety
        if house_mode == HouseMode.DISARMED:
            return result.event_type == EventType.AUTHORIZED_ACCESS_SESSION
        
        # All other signals create events when armed
        return True
