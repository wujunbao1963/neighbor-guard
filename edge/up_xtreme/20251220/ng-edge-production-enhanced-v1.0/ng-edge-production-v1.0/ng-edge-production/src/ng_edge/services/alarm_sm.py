"""
NG Edge Alarm State Machine - PRD v7.4.2 §3

Manages alarm state transitions:
QUIET → PRE → PENDING → TRIGGERED → CANCELED/RESOLVED

Key rules (PRD §3.1.1):
1. PENDING → TRIGGERED only by: entry_delay expiry, delay=0, or follower acceleration
2. Disarm in PENDING → canceled_before_trigger
3. Disarm in TRIGGERED → canceled_after_trigger (AVS peak preserved)
4. siren_timeout only stops outputs, doesn't resolve event
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Optional, Callable

from ..domain.enums import (
    AlarmState,
    EventDisposition,
    WorkflowClass,
    HouseMode,
    NightSubMode,
    ZoneType,
    SignalType,
)


class TransitionTrigger(str, Enum):
    """What triggered the state transition."""
    # Entry triggers
    ZONE_TRIP = "zone_trip"
    ENTRY_ZONE_VIOLATED = "entry_zone_violated"
    PERIMETER_VIOLATED = "perimeter_violated"
    BREAK_IN_DETECTED = "break_in_detected"  # Glass break, forced entry
    LIFE_SAFETY = "life_safety"
    PANIC = "panic"
    
    # Timer triggers
    ENTRY_DELAY_EXPIRED = "entry_delay_expired"
    ENTRY_INSTANT_MODE = "entry_instant_mode"  # delay=0
    FOLLOWER_ACCELERATED = "follower_accelerated"
    SIREN_TIMEOUT = "siren_timeout"
    RESOLVE_TIMEOUT = "resolve_timeout"
    
    # User actions
    DISARM = "disarm"
    CANCEL = "cancel"
    USER_CANCEL = "user_cancel"
    RESOLVE_BY_USER = "resolve_by_user"
    
    # Verification
    VERIFIED_FALSE = "verified_false"
    VERIFIED_TRUE = "verified_true"


@dataclass
class TransitionResult:
    """Result of a state transition attempt."""
    success: bool
    from_state: AlarmState
    to_state: AlarmState
    trigger: TransitionTrigger
    reason: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Timer info
    entry_delay_sec: Optional[int] = None
    entry_delay_remaining_sec: Optional[int] = None


@dataclass 
class AlarmSMConfig:
    """Configuration for AlarmSM timers."""
    # Entry delays by mode (PRD §3.1.1)
    entry_delay_away_sec: int = 30
    entry_delay_night_occupied_sec: int = 15
    entry_delay_night_perimeter_sec: int = 0
    entry_delay_home_sec: int = 30
    
    # Other timers
    abort_window_sec: int = 30
    siren_timeout_sec: int = 180
    resolve_timeout_sec: int = 3600  # 1 hour
    
    # Follower acceleration (PRD §3.2.2)
    follower_path_sec: int = 20  # T_path_sec
    follower_accelerate_home: bool = False  # Default off in HOME mode


class AlarmStateMachine:
    """Alarm State Machine implementation (PRD §3).
    
    Thread-safe state machine for alarm event lifecycle.
    """
    
    def __init__(
        self,
        config: Optional[AlarmSMConfig] = None,
        on_state_change: Optional[Callable[[TransitionResult], None]] = None,
        on_pending_started: Optional[Callable[[int], None]] = None,  # Called with entry_delay_sec
    ):
        self.config = config or AlarmSMConfig()
        self.on_state_change = on_state_change
        self.on_pending_started = on_pending_started
        
        # Current state
        self._state = AlarmState.QUIET
        self._workflow_class: Optional[WorkflowClass] = None
        self._disposition = EventDisposition.PENDING
        
        # Timestamps
        self._pending_entered_at: Optional[datetime] = None
        self._triggered_at: Optional[datetime] = None
        self._canceled_at: Optional[datetime] = None
        self._resolved_at: Optional[datetime] = None
        
        # Timer tracking (actual timers managed externally)
        self._entry_delay_sec: int = 0
        self._abort_window_end: Optional[datetime] = None
        self._siren_timeout_end: Optional[datetime] = None
        
        # AVS tracking
        self._avs_peak: int = 0
        self._avs_final: int = 0
        
        # Transition history
        self._transitions: list[TransitionResult] = []
    
    @property
    def state(self) -> AlarmState:
        return self._state
    
    @property
    def disposition(self) -> EventDisposition:
        return self._disposition
    
    @property
    def pending_entered_at(self) -> Optional[datetime]:
        return self._pending_entered_at
    
    @property
    def triggered_at(self) -> Optional[datetime]:
        return self._triggered_at
    
    @property
    def entry_delay_sec(self) -> int:
        return self._entry_delay_sec
    
    @property
    def avs_peak(self) -> int:
        return self._avs_peak
    
    @property
    def avs_final(self) -> int:
        return self._avs_final
    
    def set_avs_level(self, level: int) -> None:
        """Update AVS level, tracking peak."""
        if level > self._avs_peak:
            self._avs_peak = level
    
    # =========================================================================
    # State Queries
    # =========================================================================
    
    def is_active(self) -> bool:
        """Check if alarm is in an active state (not quiet/canceled/resolved)."""
        return self._state in (AlarmState.PRE, AlarmState.PENDING, AlarmState.TRIGGERED)
    
    def is_in_entry_delay(self) -> bool:
        """Check if currently in PENDING with entry delay countdown."""
        return self._state == AlarmState.PENDING
    
    def is_in_abort_window(self, now: Optional[datetime] = None) -> bool:
        """Check if currently in abort window after TRIGGERED."""
        if self._state != AlarmState.TRIGGERED:
            return False
        if self._abort_window_end is None:
            return False
        now = now or datetime.now(timezone.utc)
        return now < self._abort_window_end
    
    def get_entry_delay_remaining(self, now: Optional[datetime] = None) -> int:
        """Get remaining entry delay seconds (0 if not in PENDING)."""
        if self._state != AlarmState.PENDING or self._pending_entered_at is None:
            return 0
        now = now or datetime.now(timezone.utc)
        elapsed = (now - self._pending_entered_at).total_seconds()
        remaining = self._entry_delay_sec - elapsed
        return max(0, int(remaining))
    
    # =========================================================================
    # Entry Delay Calculation
    # =========================================================================
    
    def get_entry_delay(
        self,
        house_mode: HouseMode,
        night_sub_mode: Optional[NightSubMode] = None,
        entry_point_delay: Optional[int] = None,
    ) -> int:
        """Get entry delay for current mode (PRD §3.1.1).
        
        Args:
            house_mode: Current house mode
            night_sub_mode: Night sub-mode if applicable
            entry_point_delay: Override delay from entry point config
        
        Returns:
            Entry delay in seconds
        """
        if entry_point_delay is not None:
            return entry_point_delay
        
        if house_mode == HouseMode.AWAY:
            return self.config.entry_delay_away_sec
        elif house_mode == HouseMode.NIGHT:
            if night_sub_mode == NightSubMode.NIGHT_PERIMETER:
                return self.config.entry_delay_night_perimeter_sec  # 0
            return self.config.entry_delay_night_occupied_sec
        elif house_mode == HouseMode.HOME:
            return self.config.entry_delay_home_sec
        else:
            return 0  # DISARMED
    
    # =========================================================================
    # State Transitions
    # =========================================================================
    
    def trigger_zone_trip(
        self,
        zone_type: ZoneType,
        signal_type: SignalType,
        workflow_class: WorkflowClass,
        house_mode: HouseMode,
        night_sub_mode: Optional[NightSubMode] = None,
        entry_delay_override: Optional[int] = None,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle a zone trip signal (PRD §3.2).
        
        This is the primary entry point for alarm escalation.
        """
        now = now or datetime.now(timezone.utc)
        self._workflow_class = workflow_class
        
        # LIFE_SAFETY: immediate TRIGGERED (PRD §0.2.1)
        if workflow_class == WorkflowClass.LIFE_SAFETY:
            return self._enter_triggered(
                TransitionTrigger.LIFE_SAFETY,
                f"Life safety signal: {signal_type.value}",
                now,
            )
        
        # SUSPICION_LIGHT: only goes to PRE (PRD §3.2)
        if workflow_class == WorkflowClass.SUSPICION_LIGHT:
            return self._enter_pre(
                TransitionTrigger.ZONE_TRIP,
                f"Suspicion signal: {signal_type.value}",
                now,
            )
        
        # LOGISTICS: stays QUIET (no AlarmSM involvement)
        if workflow_class == WorkflowClass.LOGISTICS:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.ZONE_TRIP,
                reason="Logistics workflow does not enter AlarmSM",
                timestamp=now,
            )
        
        # SECURITY_HEAVY: evaluate zone type
        # PERIMETER with GLASS_BREAK: immediate trigger (confirmed break-in)
        if zone_type == ZoneType.PERIMETER and signal_type == SignalType.GLASS_BREAK:
            return self._enter_triggered(
                TransitionTrigger.BREAK_IN_DETECTED,
                f"Glass break in perimeter zone: immediate alarm",
                now,
            )
        
        if zone_type in (ZoneType.ENTRY_EXIT, ZoneType.PERIMETER):
            entry_delay = self.get_entry_delay(
                house_mode, night_sub_mode, entry_delay_override
            )
            
            if entry_delay == 0:
                # delay=0: immediate TRIGGERED (PRD §3.3)
                return self._enter_triggered(
                    TransitionTrigger.ENTRY_INSTANT_MODE,
                    f"Instant trigger (delay=0): {signal_type.value} in {zone_type.value}",
                    now,
                )
            else:
                # Normal: enter PENDING with delay
                trigger = (
                    TransitionTrigger.ENTRY_ZONE_VIOLATED
                    if zone_type == ZoneType.ENTRY_EXIT
                    else TransitionTrigger.PERIMETER_VIOLATED
                )
                return self._enter_pending(
                    trigger,
                    f"{zone_type.value} violated: {signal_type.value}",
                    entry_delay,
                    now,
                )
        
        # INTERIOR: immediate trigger if armed (no delay)
        if zone_type == ZoneType.INTERIOR:
            # Use override delay if provided (usually 0), else instant
            entry_delay = entry_delay_override if entry_delay_override is not None else 0
            if entry_delay == 0:
                return self._enter_triggered(
                    TransitionTrigger.ENTRY_INSTANT_MODE,
                    f"Interior instant trigger: {signal_type.value}",
                    now,
                )
            else:
                return self._enter_pending(
                    TransitionTrigger.ENTRY_ZONE_VIOLATED,
                    f"Interior instant with delay: {signal_type.value}",
                    entry_delay,
                    now,
                )
        
        # Other zone types: don't initiate alarm
        return TransitionResult(
            success=False,
            from_state=self._state,
            to_state=self._state,
            trigger=TransitionTrigger.ZONE_TRIP,
            reason=f"Zone type {zone_type.value} cannot initiate alarm",
            timestamp=now,
        )
    
    def trigger_follower_acceleration(
        self,
        house_mode: HouseMode,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle follower acceleration (PRD §3.2.2).
        
        Only valid when in PENDING state and within T_path_sec window.
        """
        now = now or datetime.now(timezone.utc)
        
        # Must be in PENDING
        if self._state != AlarmState.PENDING:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.FOLLOWER_ACCELERATED,
                reason=f"Cannot accelerate from state {self._state.value}",
                timestamp=now,
            )
        
        # Check if within T_path_sec window
        if self._pending_entered_at:
            elapsed = (now - self._pending_entered_at).total_seconds()
            if elapsed > self.config.follower_path_sec:
                return TransitionResult(
                    success=False,
                    from_state=self._state,
                    to_state=self._state,
                    trigger=TransitionTrigger.FOLLOWER_ACCELERATED,
                    reason=f"Follower signal outside T_path window ({elapsed:.1f}s > {self.config.follower_path_sec}s)",
                    timestamp=now,
                )
        
        # Check HOME mode restriction
        if house_mode == HouseMode.HOME and not self.config.follower_accelerate_home:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.FOLLOWER_ACCELERATED,
                reason="Follower acceleration disabled in HOME mode",
                timestamp=now,
            )
        
        # Accelerate to TRIGGERED
        return self._enter_triggered(
            TransitionTrigger.FOLLOWER_ACCELERATED,
            "Interior follower triggered during entry delay - accelerating to TRIGGERED",
            now,
        )
    
    def trigger_entry_delay_expired(
        self,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle entry delay timer expiration (PRD §3.4).
        
        Called by external timer when entry delay countdown completes.
        """
        now = now or datetime.now(timezone.utc)
        
        if self._state != AlarmState.PENDING:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.ENTRY_DELAY_EXPIRED,
                reason=f"Entry delay expiry ignored - not in PENDING (current: {self._state.value})",
                timestamp=now,
            )
        
        return self._enter_triggered(
            TransitionTrigger.ENTRY_DELAY_EXPIRED,
            f"Entry delay expired ({self._entry_delay_sec}s)",
            now,
        )
    
    def trigger_user_cancel(
        self,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle user cancel action (PRE, PENDING, or TRIGGERED state).
        
        Records event and returns to QUIET state.
        """
        now = now or datetime.now(timezone.utc)
        
        if self._state == AlarmState.PRE:
            self._avs_final = 0
            self._disposition = EventDisposition.CANCELED_BEFORE_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.USER_CANCEL,
                "User canceled during pre-alert",
                now,
            )
        
        elif self._state == AlarmState.PENDING:
            self._avs_final = 0
            self._disposition = EventDisposition.CANCELED_BEFORE_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.USER_CANCEL,
                "User canceled during entry delay",
                now,
            )
        
        elif self._state == AlarmState.TRIGGERED:
            self._avs_final = self._avs_peak
            self._disposition = EventDisposition.CANCELED_AFTER_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.USER_CANCEL,
                "User canceled after trigger",
                now,
            )
        
        else:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.USER_CANCEL,
                reason=f"Cannot cancel from state {self._state.value}",
                timestamp=now,
            )
    
    def trigger_disarm(
        self,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle disarm action (PRD §3.5).
        
        Sets disposition based on current state:
        - PENDING → canceled_before_trigger (avs_final=0)
        - TRIGGERED → canceled_after_trigger (avs_final=avs_peak)
        """
        now = now or datetime.now(timezone.utc)
        
        if self._state == AlarmState.PENDING:
            # Canceled before trigger - AVS resets (PRD §3.5)
            self._avs_final = 0
            self._disposition = EventDisposition.CANCELED_BEFORE_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.DISARM,
                "Disarmed during entry delay (before trigger)",
                now,
            )
        
        elif self._state == AlarmState.TRIGGERED:
            # Canceled after trigger - preserve AVS peak (PRD §3.5)
            self._avs_final = self._avs_peak
            self._disposition = EventDisposition.CANCELED_AFTER_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.DISARM,
                "Disarmed after trigger (AVS peak preserved)",
                now,
            )
        
        elif self._state == AlarmState.PRE:
            # Pre-alert canceled
            self._avs_final = 0
            self._disposition = EventDisposition.CANCELED_BEFORE_TRIGGER
            return self._enter_canceled(
                TransitionTrigger.DISARM,
                "Disarmed during pre-alert",
                now,
            )
        
        else:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.DISARM,
                reason=f"Cannot disarm from state {self._state.value}",
                timestamp=now,
            )
    
    def trigger_siren_timeout(
        self,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Handle siren timeout (PRD §3.1.1).
        
        Only stops siren outputs, does NOT resolve the event.
        Event remains TRIGGERED for DCV/collaboration.
        """
        now = now or datetime.now(timezone.utc)
        
        if self._state != AlarmState.TRIGGERED:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.SIREN_TIMEOUT,
                reason=f"Siren timeout ignored - not TRIGGERED (current: {self._state.value})",
                timestamp=now,
            )
        
        # Siren timeout does NOT change state (PRD §3.1.1 rule 4)
        # Just records that outputs should stop
        self._siren_timeout_end = now
        
        return TransitionResult(
            success=True,
            from_state=self._state,
            to_state=self._state,  # State unchanged
            trigger=TransitionTrigger.SIREN_TIMEOUT,
            reason="Siren timeout - outputs stopped, event continues",
            timestamp=now,
        )
    
    def trigger_resolve(
        self,
        by_user: bool = False,
        verified_false: bool = False,
        now: Optional[datetime] = None,
    ) -> TransitionResult:
        """Resolve the event (returns to QUIET state).
        
        Args:
            by_user: True if user explicitly resolved
            verified_false: True if confirmed as false alarm
        """
        now = now or datetime.now(timezone.utc)
        
        # 只有 TRIGGERED 状态可以 resolve
        if self._state != AlarmState.TRIGGERED:
            return TransitionResult(
                success=False,
                from_state=self._state,
                to_state=self._state,
                trigger=TransitionTrigger.RESOLVE_BY_USER,
                reason=f"Cannot resolve from state {self._state.value}, only TRIGGERED can be resolved",
                timestamp=now,
            )
        
        if verified_false:
            self._avs_final = 0
            self._disposition = EventDisposition.VERIFIED_FALSE
            trigger = TransitionTrigger.VERIFIED_FALSE
            reason = "Event verified as false alarm"
        elif by_user:
            self._avs_final = self._avs_peak
            self._disposition = EventDisposition.RESOLVED_BY_USER
            trigger = TransitionTrigger.RESOLVE_BY_USER
            reason = "Event resolved by user"
        else:
            self._avs_final = self._avs_peak
            self._disposition = EventDisposition.RESOLVED_TIMEOUT
            trigger = TransitionTrigger.RESOLVE_TIMEOUT
            reason = "Event resolved by timeout"
        
        return self._enter_resolved(trigger, reason, now)
    
    # =========================================================================
    # Internal State Transitions
    # =========================================================================
    
    def _enter_pre(
        self,
        trigger: TransitionTrigger,
        reason: str,
        now: datetime,
    ) -> TransitionResult:
        """Transition to PRE state."""
        from_state = self._state
        
        # Can only enter PRE from QUIET
        if self._state != AlarmState.QUIET:
            return TransitionResult(
                success=False,
                from_state=from_state,
                to_state=self._state,
                trigger=trigger,
                reason=f"Cannot enter PRE from {self._state.value}",
                timestamp=now,
            )
        
        self._state = AlarmState.PRE
        self._disposition = EventDisposition.IN_PROGRESS
        
        result = TransitionResult(
            success=True,
            from_state=from_state,
            to_state=self._state,
            trigger=trigger,
            reason=reason,
            timestamp=now,
        )
        self._record_transition(result)
        return result
    
    def _enter_pending(
        self,
        trigger: TransitionTrigger,
        reason: str,
        entry_delay_sec: int,
        now: datetime,
    ) -> TransitionResult:
        """Transition to PENDING state with entry delay."""
        from_state = self._state
        
        # Can enter PENDING from QUIET or PRE
        if self._state not in (AlarmState.QUIET, AlarmState.PRE):
            return TransitionResult(
                success=False,
                from_state=from_state,
                to_state=self._state,
                trigger=trigger,
                reason=f"Cannot enter PENDING from {self._state.value}",
                timestamp=now,
            )
        
        self._state = AlarmState.PENDING
        self._disposition = EventDisposition.IN_PROGRESS
        self._pending_entered_at = now
        self._entry_delay_sec = entry_delay_sec
        
        # Notify listener to start timer
        if self.on_pending_started and entry_delay_sec > 0:
            self.on_pending_started(entry_delay_sec)
        
        result = TransitionResult(
            success=True,
            from_state=from_state,
            to_state=self._state,
            trigger=trigger,
            reason=reason,
            timestamp=now,
            entry_delay_sec=entry_delay_sec,
        )
        self._record_transition(result)
        return result
    
    def _enter_triggered(
        self,
        trigger: TransitionTrigger,
        reason: str,
        now: datetime,
    ) -> TransitionResult:
        """Transition to TRIGGERED state."""
        from_state = self._state
        
        # Can enter TRIGGERED from QUIET, PRE, or PENDING
        if self._state not in (AlarmState.QUIET, AlarmState.PRE, AlarmState.PENDING):
            return TransitionResult(
                success=False,
                from_state=from_state,
                to_state=self._state,
                trigger=trigger,
                reason=f"Cannot enter TRIGGERED from {self._state.value}",
                timestamp=now,
            )
        
        self._state = AlarmState.TRIGGERED
        self._disposition = EventDisposition.IN_PROGRESS
        self._triggered_at = now
        self._abort_window_end = now + timedelta(seconds=self.config.abort_window_sec)
        
        result = TransitionResult(
            success=True,
            from_state=from_state,
            to_state=self._state,
            trigger=trigger,
            reason=reason,
            timestamp=now,
        )
        self._record_transition(result)
        return result
    
    def _enter_canceled(
        self,
        trigger: TransitionTrigger,
        reason: str,
        now: datetime,
    ) -> TransitionResult:
        """Transition to QUIET state after cancel (record event first)."""
        from_state = self._state
        
        # 记录事件（canceled 状态只是临时记录，最终回到 QUIET）
        self._canceled_at = now
        
        # 立即回到 QUIET 状态
        self._state = AlarmState.QUIET
        
        result = TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.QUIET,  # 回到 QUIET，不是 CANCELED
            trigger=trigger,
            reason=reason + " → returned to QUIET",
            timestamp=now,
        )
        self._record_transition(result)
        
        # 清理当前事件状态，准备下一次
        self._pending_entered_at = None
        self._triggered_at = None
        
        return result
    
    def _enter_resolved(
        self,
        trigger: TransitionTrigger,
        reason: str,
        now: datetime,
    ) -> TransitionResult:
        """Transition to QUIET state after resolve (record event first)."""
        from_state = self._state
        
        # 记录事件
        self._resolved_at = now
        
        # 立即回到 QUIET 状态
        self._state = AlarmState.QUIET
        
        result = TransitionResult(
            success=True,
            from_state=from_state,
            to_state=AlarmState.QUIET,  # 回到 QUIET，不是 RESOLVED
            trigger=trigger,
            reason=reason + " → returned to QUIET",
            timestamp=now,
        )
        self._record_transition(result)
        
        # 清理当前事件状态，准备下一次
        self._pending_entered_at = None
        self._triggered_at = None
        
        return result
    
    def _record_transition(self, result: TransitionResult) -> None:
        """Record transition and notify callback."""
        self._transitions.append(result)
        if self.on_state_change:
            self.on_state_change(result)
    
    def get_transition_history(self) -> list[TransitionResult]:
        """Get list of all transitions."""
        return list(self._transitions)
    
    def reset(self) -> None:
        """Reset state machine to initial state."""
        self._state = AlarmState.QUIET
        self._workflow_class = None
        self._disposition = EventDisposition.PENDING
        self._pending_entered_at = None
        self._triggered_at = None
        self._canceled_at = None
        self._resolved_at = None
        self._entry_delay_sec = 0
        self._abort_window_end = None
        self._siren_timeout_end = None
        self._avs_peak = 0
        self._avs_final = 0
        self._transitions = []
