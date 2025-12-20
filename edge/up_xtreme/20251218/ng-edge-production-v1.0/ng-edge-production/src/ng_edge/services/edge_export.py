"""
NG Edge Export Format - PRD v7.4.2 §11.3

Defines the edge-export-v1 output bundle format for:
- Event Ingest (POST /events/ingest)
- Event Update (POST /events/{eventId}/updates)

Key conventions (PRD §11.4.5):
- edge-export-v1 uses snake_case field names
- EventUpdate uses camelCase field names
- Enum values: updateType uses lower_snake_case, actions use UPPER_SNAKE_CASE
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Any
from enum import Enum
import json
import uuid

from ..domain.enums import (
    AlarmState,
    EventType,
    WorkflowClass,
    EventDisposition,
    HouseMode,
    NightSubMode,
    UserAlertLevel,
    DispatchReadinessLevel,
    DispatchRecommendation,
    AccessDecision,
    ActorRole,
    VerificationResult,
)
from ..domain.models import SecurityEvent, Evidence


# =============================================================================
# Constants
# =============================================================================

EDGE_SCHEMA_VERSION = "7.4.2"


# =============================================================================
# UpdateType Enum (lower_snake_case per PRD)
# =============================================================================

class UpdateType(str, Enum):
    """EventUpdate types (PRD §11.4.2)."""
    ALARM_STATE = "alarm_state"
    VERIFICATION = "verification"
    DISPATCH = "dispatch"
    EVIDENCE_APPEND = "evidence_append"
    ACCESS_POLICY = "access_policy"
    NOTE = "note"
    AUTHORIZED_ACTION = "authorized_action"
    AUTHORIZED_ACTION_RESULT = "authorized_action_result"


class NoteType(str, Enum):
    """Note types (PRD §11.4.9)."""
    SYSTEM_NOTE = "system_note"
    HUMAN_NOTE = "human_note"


class ActionResultStatus(str, Enum):
    """Authorized action result status (PRD §11.4.7)."""
    RECEIVED = "received"
    EXECUTED = "executed"
    FAILED = "failed"
    TIMEOUT = "timeout"


# =============================================================================
# Audit Structure (PRD §11.6.1)
# =============================================================================

@dataclass
class AuditInfo:
    """Audit information for EventUpdate (PRD §11.6.1)."""
    actor_id: str
    actor_role: ActorRole
    auth_method: str = "device_cert"  # pin | biometric | session | device_cert | api_key
    client_ip: Optional[str] = None
    client_device_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert to dict with camelCase keys (for EventUpdate)."""
        result = {
            "actorId": self.actor_id,
            "actorRole": self.actor_role.value,
            "authMethod": self.auth_method,
            "submittedAt": (self.submitted_at or datetime.now(timezone.utc)).isoformat(),
        }
        if self.client_ip:
            result["clientIp"] = self.client_ip
        if self.client_device_id:
            result["clientDeviceId"] = self.client_device_id
        return result


# =============================================================================
# Edge Export Bundle (edge-export-v1, snake_case)
# =============================================================================

@dataclass
class EdgeExportBundle:
    """Edge output bundle (PRD §11.3).
    
    Uses snake_case field names per PRD convention.
    """
    edge_schema_version: str = EDGE_SCHEMA_VERSION
    idempotency_key: str = field(default_factory=lambda: str(uuid.uuid4()))
    circle_id: str = ""
    edge_device_id: str = ""
    
    # Event data
    event_id: str = ""
    event_type: str = ""
    workflow_class: str = ""
    
    # State
    alarm_state: str = ""
    event_disposition: str = ""
    
    # Mode
    house_mode: str = ""
    night_sub_mode: Optional[str] = None
    
    # Location
    primary_zone_id: str = ""
    entry_point_id: Optional[str] = None
    
    # Levels
    user_alert_level: int = 0
    user_alert_level_peak: int = 0
    dispatch_readiness_local: int = 0
    dispatch_recommendation_local: str = "none"
    
    # AVS
    avs_level: int = 0
    avs_level_peak: int = 0
    
    # Timing
    created_at: str = ""
    updated_at: str = ""
    triggered_at: Optional[str] = None
    
    # Entry delay
    entry_delay_sec: int = 0
    entry_delay_remaining_sec: Optional[int] = None
    
    # Evidence
    evidence_ids: list[str] = field(default_factory=list)
    trigger_signal_id: Optional[str] = None
    
    # Access
    access_decision: Optional[str] = None
    service_window_id: Optional[str] = None
    
    # Revision
    revision: int = 1
    
    def to_dict(self) -> dict:
        """Convert to dict with snake_case keys."""
        result = {
            "edge_schema_version": self.edge_schema_version,
            "idempotency_key": self.idempotency_key,
            "circle_id": self.circle_id,
            "edge_device_id": self.edge_device_id,
            "event": {
                "event_id": self.event_id,
                "event_type": self.event_type,
                "workflow_class": self.workflow_class,
                "alarm_state": self.alarm_state,
                "event_disposition": self.event_disposition,
                "house_mode": self.house_mode,
                "primary_zone_id": self.primary_zone_id,
                "user_alert_level": self.user_alert_level,
                "user_alert_level_peak": self.user_alert_level_peak,
                "dispatch_readiness_local": self.dispatch_readiness_local,
                "dispatch_recommendation_local": self.dispatch_recommendation_local,
                "avs_level": self.avs_level,
                "avs_level_peak": self.avs_level_peak,
                "created_at": self.created_at,
                "updated_at": self.updated_at,
                "entry_delay_sec": self.entry_delay_sec,
                "evidence_ids": self.evidence_ids,
                "revision": self.revision,
            }
        }
        
        # Optional fields
        if self.night_sub_mode:
            result["event"]["night_sub_mode"] = self.night_sub_mode
        if self.entry_point_id:
            result["event"]["entry_point_id"] = self.entry_point_id
        if self.triggered_at:
            result["event"]["triggered_at"] = self.triggered_at
        if self.entry_delay_remaining_sec is not None:
            result["event"]["entry_delay_remaining_sec"] = self.entry_delay_remaining_sec
        if self.trigger_signal_id:
            result["event"]["trigger_signal_id"] = self.trigger_signal_id
        if self.access_decision:
            result["event"]["access_decision"] = self.access_decision
        if self.service_window_id:
            result["event"]["service_window_id"] = self.service_window_id
        
        return result
    
    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)
    
    @classmethod
    def from_security_event(
        cls,
        event: SecurityEvent,
        circle_id: str,
        edge_device_id: str,
        entry_delay_remaining_sec: Optional[int] = None,
    ) -> "EdgeExportBundle":
        """Create bundle from SecurityEvent."""
        return cls(
            circle_id=circle_id,
            edge_device_id=edge_device_id,
            event_id=event.event_id,
            event_type=event.event_type.value,
            workflow_class=event.workflow_class.value,
            alarm_state=event.alarm_state.value,
            event_disposition=event.event_disposition.value,
            house_mode=event.house_mode.value,
            night_sub_mode=event.night_sub_mode.value if event.night_sub_mode else None,
            primary_zone_id=event.primary_zone_id,
            entry_point_id=event.entry_point_id,
            user_alert_level=event.user_alert_level,
            user_alert_level_peak=event.user_alert_level_peak,
            dispatch_readiness_local=event.dispatch_readiness_local,
            dispatch_recommendation_local=event.dispatch_recommendation_local.value,
            avs_level=event.avs_level,
            avs_level_peak=event.avs_level_peak,
            created_at=event.created_at.isoformat(),
            updated_at=event.updated_at.isoformat(),
            triggered_at=event.triggered_at.isoformat() if event.triggered_at else None,
            entry_delay_sec=event.entry_delay_sec,
            entry_delay_remaining_sec=entry_delay_remaining_sec,
            evidence_ids=event.evidence_ids,
            trigger_signal_id=event.trigger_signal_id,
            access_decision=event.access_decision.value if event.access_decision else None,
            service_window_id=event.service_window_id,
            revision=event.revision,
        )


# =============================================================================
# EventUpdate Envelope (camelCase per PRD)
# =============================================================================

@dataclass
class EventUpdateEnvelope:
    """EventUpdate envelope (PRD §11.4.2).
    
    Uses camelCase field names per PRD convention.
    """
    event_id: str
    revision: int
    update_type: UpdateType
    payload: dict
    audit: AuditInfo
    source: str = "edge"  # edge | cloud
    edge_schema_version: str = EDGE_SCHEMA_VERSION
    occurred_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert to dict with camelCase keys."""
        return {
            "edgeSchemaVersion": self.edge_schema_version,
            "eventId": self.event_id,
            "revision": self.revision,
            "source": self.source,
            "updateType": self.update_type.value,
            "occurredAt": (self.occurred_at or datetime.now(timezone.utc)).isoformat(),
            "payload": self.payload,
            "audit": self.audit.to_dict(),
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)


# =============================================================================
# Payload Builders (PRD §11.4.3)
# =============================================================================

class PayloadBuilder:
    """Builds EventUpdate payloads per PRD §11.4.3."""
    
    @staticmethod
    def alarm_state(
        from_state: AlarmState,
        to_state: AlarmState,
        reason: str,
        entry_delay_remaining_sec: Optional[int] = None,
        abort_window_remaining_sec: Optional[int] = None,
        siren_remaining_sec: Optional[int] = None,
        triggered_entry_point_id: Optional[str] = None,
    ) -> dict:
        """Build alarm_state payload (PRD §11.4.3.1)."""
        payload = {
            "from": from_state.value.upper(),
            "to": to_state.value.upper(),
            "reason": reason,
        }
        
        timers = {}
        if entry_delay_remaining_sec is not None:
            timers["entryDelayRemainingSec"] = entry_delay_remaining_sec
        if abort_window_remaining_sec is not None:
            timers["abortWindowRemainingSec"] = abort_window_remaining_sec
        if siren_remaining_sec is not None:
            timers["sirenRemainingSec"] = siren_remaining_sec
        
        if timers:
            payload["timers"] = timers
        
        if triggered_entry_point_id:
            payload["triggeredEntryPointId"] = triggered_entry_point_id
        
        return payload
    
    @staticmethod
    def verification(
        result: VerificationResult,
        actor_type: ActorRole,
        actor_id: str,
        notes: Optional[str] = None,
        evidence_refs: Optional[list[str]] = None,
    ) -> dict:
        """Build verification payload (PRD §11.4.3.2)."""
        payload = {
            "result": result.value,
            "actorType": actor_type.value,
            "actorId": actor_id,
        }
        if notes:
            payload["notes"] = notes
        if evidence_refs:
            payload["evidenceRefs"] = evidence_refs
        return payload
    
    @staticmethod
    def dispatch_local(
        readiness_local: DispatchReadinessLevel,
        recommendation_local: DispatchRecommendation,
        local_reason: str,
        dispatch_script_local_15s: Optional[str] = None,
    ) -> dict:
        """Build dispatch payload for Edge (PRD §11.4.3.3, 4a)."""
        payload = {
            "dispatchReadinessLocal": readiness_local.value,
            "dispatchRecommendationLocal": recommendation_local.value,
            "localReason": local_reason,
        }
        if dispatch_script_local_15s:
            payload["dispatchScriptLocal15s"] = dispatch_script_local_15s
        return payload
    
    @staticmethod
    def evidence_append(
        manifest_ref: str,
        items_appended: int,
        sensitivity: str = "low",
    ) -> dict:
        """Build evidence_append payload (PRD §11.4.3.4)."""
        return {
            "manifestRef": manifest_ref,
            "itemsAppended": items_appended,
            "sensitivity": sensitivity,
        }
    
    @staticmethod
    def access_policy(
        access_decision: AccessDecision,
        active_service_window_id: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> dict:
        """Build access_policy payload (PRD §11.4.3.5)."""
        payload = {
            "accessDecision": access_decision.value,
        }
        if active_service_window_id:
            payload["activeServiceWindowId"] = active_service_window_id
        if override_reason:
            payload["overrideReason"] = override_reason
        return payload
    
    @staticmethod
    def note(
        text: str,
        note_type: NoteType,
        tags: Optional[list[str]] = None,
        visibility: str = "circle",
    ) -> dict:
        """Build note payload (PRD §11.4.3.6)."""
        payload = {
            "text": text,
            "noteType": note_type.value,
            "visibility": visibility,
        }
        if tags:
            payload["tags"] = tags
        return payload
    
    @staticmethod
    def authorized_action_result(
        action_id: str,
        action: str,
        status: ActionResultStatus,
        executed_at: Optional[datetime] = None,
        failure_reason: Optional[str] = None,
        resulting_alarm_state: Optional[AlarmState] = None,
    ) -> dict:
        """Build authorized_action_result payload (PRD §11.4.7)."""
        payload = {
            "actionId": action_id,
            "action": action,
            "status": status.value,
        }
        if executed_at:
            payload["executedAt"] = executed_at.isoformat()
        if failure_reason:
            payload["failureReason"] = failure_reason
        if resulting_alarm_state:
            payload["resultingAlarmState"] = resulting_alarm_state.value.upper()
        return payload


# =============================================================================
# Edge Export Builder
# =============================================================================

class EdgeExporter:
    """Builds edge-export-v1 bundles and EventUpdate messages.
    
    Handles proper field naming conventions:
    - edge-export-v1: snake_case
    - EventUpdate: camelCase
    """
    
    def __init__(self, circle_id: str, edge_device_id: str):
        self.circle_id = circle_id
        self.edge_device_id = edge_device_id
        self._audit = AuditInfo(
            actor_id=edge_device_id,
            actor_role=ActorRole.EDGE_DEVICE,
            auth_method="device_cert",
        )
    
    def export_event(
        self,
        event: SecurityEvent,
        entry_delay_remaining_sec: Optional[int] = None,
    ) -> EdgeExportBundle:
        """Create edge-export-v1 bundle from SecurityEvent."""
        return EdgeExportBundle.from_security_event(
            event=event,
            circle_id=self.circle_id,
            edge_device_id=self.edge_device_id,
            entry_delay_remaining_sec=entry_delay_remaining_sec,
        )
    
    def build_alarm_state_update(
        self,
        event_id: str,
        revision: int,
        from_state: AlarmState,
        to_state: AlarmState,
        reason: str,
        entry_delay_remaining_sec: Optional[int] = None,
        triggered_entry_point_id: Optional[str] = None,
    ) -> EventUpdateEnvelope:
        """Build alarm_state EventUpdate."""
        payload = PayloadBuilder.alarm_state(
            from_state=from_state,
            to_state=to_state,
            reason=reason,
            entry_delay_remaining_sec=entry_delay_remaining_sec,
            triggered_entry_point_id=triggered_entry_point_id,
        )
        return EventUpdateEnvelope(
            event_id=event_id,
            revision=revision,
            update_type=UpdateType.ALARM_STATE,
            payload=payload,
            audit=self._audit,
        )
    
    def build_dispatch_update(
        self,
        event_id: str,
        revision: int,
        readiness_local: DispatchReadinessLevel,
        recommendation_local: DispatchRecommendation,
        local_reason: str,
    ) -> EventUpdateEnvelope:
        """Build dispatch EventUpdate (Edge can only write local fields)."""
        payload = PayloadBuilder.dispatch_local(
            readiness_local=readiness_local,
            recommendation_local=recommendation_local,
            local_reason=local_reason,
        )
        return EventUpdateEnvelope(
            event_id=event_id,
            revision=revision,
            update_type=UpdateType.DISPATCH,
            payload=payload,
            audit=self._audit,
        )
    
    def build_action_result_update(
        self,
        event_id: str,
        revision: int,
        action_id: str,
        action: str,
        status: ActionResultStatus,
        resulting_alarm_state: Optional[AlarmState] = None,
        failure_reason: Optional[str] = None,
    ) -> EventUpdateEnvelope:
        """Build authorized_action_result EventUpdate."""
        payload = PayloadBuilder.authorized_action_result(
            action_id=action_id,
            action=action,
            status=status,
            executed_at=datetime.now(timezone.utc) if status == ActionResultStatus.EXECUTED else None,
            failure_reason=failure_reason,
            resulting_alarm_state=resulting_alarm_state,
        )
        return EventUpdateEnvelope(
            event_id=event_id,
            revision=revision,
            update_type=UpdateType.AUTHORIZED_ACTION_RESULT,
            payload=payload,
            audit=self._audit,
        )
    
    def build_note_update(
        self,
        event_id: str,
        revision: int,
        text: str,
        tags: Optional[list[str]] = None,
    ) -> EventUpdateEnvelope:
        """Build note EventUpdate (Edge uses system_note)."""
        payload = PayloadBuilder.note(
            text=text,
            note_type=NoteType.SYSTEM_NOTE,  # Edge must use system_note
            tags=tags,
        )
        return EventUpdateEnvelope(
            event_id=event_id,
            revision=revision,
            update_type=UpdateType.NOTE,
            payload=payload,
            audit=self._audit,
        )
