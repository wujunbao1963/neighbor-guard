"""
NG Edge Core Enums - PRD v7.4.2 §1.1, §2.6, §3.1

This module defines all core enumerations used throughout the system.
These are frozen as part of the Edge Output ABI.
"""

from enum import Enum, IntEnum


# =============================================================================
# §1.1 House Mode & Sub-modes
# =============================================================================

class HouseMode(str, Enum):
    """Primary house security mode."""
    DISARMED = "disarmed"
    HOME = "home"
    AWAY = "away"
    NIGHT = "night"


class NightSubMode(str, Enum):
    """Night mode sub-variants (PRD §1.2)."""
    NIGHT_PERIMETER = "night_perimeter"   # Perimeter-only, delay=0
    NIGHT_OCCUPIED = "night_occupied"     # Short delay, bypass interior


class HomePolicy(str, Enum):
    """Home mode escalation policy (PRD §1.3)."""
    RECORD_ONLY = "record_only"           # max_alarm_state=QUIET
    PREALERT_ONLY = "prealert_only"       # max_alarm_state=PRE
    ESCALATE_SUSTAINED = "escalate_sustained"  # Can reach TRIGGERED


# =============================================================================
# §1.1.1 EventType (Output ABI - Frozen)
# =============================================================================

class EventType(str, Enum):
    """Event type for Edge→Cloud output (PRD §1.1.1).
    
    Must be consistent with workflowClass. Upgrades allowed via revision.
    """
    # SECURITY_HEAVY
    INTRUSION_ATTEMPTED = "intrusion_attempted"
    INTRUSION_CONFIRMED = "intrusion_confirmed"
    PERIMETER_BREACH = "perimeter_breach"
    FORCED_ENTRY = "forced_entry"
    GLASS_BREAK = "glass_break"
    
    # SUSPICION_LIGHT / Audit Sessions
    PRE_ALERT = "pre_alert"
    AUTHORIZED_ACCESS_SESSION = "authorized_access_session"
    ACTIVITY_DETECTED = "activity_detected"  # HOME mode normal activity
    
    # LOGISTICS
    PACKAGE_DELIVERED = "package_delivered"
    PACKAGE_REMOVED = "package_removed"
    
    # LIFE_SAFETY
    SMOKE_ALARM = "smoke_alarm"
    CO_ALARM = "co_alarm"


# =============================================================================
# §0.2 Workflow Classification
# =============================================================================

class WorkflowClass(str, Enum):
    """Workflow classification (PRD §0.2).
    
    Determines AlarmSM entry and output behavior.
    """
    SECURITY_HEAVY = "security_heavy"     # Entry to AlarmSM PENDING/TRIGGERED
    LIFE_SAFETY = "life_safety"           # 24H, highest priority
    SUSPICION_LIGHT = "suspicion_light"   # PRE only, no PENDING/TRIGGERED
    LOGISTICS = "logistics"               # Task workflow, no AlarmSM


# =============================================================================
# §3.1 AlarmState (State Machine States)
# =============================================================================

class AlarmState(str, Enum):
    """Alarm state machine states (PRD §3.1).
    
    State transitions are strictly controlled by AlarmSM.
    """
    QUIET = "quiet"           # No alarm condition
    PRE = "pre"               # Pre-alert, light notification
    PENDING = "pending"       # Entry delay countdown
    TRIGGERED = "triggered"   # Full alarm, outputs active
    CANCELED = "canceled"     # Disarmed/aborted
    RESOLVED = "resolved"     # Completed (timeout/user)


# =============================================================================
# §2.6 User Alert & Dispatch Readiness Levels
# =============================================================================

class UserAlertLevel(IntEnum):
    """User alert/wake level (PRD §1.4.1).
    
    0-3 scale for notification intensity.
    """
    NONE = 0      # No alert, record only
    SOFT = 1      # Light reminder (silent push)
    STRONG = 2    # Strong wake (chime, night wake)
    ALARM = 3     # Alarm level (critical push, siren)


class DispatchReadinessLevel(IntEnum):
    """Dispatch readiness level (PRD §1.4.2).
    
    0-3 scale for external response preparation.
    """
    NONE = 0              # No dispatch recommendation
    CONTINUE_VERIFY = 1   # Continue verification
    VERIFIED = 2          # Minimum evidence met
    HIGH_RISK = 3         # High risk / life safety


class DispatchRecommendation(str, Enum):
    """Dispatch recommendation (PRD §1.4.2)."""
    NONE = "none"
    CONTINUE_VERIFY = "continue_verify"
    RECOMMEND_CALL_FOR_SERVICE = "recommend_call_for_service"


# =============================================================================
# §2.3 Zone Types
# =============================================================================

class ZoneType(str, Enum):
    """Zone classification (PRD §2.3)."""
    ENTRY_EXIT = "entry_exit"           # Main entry points
    PERIMETER = "perimeter"             # Windows, secondary doors
    INTERIOR = "interior"               # Interior motion sensors
    EXTERIOR = "exterior"               # Outdoor areas
    FIRE_24H = "fire_24h"               # Smoke detectors (always armed)
    CO_24H = "co_24h"                   # CO detectors (always armed)
    
    # Legacy aliases for backward compatibility
    INTERIOR_FOLLOWER = "interior"      # Deprecated: use INTERIOR
    INTERIOR_INSTANT = "interior"       # Deprecated: use INTERIOR


class LocationType(str, Enum):
    """Physical location classification."""
    INDOOR = "indoor"
    OUTDOOR = "outdoor"
    THRESHOLD = "threshold"  # Doorway/entry point


# =============================================================================
# §2.4 Signal Types
# =============================================================================

class SignalType(str, Enum):
    """Signal types from sensors (PRD §2.4)."""
    # Contact sensors
    DOOR_OPEN = "door_open"
    DOOR_CLOSE = "door_close"
    WINDOW_OPEN = "window_open"
    WINDOW_CLOSE = "window_close"
    
    # Break-in signals
    GLASS_BREAK = "glass_break"
    FORCED_ENTRY = "forced_entry"
    
    # Motion/presence
    MOTION_ACTIVE = "motion_active"
    MOTION_CLEAR = "motion_clear"
    PERSON_DETECTED = "person_detected"
    VEHICLE_DETECTED = "vehicle_detected"
    LOITER = "loiter"
    APPROACH_ENTRY = "approach_entry"
    
    # Life safety
    SMOKE_DETECTED = "smoke_detected"
    CO_DETECTED = "co_detected"
    FIRE_ALARM = "fire_alarm"
    
    # Logistics
    PACKAGE_DELIVERED = "package_delivered"
    PACKAGE_REMOVED = "package_removed"
    COURIER_ARRIVED = "courier_arrived"
    
    # System
    DISARM = "disarm"
    ARM = "arm"
    PANIC = "panic"


# =============================================================================
# §2.7 Capability Tiers
# =============================================================================

class CapabilityTier(str, Enum):
    """Camera/video capability tier (PRD §2.7)."""
    V = "V"   # Video-Verified
    E = "E"   # Event-Only (no video)
    N = "N"   # No-Camera


# =============================================================================
# §2.5 Event Disposition
# =============================================================================

class EventDisposition(str, Enum):
    """Final event disposition (PRD §2.5)."""
    # Pending states
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    
    # Positive outcomes
    VERIFIED_TRUE = "verified_true"
    
    # Negative outcomes
    VERIFIED_FALSE = "verified_false"
    CANCELED_BEFORE_TRIGGER = "canceled_before_trigger"
    CANCELED_AFTER_TRIGGER = "canceled_after_trigger"
    
    # Timeout/completion
    RESOLVED_BY_USER = "resolved_by_user"
    RESOLVED_TIMEOUT = "resolved_timeout"
    
    # Special
    AUTHORIZED_SESSION = "authorized_session"


# =============================================================================
# §11.4.5 Actor Roles (for EventUpdate permissions)
# =============================================================================

class ActorRole(str, Enum):
    """Actor roles for EventUpdate permissions (PRD §11.4.5)."""
    EDGE_DEVICE = "edge_device"
    PRIMARY_USER = "primary_user"
    KEYHOLDER = "keyholder"
    NEIGHBOR = "neighbor"
    CLOUD_SYSTEM = "cloud_system"


# =============================================================================
# Verification Results (PRD §6)
# =============================================================================

class VerificationResult(str, Enum):
    """Verification attempt results (PRD §6)."""
    # Process states
    NO_ANSWER = "NO_ANSWER"
    PENDING = "PENDING"
    EXHAUSTED = "EXHAUSTED"
    
    # Human confirmations
    CONFIRMED_TRUE = "CONFIRMED_TRUE"
    CONFIRMED_FALSE = "CONFIRMED_FALSE"
    
    # On-scene observations (neighbor allowed)
    ON_SCENE_NO_SIGNS = "ON_SCENE_NO_SIGNS"
    ON_SCENE_SIGNS_PRESENT = "ON_SCENE_SIGNS_PRESENT"
    ON_SCENE_UNSAFE = "ON_SCENE_UNSAFE"


# =============================================================================
# Access Decision (PRD §1.3.1)
# =============================================================================

class AccessDecision(str, Enum):
    """Service Access Window decision (PRD §1.3.1)."""
    AUTHORIZED = "AUTHORIZED"
    UNAUTHORIZED = "UNAUTHORIZED"
    NOT_IN_WINDOW = "NOT_IN_WINDOW"
