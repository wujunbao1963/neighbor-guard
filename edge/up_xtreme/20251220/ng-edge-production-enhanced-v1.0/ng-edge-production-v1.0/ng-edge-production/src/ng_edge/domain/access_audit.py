"""
Service Access Window Audit Log Models - PRD §1.3.1

Provides audit trail for service provider access sessions, including:
- Who accessed (user_id, provider_id)
- When (start_time, end_time)
- What happened (signals, break-in overrides)
- Access decision (AUTHORIZED, UNAUTHORIZED, NOT_IN_WINDOW)
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

from .enums import AccessDecision, SignalType


class AccessSessionStatus(str, Enum):
    """Status of an access audit session."""
    ACTIVE = "active"               # Session is currently active
    COMPLETED = "completed"         # Session ended normally
    BREAK_IN_OVERRIDE = "break_in_override"  # Break-in signal during session
    TIMEOUT = "timeout"             # Session timed out without explicit end


@dataclass
class AccessAuditLog:
    """Audit log entry for a service access window session.
    
    Records all details about authorized service provider access, including:
    - Session metadata (ID, times, duration)
    - Access decision and status
    - All signals that occurred during the session
    - Any break-in overrides that occurred
    
    This provides a complete audit trail for security compliance and investigation.
    """
    
    # Session identification
    session_id: str
    
    # Who accessed
    user_id: Optional[str] = None           # User who granted access
    service_provider_id: Optional[str] = None  # Service provider ID (e.g., "cleaners", "hvac")
    service_provider_name: Optional[str] = None  # Human-readable name
    
    # Time information
    start_time: datetime = field(default_factory=lambda: datetime.now())
    end_time: Optional[datetime] = None
    duration_sec: Optional[int] = None
    
    # Access decision
    access_decision: AccessDecision = AccessDecision.NOT_IN_WINDOW
    status: AccessSessionStatus = AccessSessionStatus.ACTIVE
    
    # Location information
    entry_point_id: str = ""
    zone_id: Optional[str] = None
    
    # Signals during session
    signals_during_session: List[SignalType] = field(default_factory=list)
    signal_count: int = 0
    
    # Break-in override details (if applicable)
    break_in_override: Optional[Dict[str, Any]] = None
    # Example: {
    #     "signal_type": "FORCED_ENTRY",
    #     "timestamp": "2025-12-18T10:30:00Z",
    #     "reason": "Break-in signal overrides authorization"
    # }
    
    # Audit metadata
    created_at: datetime = field(default_factory=lambda: datetime.now())
    updated_at: datetime = field(default_factory=lambda: datetime.now())
    
    # Additional context
    notes: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Calculate derived fields after initialization."""
        if self.end_time and self.start_time:
            self.duration_sec = int((self.end_time - self.start_time).total_seconds())
    
    def add_signal(self, signal_type: SignalType) -> None:
        """Record a signal that occurred during this session.
        
        Args:
            signal_type: Type of signal that occurred
        """
        self.signals_during_session.append(signal_type)
        self.signal_count = len(self.signals_during_session)
        self.updated_at = datetime.now()
    
    def record_break_in(
        self,
        signal_type: SignalType,
        timestamp: datetime,
        reason: str
    ) -> None:
        """Record a break-in override during the session.
        
        When a SECURITY_HEAVY signal occurs during an AUTHORIZED session,
        it overrides the authorization and triggers an alarm.
        
        Args:
            signal_type: The break-in signal type
            timestamp: When the break-in occurred
            reason: Explanation of why this overrides authorization
        """
        self.break_in_override = {
            "signal_type": signal_type.value,
            "timestamp": timestamp.isoformat(),
            "reason": reason
        }
        self.status = AccessSessionStatus.BREAK_IN_OVERRIDE
        self.updated_at = datetime.now()
    
    def end_session(self, end_time: Optional[datetime] = None) -> None:
        """Mark the session as completed.
        
        Args:
            end_time: When the session ended (defaults to now)
        """
        if self.status == AccessSessionStatus.ACTIVE:
            self.status = AccessSessionStatus.COMPLETED
        
        self.end_time = end_time or datetime.now()
        self.duration_sec = int((self.end_time - self.start_time).total_seconds())
        self.updated_at = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "service_provider_id": self.service_provider_id,
            "service_provider_name": self.service_provider_name,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_sec": self.duration_sec,
            "access_decision": self.access_decision.value,
            "status": self.status.value,
            "entry_point_id": self.entry_point_id,
            "zone_id": self.zone_id,
            "signals_during_session": [s.value for s in self.signals_during_session],
            "signal_count": self.signal_count,
            "break_in_override": self.break_in_override,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "notes": self.notes,
            "metadata": self.metadata,
        }


@dataclass
class AccessAuditQuery:
    """Query parameters for searching audit logs."""
    
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    provider_id: Optional[str] = None
    user_id: Optional[str] = None
    decision: Optional[AccessDecision] = None
    status: Optional[AccessSessionStatus] = None
    entry_point_id: Optional[str] = None
    
    # Pagination
    limit: int = 100
    offset: int = 0
