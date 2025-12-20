"""
Service Access Window Auditor - PRD §1.3.1

Manages audit trail for service provider access sessions.
Provides:
- Session lifecycle management (start, update, end)
- Signal tracking during sessions
- Break-in override recording
- Query and reporting capabilities
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict

from ..domain.access_audit import (
    AccessAuditLog,
    AccessAuditQuery,
    AccessSessionStatus
)
from ..domain.enums import AccessDecision, SignalType


class AccessAuditor:
    """Manages audit logs for Service Access Window sessions.
    
    Responsibilities:
    1. Track active access sessions
    2. Record all signals during sessions
    3. Detect and record break-in overrides
    4. Provide query interface for audit reports
    5. Maintain historical audit trail
    
    Thread-safety: This is a simple in-memory implementation.
    For production, consider using a proper database with transaction support.
    """
    
    def __init__(self, session_timeout_sec: int = 3600):
        """Initialize the auditor.
        
        Args:
            session_timeout_sec: How long before an active session times out (default: 1 hour)
        """
        self.session_timeout_sec = session_timeout_sec
        
        # Active sessions (session_id -> AccessAuditLog)
        self.active_sessions: Dict[str, AccessAuditLog] = {}
        
        # Historical sessions (stored in-memory, could be persisted to DB)
        self.historical_sessions: List[AccessAuditLog] = []
        
        # Index by entry point for quick lookup
        self.sessions_by_entry_point: Dict[str, List[str]] = defaultdict(list)
    
    def start_session(
        self,
        user_id: Optional[str],
        service_provider_id: Optional[str],
        service_provider_name: Optional[str],
        access_decision: AccessDecision,
        entry_point_id: str,
        zone_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> AccessAuditLog:
        """Start a new audit session.
        
        Args:
            user_id: User who granted/denied access
            service_provider_id: Service provider identifier
            service_provider_name: Human-readable provider name
            access_decision: AUTHORIZED, UNAUTHORIZED, or NOT_IN_WINDOW
            entry_point_id: Entry point where access was attempted
            zone_id: Zone ID if applicable
            notes: Optional notes about the session
        
        Returns:
            The created AccessAuditLog
        """
        session_id = f"audit_{uuid.uuid4().hex[:12]}"
        
        log = AccessAuditLog(
            session_id=session_id,
            user_id=user_id,
            service_provider_id=service_provider_id,
            service_provider_name=service_provider_name,
            access_decision=access_decision,
            status=AccessSessionStatus.ACTIVE,
            entry_point_id=entry_point_id,
            zone_id=zone_id,
            notes=notes,
        )
        
        # Store in active sessions
        self.active_sessions[session_id] = log
        
        # Index by entry point
        self.sessions_by_entry_point[entry_point_id].append(session_id)
        
        return log
    
    def record_signal(
        self,
        session_id: str,
        signal_type: SignalType
    ) -> Optional[AccessAuditLog]:
        """Record a signal that occurred during a session.
        
        Args:
            session_id: ID of the session
            signal_type: Type of signal
        
        Returns:
            Updated AccessAuditLog, or None if session not found
        """
        log = self.active_sessions.get(session_id)
        if not log:
            return None
        
        log.add_signal(signal_type)
        return log
    
    def record_break_in(
        self,
        session_id: str,
        signal_type: SignalType,
        reason: str,
        timestamp: Optional[datetime] = None
    ) -> Optional[AccessAuditLog]:
        """Record a break-in override during an authorized session.
        
        This occurs when a SECURITY_HEAVY signal (e.g., FORCED_ENTRY, GLASS_BREAK)
        happens during an AUTHORIZED access window, overriding the authorization.
        
        Args:
            session_id: ID of the session
            signal_type: The break-in signal type
            reason: Explanation of the override
            timestamp: When it occurred (defaults to now)
        
        Returns:
            Updated AccessAuditLog, or None if session not found
        """
        log = self.active_sessions.get(session_id)
        if not log:
            return None
        
        log.record_break_in(
            signal_type=signal_type,
            timestamp=timestamp or datetime.now(),
            reason=reason
        )
        
        # Break-in overrides typically end the session immediately
        self.end_session(session_id)
        
        return log
    
    def end_session(
        self,
        session_id: str,
        end_time: Optional[datetime] = None
    ) -> Optional[AccessAuditLog]:
        """End an active session.
        
        Args:
            session_id: ID of the session
            end_time: When it ended (defaults to now)
        
        Returns:
            Completed AccessAuditLog, or None if session not found
        """
        log = self.active_sessions.get(session_id)
        if not log:
            return None
        
        log.end_session(end_time)
        
        # Move to historical storage
        self.historical_sessions.append(log)
        del self.active_sessions[session_id]
        
        return log
    
    def get_session(self, session_id: str) -> Optional[AccessAuditLog]:
        """Get a session by ID (active or historical).
        
        Args:
            session_id: Session ID
        
        Returns:
            AccessAuditLog if found, None otherwise
        """
        # Check active sessions first
        if session_id in self.active_sessions:
            return self.active_sessions[session_id]
        
        # Search historical sessions
        for log in self.historical_sessions:
            if log.session_id == session_id:
                return log
        
        return None
    
    def get_active_session_for_entry_point(
        self,
        entry_point_id: str
    ) -> Optional[AccessAuditLog]:
        """Get the active session for an entry point, if any.
        
        Args:
            entry_point_id: Entry point ID
        
        Returns:
            Active AccessAuditLog for this entry point, or None
        """
        session_ids = self.sessions_by_entry_point.get(entry_point_id, [])
        
        for session_id in reversed(session_ids):  # Most recent first
            if session_id in self.active_sessions:
                return self.active_sessions[session_id]
        
        return None
    
    def query_sessions(
        self,
        query: Optional[AccessAuditQuery] = None,
        **kwargs
    ) -> List[AccessAuditLog]:
        """Query audit logs with flexible filters.
        
        Args:
            query: AccessAuditQuery object, or
            **kwargs: Individual query parameters (start_date, end_date, etc.)
        
        Returns:
            List of matching AccessAuditLog entries
        """
        if query is None:
            query = AccessAuditQuery(**kwargs)
        
        # Combine active and historical sessions
        all_sessions = list(self.active_sessions.values()) + self.historical_sessions
        
        # Apply filters
        results = all_sessions
        
        if query.start_date:
            results = [s for s in results if s.start_time >= query.start_date]
        
        if query.end_date:
            results = [s for s in results if s.start_time <= query.end_date]
        
        if query.provider_id:
            results = [s for s in results if s.service_provider_id == query.provider_id]
        
        if query.user_id:
            results = [s for s in results if s.user_id == query.user_id]
        
        if query.decision:
            results = [s for s in results if s.access_decision == query.decision]
        
        if query.status:
            results = [s for s in results if s.status == query.status]
        
        if query.entry_point_id:
            results = [s for s in results if s.entry_point_id == query.entry_point_id]
        
        # Sort by start_time descending (most recent first)
        results.sort(key=lambda s: s.start_time, reverse=True)
        
        # Apply pagination
        start_idx = query.offset
        end_idx = start_idx + query.limit
        
        return results[start_idx:end_idx]
    
    def cleanup_timed_out_sessions(self) -> List[AccessAuditLog]:
        """Find and close sessions that have exceeded the timeout.
        
        Returns:
            List of sessions that were timed out
        """
        now = datetime.now()
        timeout_threshold = now - timedelta(seconds=self.session_timeout_sec)
        
        timed_out = []
        
        for session_id, log in list(self.active_sessions.items()):
            if log.start_time < timeout_threshold:
                log.status = AccessSessionStatus.TIMEOUT
                self.end_session(session_id, end_time=now)
                timed_out.append(log)
        
        return timed_out
    
    def get_statistics(self) -> Dict:
        """Get audit statistics for monitoring.
        
        Returns:
            Dictionary with statistics
        """
        all_sessions = list(self.active_sessions.values()) + self.historical_sessions
        
        stats = {
            "total_sessions": len(all_sessions),
            "active_sessions": len(self.active_sessions),
            "completed_sessions": len([s for s in all_sessions if s.status == AccessSessionStatus.COMPLETED]),
            "break_in_overrides": len([s for s in all_sessions if s.status == AccessSessionStatus.BREAK_IN_OVERRIDE]),
            "by_decision": {
                "authorized": len([s for s in all_sessions if s.access_decision == AccessDecision.AUTHORIZED]),
                "unauthorized": len([s for s in all_sessions if s.access_decision == AccessDecision.UNAUTHORIZED]),
                "not_in_window": len([s for s in all_sessions if s.access_decision == AccessDecision.NOT_IN_WINDOW]),
            },
            "total_signals_recorded": sum(s.signal_count for s in all_sessions),
        }
        
        return stats
