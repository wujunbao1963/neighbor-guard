"""
Service Access Window Audit API Endpoints

Provides REST API for querying and managing access audit logs.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from ..domain import (
    AccessDecision,
    AccessSessionStatus,
)
from ..domain.access_audit import AccessAuditLog, AccessAuditQuery
from ..services.access_auditor import AccessAuditor


# Create router
audit_router = APIRouter(prefix="/audit", tags=["audit"])

# Global auditor instance (in production, this should be dependency-injected)
_global_auditor = AccessAuditor()


def get_auditor() -> AccessAuditor:
    """Get the global auditor instance.
    
    In production, this should be replaced with proper dependency injection.
    """
    return _global_auditor


@audit_router.get("/access-sessions", response_model=List[dict])
async def get_access_sessions(
    start_date: Optional[datetime] = Query(None, description="Filter by start date (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date (ISO format)"),
    provider_id: Optional[str] = Query(None, description="Filter by service provider ID"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    decision: Optional[AccessDecision] = Query(None, description="Filter by access decision"),
    status: Optional[AccessSessionStatus] = Query(None, description="Filter by session status"),
    entry_point_id: Optional[str] = Query(None, description="Filter by entry point"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """Query access audit sessions with filters.
    
    Returns a list of audit log entries matching the specified criteria.
    Results are sorted by start_time descending (most recent first).
    
    Example:
        GET /audit/access-sessions?provider_id=cleaner_1&limit=10
        GET /audit/access-sessions?start_date=2025-12-01T00:00:00Z&decision=AUTHORIZED
    """
    auditor = get_auditor()
    
    query = AccessAuditQuery(
        start_date=start_date,
        end_date=end_date,
        provider_id=provider_id,
        user_id=user_id,
        decision=decision,
        status=status,
        entry_point_id=entry_point_id,
        limit=limit,
        offset=offset,
    )
    
    sessions = auditor.query_sessions(query)
    
    return [session.to_dict() for session in sessions]


@audit_router.get("/access-sessions/{session_id}", response_model=dict)
async def get_access_session(session_id: str):
    """Get details of a specific access session.
    
    Args:
        session_id: The session ID
    
    Returns:
        Complete audit log entry for the session
    
    Raises:
        404: If session not found
    """
    auditor = get_auditor()
    
    session = auditor.get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    return session.to_dict()


@audit_router.get("/access-sessions/active/entry-point/{entry_point_id}", response_model=dict)
async def get_active_session_for_entry_point(entry_point_id: str):
    """Get the active access session for an entry point, if any.
    
    Args:
        entry_point_id: The entry point ID
    
    Returns:
        Active session for this entry point, or null if none
    """
    auditor = get_auditor()
    
    session = auditor.get_active_session_for_entry_point(entry_point_id)
    
    if not session:
        return {"active_session": None}
    
    return session.to_dict()


@audit_router.get("/statistics", response_model=dict)
async def get_audit_statistics():
    """Get overall audit statistics.
    
    Returns statistics about:
    - Total sessions
    - Active vs completed
    - Break-in overrides
    - Sessions by decision type
    - Total signals recorded
    """
    auditor = get_auditor()
    
    return auditor.get_statistics()


@audit_router.post("/cleanup-timed-out")
async def cleanup_timed_out_sessions():
    """Manually trigger cleanup of timed-out sessions.
    
    Finds and closes any sessions that have exceeded the timeout period.
    In production, this would typically run as a scheduled task.
    
    Returns:
        List of sessions that were timed out
    """
    auditor = get_auditor()
    
    timed_out = auditor.cleanup_timed_out_sessions()
    
    return {
        "timed_out_count": len(timed_out),
        "sessions": [s.to_dict() for s in timed_out]
    }
