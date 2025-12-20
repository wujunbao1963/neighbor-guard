"""
NG Edge Signal Pipeline - PRD v7.4.2

Integrates:
- Debounce/Nuisance Filter (§3.2.1)
- WorkflowRouter (§0.2.1)
- AlarmStateMachine (§3)
- AlertLevelCalculator (§1.4)

Pipeline stages:
1. Debounce Filter - Filter noise/bounce signals
2. Evidence Builder - Convert signal to evidence
3. Workflow Router - Determine workflow class
4. AlarmSM - Update alarm state
5. Alert Calculator - Calculate alert levels
6. Output - Generate ProcessedSignal result
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable
from collections import defaultdict
import uuid

from ..domain.enums import (
    SignalType,
    ZoneType,
    WorkflowClass,
    AlarmState,
    EventType,
    EventDisposition,
    HouseMode,
    NightSubMode,
    UserAlertLevel,
    DispatchReadinessLevel,
    DispatchRecommendation,
    AccessDecision,
)
from ..domain.models import Signal, Evidence, SecurityEvent, ModeConfig, Topology

from .workflow_router import WorkflowRouter, RouteResult
from .alarm_sm import AlarmStateMachine, AlarmSMConfig, TransitionResult
from .alert_calculator import (
    AlertLevelCalculator,
    AlertPolicy,
    AlertContext,
    AlertLevelResult,
)


# =============================================================================
# Debounce Configuration (PRD §3.2.1)
# =============================================================================

@dataclass
class DebounceConfig:
    """Debounce rules per signal type (PRD §3.2.1)."""
    
    # Door contact
    door_min_open_duration_ms: int = 500
    door_bounce_window_sec: int = 5
    door_bounce_threshold: int = 3
    
    # Motion PIR
    motion_cooldown_sec: int = 10
    
    # Camera AI
    camera_cooldown_sec: int = 5
    
    # Glass break (no debounce, but merge duplicates)
    glass_break_cooldown_sec: int = 0
    
    # LIFE_SAFETY never suppressed on first occurrence
    life_safety_merge_window_sec: int = 5


# =============================================================================
# Pipeline Result
# =============================================================================

@dataclass
class ProcessedSignal:
    """Result of signal processing through pipeline."""
    signal: Signal
    
    # Debounce stage
    is_filtered: bool = False
    filter_reason: Optional[str] = None
    
    # Evidence (if not filtered)
    evidence: Optional[Evidence] = None
    
    # Routing result
    route_result: Optional[RouteResult] = None
    
    # AlarmSM transition (if any)
    transition: Optional[TransitionResult] = None
    
    # Alert levels
    alert_result: Optional[AlertLevelResult] = None
    
    # Event reference
    event_id: Optional[str] = None
    event_created: bool = False
    
    # Summary
    @property
    def requires_action(self) -> bool:
        """Check if this signal requires user action."""
        if self.is_filtered:
            return False
        if self.alert_result:
            return self.alert_result.user_alert_level >= UserAlertLevel.STRONG
        return False


# =============================================================================
# Debounce Filter
# =============================================================================

class DebounceFilter:
    """Signal debounce/nuisance filter (PRD §3.2.1).
    
    Filters noise while preserving raw signal audit trail.
    """
    
    def __init__(self, config: Optional[DebounceConfig] = None):
        self.config = config or DebounceConfig()
        
        # Track signal history per sensor
        self._signal_history: dict[str, list[tuple[datetime, SignalType]]] = defaultdict(list)
        
        # Track last valid signal time per sensor (for cooldown)
        self._last_valid: dict[str, datetime] = {}
    
    def filter(self, signal: Signal, now: Optional[datetime] = None) -> tuple[bool, Optional[str]]:
        """Check if signal should be filtered.
        
        Args:
            signal: Signal to check
            now: Current time (for testing)
        
        Returns:
            Tuple of (should_filter, reason)
        """
        now = now or datetime.now(timezone.utc)
        sensor_id = signal.sensor_id
        signal_type = signal.signal_type
        
        # Record signal in history (for audit, even if filtered)
        self._signal_history[sensor_id].append((now, signal_type))
        self._cleanup_old_history(sensor_id, now)
        
        # LIFE_SAFETY: never filter first occurrence
        if self._is_life_safety(signal_type):
            if self._is_duplicate_life_safety(sensor_id, now):
                return False, None  # Allow but could merge
            return False, None
        
        # Glass break: no debounce
        if signal_type == SignalType.GLASS_BREAK:
            return False, None
        
        # Door contact debounce
        if signal_type in (SignalType.DOOR_OPEN, SignalType.DOOR_CLOSE):
            return self._filter_door_contact(sensor_id, signal_type, now)
        
        # Motion cooldown
        if signal_type == SignalType.MOTION_ACTIVE:
            return self._filter_motion(sensor_id, now)
        
        # Camera AI cooldown
        if signal_type in (SignalType.PERSON_DETECTED, SignalType.VEHICLE_DETECTED,
                          SignalType.LOITER, SignalType.APPROACH_ENTRY):
            return self._filter_camera(sensor_id, now)
        
        # Default: allow
        return False, None
    
    def _is_life_safety(self, signal_type: SignalType) -> bool:
        """Check if signal is life safety type."""
        return signal_type in (
            SignalType.SMOKE_DETECTED,
            SignalType.CO_DETECTED,
            SignalType.FIRE_ALARM,
        )
    
    def _is_duplicate_life_safety(self, sensor_id: str, now: datetime) -> bool:
        """Check if this is a duplicate life safety signal within merge window."""
        cutoff = now - timedelta(seconds=self.config.life_safety_merge_window_sec)
        history = self._signal_history[sensor_id]
        
        # Count life safety signals in window
        count = sum(1 for ts, st in history if ts >= cutoff and self._is_life_safety(st))
        return count > 1
    
    def _filter_door_contact(
        self,
        sensor_id: str,
        signal_type: SignalType,
        now: datetime,
    ) -> tuple[bool, Optional[str]]:
        """Apply door contact debounce rules."""
        history = self._signal_history[sensor_id]
        window_start = now - timedelta(seconds=self.config.door_bounce_window_sec)
        
        # Count open/close transitions in window
        transitions = [
            (ts, st) for ts, st in history
            if ts >= window_start and st in (SignalType.DOOR_OPEN, SignalType.DOOR_CLOSE)
        ]
        
        if len(transitions) >= self.config.door_bounce_threshold:
            return True, f"Door bounce detected ({len(transitions)} transitions in {self.config.door_bounce_window_sec}s)"
        
        return False, None
    
    def _filter_motion(self, sensor_id: str, now: datetime) -> tuple[bool, Optional[str]]:
        """Apply motion cooldown."""
        last = self._last_valid.get(sensor_id)
        if last:
            elapsed = (now - last).total_seconds()
            if elapsed < self.config.motion_cooldown_sec:
                return True, f"Motion cooldown ({elapsed:.1f}s < {self.config.motion_cooldown_sec}s)"
        
        # Mark as valid
        self._last_valid[sensor_id] = now
        return False, None
    
    def _filter_camera(self, sensor_id: str, now: datetime) -> tuple[bool, Optional[str]]:
        """Apply camera AI cooldown."""
        last = self._last_valid.get(sensor_id)
        if last:
            elapsed = (now - last).total_seconds()
            if elapsed < self.config.camera_cooldown_sec:
                return True, f"Camera cooldown ({elapsed:.1f}s < {self.config.camera_cooldown_sec}s)"
        
        self._last_valid[sensor_id] = now
        return False, None
    
    def _cleanup_old_history(self, sensor_id: str, now: datetime) -> None:
        """Remove old history entries."""
        max_age = max(
            self.config.door_bounce_window_sec,
            self.config.motion_cooldown_sec,
            self.config.camera_cooldown_sec,
            60,  # Keep at least 60s
        )
        cutoff = now - timedelta(seconds=max_age)
        
        self._signal_history[sensor_id] = [
            (ts, st) for ts, st in self._signal_history[sensor_id]
            if ts >= cutoff
        ]
    
    def reset(self) -> None:
        """Reset filter state."""
        self._signal_history.clear()
        self._last_valid.clear()


# =============================================================================
# Evidence Builder
# =============================================================================

class EvidenceBuilder:
    """Builds Evidence records from Signals."""
    
    def __init__(self, topology: Optional[Topology] = None):
        self.topology = topology
    
    def build(self, signal: Signal, now: Optional[datetime] = None) -> Evidence:
        """Build Evidence from Signal.
        
        Args:
            signal: Source signal
            now: Current time
        
        Returns:
            Evidence record
        """
        now = now or datetime.now(timezone.utc)
        
        # Get zone info from topology if available
        zone_type = ZoneType.EXTERIOR  # Default
        location_type = signal.raw_payload.get("location_type", "outdoor") if signal.raw_payload else "outdoor"
        
        zone = None
        if self.topology:
            zone = self.topology.get_zone(signal.zone_id)
            if zone:
                zone_type = zone.zone_type
                location_type = zone.location_type.value
        
        # DEBUG
        print(f"  EvidenceBuilder: signal.zone_id={signal.zone_id}")
        print(f"  EvidenceBuilder: topology has {len(self.topology.zones) if self.topology else 0} zones")
        print(f"  EvidenceBuilder: zone found={zone is not None}, zone_type={zone_type.value}")
        
        return Evidence(
            evidence_id=f"ev_{uuid.uuid4().hex[:12]}",
            timestamp=signal.timestamp,
            signal_id=signal.signal_id,
            sensor_id=signal.sensor_id,
            sensor_type=signal.sensor_type,
            signal_type=signal.signal_type,
            zone_id=signal.zone_id,
            zone_type=zone_type,
            location_type=location_type,
            entry_point_id=signal.entry_point_id,
            signal_confidence=signal.confidence,
            sensor_reliability=1.0,
            base_weight=1.0,
            raw_payload=signal.raw_payload,
        )


# =============================================================================
# Signal Pipeline
# =============================================================================

class SignalPipeline:
    """Main signal processing pipeline.
    
    Integrates all processing stages into a single entry point.
    """
    
    # Time window for direction detection (seconds)
    DIRECTION_WINDOW_SEC = 60
    
    def __init__(
        self,
        topology: Optional[Topology] = None,
        mode_config: Optional[ModeConfig] = None,
        debounce_config: Optional[DebounceConfig] = None,
        alarm_config: Optional[AlarmSMConfig] = None,
        alert_policy: Optional[AlertPolicy] = None,
        on_event_created: Optional[Callable[[SecurityEvent], None]] = None,
        on_event_updated: Optional[Callable[[SecurityEvent], None]] = None,
        on_pending_started: Optional[Callable[[int], None]] = None,  # Called with entry_delay_sec
    ):
        self.topology = topology
        self.mode_config = mode_config or ModeConfig(house_mode=HouseMode.DISARMED)
        
        # Components
        self.debounce = DebounceFilter(debounce_config)
        self.evidence_builder = EvidenceBuilder(topology)
        self.router = WorkflowRouter()
        self.alarm_sm = AlarmStateMachine(alarm_config, on_pending_started=on_pending_started)
        self.alert_calc = AlertLevelCalculator(alert_policy)
        
        # Callbacks
        self.on_event_created = on_event_created
        self.on_event_updated = on_event_updated
        
        # Active event tracking
        self._active_event: Optional[SecurityEvent] = None
        self._evidence_ledger: list[Evidence] = []
        
        # Recent activity tracking for direction detection (NIGHT mode)
        self._recent_activity: list[tuple[datetime, ZoneType, SignalType]] = []
    
    @property
    def active_event(self) -> Optional[SecurityEvent]:
        return self._active_event
    
    @property
    def alarm_state(self) -> AlarmState:
        return self.alarm_sm.state
    
    def set_mode(self, mode: HouseMode, night_sub_mode: Optional[NightSubMode] = None) -> None:
        """Update house mode."""
        self.mode_config = ModeConfig(
            house_mode=mode,
            night_sub_mode=night_sub_mode,
        )
    
    def process(
        self,
        signal: Signal,
        access_decision: Optional[AccessDecision] = None,
        now: Optional[datetime] = None,
    ) -> ProcessedSignal:
        """Process a signal through the pipeline.
        
        Args:
            signal: Input signal
            access_decision: ServiceAccessWindow decision (if applicable)
            now: Current time (for testing)
        
        Returns:
            ProcessedSignal with all processing results
        """
        now = now or datetime.now(timezone.utc)
        result = ProcessedSignal(signal=signal)
        
        # Stage 1: Debounce filter
        is_filtered, filter_reason = self.debounce.filter(signal, now)
        if is_filtered:
            result.is_filtered = True
            result.filter_reason = filter_reason
            signal.is_filtered = True
            return result
        
        # Stage 2: Build evidence
        evidence = self.evidence_builder.build(signal, now)
        result.evidence = evidence
        self._evidence_ledger.append(evidence)
        
        # Stage 2.5: Check recent activity for direction detection (NIGHT mode)
        recent_interior, recent_exterior = self._get_recent_activity(now)
        
        # Record this activity for future direction detection
        self._record_activity(now, evidence.zone_type, signal.signal_type)
        
        # Stage 3: Route to workflow
        route_result = self.router.route(
            signal_type=signal.signal_type,
            zone_type=evidence.zone_type,
            house_mode=self.mode_config.house_mode,
            access_decision=access_decision,
            recent_interior_activity=recent_interior,
            recent_exterior_activity=recent_exterior,
            night_sub_mode=self.mode_config.night_sub_mode,
        )
        result.route_result = route_result
        
        # Check if we should create/update event
        if not self.router.should_create_event(route_result, self.mode_config.house_mode):
            return result
        
        # Stage 4: Update AlarmSM
        transition = self._update_alarm_sm(signal, evidence, route_result, now)
        result.transition = transition
        
        # Stage 5: Create or update event
        event_created = self._manage_event(signal, evidence, route_result, transition, now)
        result.event_created = event_created
        if self._active_event:
            result.event_id = self._active_event.event_id
        
        # Stage 6: Calculate alert levels
        if self._active_event:
            alert_result = self._calculate_alerts()
            result.alert_result = alert_result
            self._update_event_alerts(alert_result)
        
        return result
    
    def _get_recent_activity(self, now: datetime) -> tuple[bool, bool]:
        """Check for recent interior/exterior activity within direction window.
        
        For NIGHT mode direction detection, we need to determine:
        - Is the MOST RECENT significant activity from EXTERIOR (intrusion pattern)?
        - Or from INTERIOR (family pattern)?
        
        Logic:
        - If last activity was EXTERIOR → intrusion (someone coming from outside)
        - If last activity was INTERIOR or no activity → family (someone going out)
        
        Returns:
            (recent_interior_activity, recent_exterior_activity)
            
        Note: We return (interior, exterior) booleans where the MORE RECENT one
        takes precedence. If exterior came AFTER interior, only exterior=True.
        """
        cutoff = now - timedelta(seconds=self.DIRECTION_WINDOW_SEC)
        
        # Clean up old activity
        self._recent_activity = [
            (ts, zt, st) for ts, zt, st in self._recent_activity
            if ts >= cutoff
        ]
        
        if not self._recent_activity:
            return False, False
        
        interior_zones = {ZoneType.INTERIOR}
        exterior_zones = {ZoneType.EXTERIOR}
        
        # Find the MOST RECENT interior and exterior activity timestamps
        last_interior_ts = None
        last_exterior_ts = None
        
        for ts, zt, _ in self._recent_activity:
            if zt in interior_zones:
                if last_interior_ts is None or ts > last_interior_ts:
                    last_interior_ts = ts
            elif zt in exterior_zones:
                if last_exterior_ts is None or ts > last_exterior_ts:
                    last_exterior_ts = ts
        
        # Determine which came more recently
        # If exterior is more recent than interior → intrusion pattern
        # If interior is more recent or only interior exists → family pattern
        
        if last_exterior_ts is not None and last_interior_ts is not None:
            # Both exist - compare timestamps
            if last_exterior_ts > last_interior_ts:
                # Exterior came AFTER interior - this is intrusion pattern
                return False, True
            else:
                # Interior came AFTER exterior - this is family pattern
                return True, False
        elif last_exterior_ts is not None:
            # Only exterior activity
            return False, True
        elif last_interior_ts is not None:
            # Only interior activity
            return True, False
        
        return False, False
    
    def _record_activity(self, now: datetime, zone_type: ZoneType, signal_type: SignalType) -> None:
        """Record activity for direction detection."""
        self._recent_activity.append((now, zone_type, signal_type))
    
    def _has_active_entry_event(self) -> bool:
        """Check if there's an active entry/security event."""
        if not self._active_event:
            return False
        return (
            self._active_event.workflow_class == WorkflowClass.SECURITY_HEAVY and
            self._active_event.alarm_state in (AlarmState.PENDING, AlarmState.TRIGGERED)
        )
    
    def _update_alarm_sm(
        self,
        signal: Signal,
        evidence: Evidence,
        route_result: RouteResult,
        now: datetime,
    ) -> Optional[TransitionResult]:
        """Update alarm state machine based on signal."""
        
        # Check for interior zone acceleration during PENDING
        # INTERIOR motion accelerates to TRIGGERED
        if self.alarm_sm.state == AlarmState.PENDING:
            if evidence.zone_type == ZoneType.INTERIOR:
                if signal.signal_type == SignalType.MOTION_ACTIVE:
                    return self.alarm_sm.trigger_follower_acceleration(
                        self.mode_config.house_mode,
                        now,
                    )
        
        # INTERIOR with no prior event should go directly to TRIGGERED
        # (only in armed modes and when it's a security signal)
        if (
            evidence.zone_type == ZoneType.INTERIOR and
            route_result.workflow_class == WorkflowClass.SECURITY_HEAVY and
            self.alarm_sm.state in (AlarmState.QUIET, AlarmState.PRE)
        ):
            # Trigger with 0 delay for instant zones
            return self.alarm_sm.trigger_zone_trip(
                zone_type=evidence.zone_type,
                signal_type=signal.signal_type,
                workflow_class=route_result.workflow_class,
                house_mode=self.mode_config.house_mode,
                night_sub_mode=self.mode_config.night_sub_mode,
                entry_delay_override=0,  # Instant - no delay
                now=now,
            )
        
        # Normal zone trip
        if route_result.workflow_class in (
            WorkflowClass.SECURITY_HEAVY,
            WorkflowClass.LIFE_SAFETY,
            WorkflowClass.SUSPICION_LIGHT,
        ):
            # Get entry delay from topology if available
            entry_delay = None
            if signal.entry_point_id and self.topology:
                entry_delay = self.topology.get_entry_delay(
                    signal.entry_point_id,
                    self.mode_config.house_mode,
                    self.mode_config.night_sub_mode,
                )
            
            return self.alarm_sm.trigger_zone_trip(
                zone_type=evidence.zone_type,
                signal_type=signal.signal_type,
                workflow_class=route_result.workflow_class,
                house_mode=self.mode_config.house_mode,
                night_sub_mode=self.mode_config.night_sub_mode,
                entry_delay_override=entry_delay,
                now=now,
            )
        
        return None
    
    def _manage_event(
        self,
        signal: Signal,
        evidence: Evidence,
        route_result: RouteResult,
        transition: Optional[TransitionResult],
        now: datetime,
    ) -> bool:
        """Create or update security event.
        
        Returns True if event was created, False if updated.
        """
        if self._active_event is None:
            # Create new event
            self._active_event = SecurityEvent(
                event_id=f"evt_{uuid.uuid4().hex[:12]}",
                created_at=now,
                updated_at=now,
                event_type=route_result.event_type,
                workflow_class=route_result.workflow_class,
                alarm_state=self.alarm_sm.state,
                house_mode=self.mode_config.house_mode,
                night_sub_mode=self.mode_config.night_sub_mode,
                primary_zone_id=evidence.zone_id,
                entry_point_id=signal.entry_point_id,
                evidence_ids=[evidence.evidence_id],
                trigger_signal_id=signal.signal_id,
                entry_delay_sec=self.alarm_sm.entry_delay_sec,
                pending_started_at=self.alarm_sm.pending_entered_at,
                access_decision=route_result.access_decision,
            )
            
            if self.on_event_created:
                self.on_event_created(self._active_event)
            
            return True
        else:
            # Update existing event
            self._active_event.updated_at = now
            self._active_event.alarm_state = self.alarm_sm.state
            self._active_event.evidence_ids.append(evidence.evidence_id)
            self._active_event.revision += 1
            
            # Update entry_delay_sec when transitioning to PENDING
            if self.alarm_sm.state == AlarmState.PENDING and self._active_event.entry_delay_sec == 0:
                self._active_event.entry_delay_sec = self.alarm_sm.entry_delay_sec
                self._active_event.pending_started_at = self.alarm_sm.pending_entered_at
            
            # Upgrade workflow class if new signal is more severe
            # Priority: LIFE_SAFETY > SECURITY_HEAVY > SUSPICION_LIGHT > LOGISTICS
            self._maybe_upgrade_workflow(route_result)
            
            if transition and transition.success:
                if self.alarm_sm.triggered_at:
                    self._active_event.triggered_at = self.alarm_sm.triggered_at
            
            if self.on_event_updated:
                self.on_event_updated(self._active_event)
            
            return False
    
    def _maybe_upgrade_workflow(self, route_result: RouteResult) -> None:
        """Upgrade event workflow class if new signal is more severe.
        
        PRD: Events can be upgraded but not downgraded.
        Priority: LIFE_SAFETY > SECURITY_HEAVY > SUSPICION_LIGHT > LOGISTICS
        """
        if not self._active_event:
            return
        
        # Workflow class priority (higher = more severe)
        priority = {
            WorkflowClass.LOGISTICS: 0,
            WorkflowClass.SUSPICION_LIGHT: 1,
            WorkflowClass.SECURITY_HEAVY: 2,
            WorkflowClass.LIFE_SAFETY: 3,
        }
        
        current_priority = priority.get(self._active_event.workflow_class, 0)
        new_priority = priority.get(route_result.workflow_class, 0)
        
        if new_priority > current_priority:
            self._active_event.workflow_class = route_result.workflow_class
            self._active_event.event_type = route_result.event_type
    
    def _calculate_alerts(self) -> AlertLevelResult:
        """Calculate alert levels for current event."""
        if not self._active_event:
            raise ValueError("No active event")
        
        context = AlertContext(
            workflow_class=self._active_event.workflow_class,
            alarm_state=self._active_event.alarm_state,
            house_mode=self._active_event.house_mode,
            night_sub_mode=self._active_event.night_sub_mode,
            zone_type=None,  # Could enhance with primary zone
            event_disposition=self._active_event.event_disposition,
            avs_level=self._active_event.avs_level,
            has_follower_confirmation=self._has_follower_confirmation(),
            has_multi_zone=self._has_multi_zone(),
        )
        
        return self.alert_calc.calculate(context)
    
    def _update_event_alerts(self, alert_result: AlertLevelResult) -> None:
        """Update event with calculated alert levels."""
        if not self._active_event:
            return
        
        self._active_event.user_alert_level = alert_result.user_alert_level
        self._active_event.dispatch_readiness_local = alert_result.dispatch_readiness_local
        self._active_event.dispatch_recommendation_local = alert_result.dispatch_recommendation
        self._active_event.update_peak_levels()
    
    def _has_follower_confirmation(self) -> bool:
        """Check if we have interior follower confirmation."""
        follower_types = {ZoneType.INTERIOR}
        return any(
            ev.zone_type in follower_types
            for ev in self._evidence_ledger
        )
    
    def _has_multi_zone(self) -> bool:
        """Check if multiple zones have been triggered."""
        zones = {ev.zone_id for ev in self._evidence_ledger}
        return len(zones) >= 2
    
    # =========================================================================
    # External Actions
    # =========================================================================
    
    def disarm(self, now: Optional[datetime] = None) -> Optional[TransitionResult]:
        """Process disarm action."""
        now = now or datetime.now(timezone.utc)
        result = self.alarm_sm.trigger_disarm(now)
        
        if result.success and self._active_event:
            self._active_event.alarm_state = self.alarm_sm.state
            self._active_event.event_disposition = self.alarm_sm.disposition
            self._active_event.updated_at = now
            self._active_event.revision += 1
            
            # Recalculate alerts
            alert_result = self._calculate_alerts()
            self._update_event_alerts(alert_result)
            
            if self.on_event_updated:
                self.on_event_updated(self._active_event)
        
        return result
    
    def trigger_entry_delay_expired(self, now: Optional[datetime] = None) -> Optional[TransitionResult]:
        """Handle entry delay timer expiration."""
        now = now or datetime.now(timezone.utc)
        result = self.alarm_sm.trigger_entry_delay_expired(now)
        
        if result.success and self._active_event:
            self._active_event.alarm_state = self.alarm_sm.state
            self._active_event.triggered_at = self.alarm_sm.triggered_at
            self._active_event.updated_at = now
            self._active_event.revision += 1
            
            # Recalculate alerts
            alert_result = self._calculate_alerts()
            self._update_event_alerts(alert_result)
            
            if self.on_event_updated:
                self.on_event_updated(self._active_event)
        
        return result
    
    def resolve(
        self,
        by_user: bool = False,
        verified_false: bool = False,
        now: Optional[datetime] = None,
    ) -> Optional[TransitionResult]:
        """Resolve the current event."""
        now = now or datetime.now(timezone.utc)
        result = self.alarm_sm.trigger_resolve(by_user, verified_false, now)
        
        if result.success and self._active_event:
            self._active_event.alarm_state = self.alarm_sm.state
            self._active_event.event_disposition = self.alarm_sm.disposition
            self._active_event.updated_at = now
            self._active_event.revision += 1
            
            if self.on_event_updated:
                self.on_event_updated(self._active_event)
        
        return result
    
    def reset(self) -> None:
        """Reset pipeline state."""
        self.debounce.reset()
        self.alarm_sm.reset()
        self._active_event = None
        self._evidence_ledger.clear()
        self._recent_activity.clear()
