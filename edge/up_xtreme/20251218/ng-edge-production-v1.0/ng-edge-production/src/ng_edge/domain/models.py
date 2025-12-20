"""
NG Edge Core Models - PRD v7.4.2 §2

Data models for Evidence, Zone, Signal, and related structures.
Uses Pydantic for validation and serialization.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from .enums import (
    ZoneType,
    LocationType,
    SignalType,
    WorkflowClass,
    EventType,
    AlarmState,
    EventDisposition,
    HouseMode,
    NightSubMode,
    UserAlertLevel,
    DispatchReadinessLevel,
    DispatchRecommendation,
    CapabilityTier,
    AccessDecision,
)


# =============================================================================
# §2.1 Evidence Model
# =============================================================================

class Evidence(BaseModel):
    """Single evidence record (PRD §2.1).
    
    Note: System signals (disarm/network/verification) don't enter EvidenceLedger,
    they are recorded in AuditLog or VerificationAttemptLog.
    """
    evidence_id: str
    timestamp: datetime
    signal_id: str
    sensor_id: str
    sensor_type: str
    signal_type: SignalType
    
    # Location info (required for physical sensors)
    zone_id: str
    zone_type: ZoneType
    location_type: LocationType
    entry_point_id: Optional[str] = None
    
    # Confidence scores
    signal_confidence: float = Field(ge=0.0, le=1.0)
    sensor_reliability: float = Field(ge=0.0, le=1.0, default=1.0)
    base_weight: float = Field(ge=0.0, default=1.0)
    
    # Context
    is_corroborated: bool = False
    corroborating_evidence_ids: list[str] = Field(default_factory=list)
    
    # Metadata
    raw_payload: Optional[dict] = None
    
    @field_validator('signal_confidence', 'sensor_reliability')
    @classmethod
    def validate_probability(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError('Probability must be between 0.0 and 1.0')
        return v


# =============================================================================
# §2.2 Zone & Topology Models
# =============================================================================

class Zone(BaseModel):
    """Zone definition (PRD §2.2)."""
    zone_id: str
    name: str
    zone_type: ZoneType
    location_type: LocationType
    
    # Topology
    entry_point_ids: list[str] = Field(default_factory=list)
    adjacent_zone_ids: list[str] = Field(default_factory=list)
    
    # Configuration
    is_bypass_home: bool = False  # Bypassed in HOME mode
    is_bypass_night_occupied: bool = False  # Bypassed in NIGHT_OCCUPIED
    
    # Capability
    capability_tier: CapabilityTier = CapabilityTier.N


class EntryPoint(BaseModel):
    """Entry point definition (PRD §2.2)."""
    entry_point_id: str
    name: str
    zone_id: str
    
    # Configuration
    entry_delay_away_sec: int = Field(default=30, ge=0, le=300)
    entry_delay_night_sec: int = Field(default=15, ge=0, le=300)
    entry_delay_home_sec: int = Field(default=30, ge=0, le=300)
    
    # Sensors bound to this entry point
    sensor_ids: list[str] = Field(default_factory=list)
    
    # For Service Access Window
    is_primary_entry: bool = False


class Topology(BaseModel):
    """System topology (PRD §2.2)."""
    zones: dict[str, Zone] = Field(default_factory=dict)
    entry_points: dict[str, EntryPoint] = Field(default_factory=dict)
    
    def get_zone(self, zone_id: str) -> Optional[Zone]:
        return self.zones.get(zone_id)
    
    def get_entry_point(self, ep_id: str) -> Optional[EntryPoint]:
        return self.entry_points.get(ep_id)
    
    def get_entry_delay(
        self,
        entry_point_id: str,
        mode: HouseMode,
        night_sub_mode: Optional[NightSubMode] = None
    ) -> int:
        """Get entry delay for an entry point based on mode."""
        ep = self.entry_points.get(entry_point_id)
        if not ep:
            return 30  # Default
        
        if mode == HouseMode.AWAY:
            return ep.entry_delay_away_sec
        elif mode == HouseMode.NIGHT:
            if night_sub_mode == NightSubMode.NIGHT_PERIMETER:
                return 0  # Immediate for perimeter mode
            return ep.entry_delay_night_sec
        elif mode == HouseMode.HOME:
            return ep.entry_delay_home_sec
        else:
            return 0  # DISARMED


# =============================================================================
# §2.3 Signal Model
# =============================================================================

class Signal(BaseModel):
    """Raw signal from sensor (PRD §2.3)."""
    signal_id: str
    timestamp: datetime
    sensor_id: str
    sensor_type: str
    signal_type: SignalType
    
    # Location binding
    zone_id: str
    entry_point_id: Optional[str] = None
    
    # Confidence
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    
    # Raw data
    raw_payload: Optional[dict] = None
    
    # Processing state
    is_processed: bool = False
    is_filtered: bool = False  # True if filtered by debounce/nuisance


# =============================================================================
# §2.5 Event Model
# =============================================================================

class SecurityEvent(BaseModel):
    """Security event (PRD §2.5).
    
    Core event structure for Edge→Cloud output.
    """
    # Identity
    event_id: str
    created_at: datetime
    updated_at: datetime
    
    # Classification
    event_type: EventType
    workflow_class: WorkflowClass
    
    # State
    alarm_state: AlarmState = AlarmState.QUIET
    event_disposition: EventDisposition = EventDisposition.PENDING
    
    # Mode context
    house_mode: HouseMode
    night_sub_mode: Optional[NightSubMode] = None
    
    # Location
    primary_zone_id: str
    entry_point_id: Optional[str] = None
    
    # Evidence references
    evidence_ids: list[str] = Field(default_factory=list)
    trigger_signal_id: Optional[str] = None
    
    # User alert (PRD §1.4.1)
    user_alert_level: UserAlertLevel = UserAlertLevel.NONE
    user_alert_level_peak: UserAlertLevel = UserAlertLevel.NONE
    
    # Dispatch readiness (PRD §1.4.2)
    dispatch_readiness_local: DispatchReadinessLevel = DispatchReadinessLevel.NONE
    dispatch_recommendation_local: DispatchRecommendation = DispatchRecommendation.NONE
    
    # Timers (PRD §3.1.1)
    entry_delay_sec: int = 0
    pending_started_at: Optional[datetime] = None
    triggered_at: Optional[datetime] = None
    
    # AVS (PRD §5)
    avs_level: int = Field(default=0, ge=0, le=4)
    avs_level_peak: int = Field(default=0, ge=0, le=4)
    
    # Service Access Window (PRD §1.3.1)
    access_decision: Optional[AccessDecision] = None
    service_window_id: Optional[str] = None
    
    # Revision tracking
    revision: int = 1
    
    def update_peak_levels(self) -> None:
        """Update peak levels (call after level changes)."""
        if self.user_alert_level > self.user_alert_level_peak:
            self.user_alert_level_peak = self.user_alert_level
        if self.avs_level > self.avs_level_peak:
            self.avs_level_peak = self.avs_level


# =============================================================================
# §1.3.1 Service Access Window
# =============================================================================

class ServiceAccessWindow(BaseModel):
    """Service access window configuration (PRD §1.3.1)."""
    service_window_id: str
    name: str
    
    # Time bounds
    timezone: str = "UTC"
    start_at_local: str  # "HH:MM"
    end_at_local: str    # "HH:MM"
    days_of_week: list[str] = Field(default_factory=list)  # ["MON","TUE",...]
    
    # Allowed areas
    allowed_entry_point_ids: list[str] = Field(default_factory=list)
    allowed_zone_ids: list[str] = Field(default_factory=list)
    restricted_zone_ids: list[str] = Field(default_factory=list)
    
    # Actions
    suppress_alarm_outputs: bool = True
    suppress_neighbor_notifications: bool = True
    still_record_evidence: bool = True
    override_follower_acceleration: bool = False
    
    # Session config
    idle_timeout_sec: int = 900
    
    # State
    is_active: bool = False
    policy_version: int = 1


# =============================================================================
# Mode Configuration
# =============================================================================

class ModeConfig(BaseModel):
    """Current mode configuration snapshot."""
    house_mode: HouseMode
    night_sub_mode: Optional[NightSubMode] = None
    
    # HOME policy
    home_policy: Optional[str] = None  # HomePolicy enum value
    
    # Active service windows
    active_service_window_ids: list[str] = Field(default_factory=list)
    
    # Bypassed zones
    bypassed_zone_ids: list[str] = Field(default_factory=list)
    
    def is_armed(self) -> bool:
        """Check if system is armed (not DISARMED)."""
        return self.house_mode != HouseMode.DISARMED
    
    def is_night_perimeter(self) -> bool:
        """Check if in night perimeter mode (immediate trigger)."""
        return (
            self.house_mode == HouseMode.NIGHT and
            self.night_sub_mode == NightSubMode.NIGHT_PERIMETER
        )
