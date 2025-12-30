# NeighborGuard Edge Architecture Spec v2.2

> **Scope**: Edge-only design. Collaboration / circle workflows deferred.
> **Status**: Architecture-Frozen for Implementation
> **Changes from v2.1**: 
>   - Merged PRD v7.6.1 Addendum §16 (Context Gate, Camera Role, CANDIDATE, Siren Policy)
>   - Added fixes for 4 identified issues (TTL, Judge Fallback, CANDIDATE trigger, Human-Verify timeout)
>   - Retained Sub-Phase, Rule Registry, Replay Contract, Edge/Cloud Contract from prior v2.1

---

## 0. Design Principles

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | **Signal ≠ Decision** | All detectors emit signals only. Only Incident State Machine may change state or execute actions. |
| P2 | **Single Incident per Lease** | For `(home, zone, entrypoint)`, at most one active incident within time window. |
| P3 | **Soft vs Hard Isolation** | Camera PRE (soft) cannot directly trigger PENDING/TRIGGERED unless explicitly allowed by policy. |
| P4 | **Edge Survivability** | Under resource pressure: sample/drop soft signals, never drop hard triggers. |
| P5 | **Idempotency Everywhere** | All processing must be idempotent on `signal_id`. At-least-once delivery assumed. |
| P6 | **Deterministic Replay** | Given same inputs, system must produce identical outputs. Enables testing and debugging. |
| P7 | **Rule Evolvability** | Transition rules can be updated without code deployment. |
| P8 | **Fail-Open Safety** | Loss of context or sensors falls back to conservative (slower/safer) behavior, never to aggressive escalation. |

---

## 1. Signal Layer

### 1.1 Signal Envelope (Unified)

All signals MUST conform to this envelope:

```
SignalEnvelope {
    # Identity
    signal_id: str              # Globally unique, idempotency key
    source_type: camera | sensor | health | context
    device_id: str
    
    # Spatial
    zone_id: str
    entrypoint_id: str?         # Optional but recommended
    
    # Classification
    signal_kind: str            # person_detected, door_open, glass_break, etc.
    hardness: soft | hard       # Determines processing priority
    level: PRE_L1 | PRE_L2 | PRE_L3 | null  # For soft signals
    confidence: float           # 0.0 - 1.0
    
    # Temporal
    timestamp: datetime         # Device-reported time
    ingest_ts: datetime         # Edge-received time (authoritative for ordering)
    
    # Camera-specific
    camera_role: judge | witness | null  # Only for camera signals
    
    # Payload
    attributes: {
        bbox?, track_id?, direction?, contact_state?, battery?, etc.
    }
    
    evidence_hints: {
        snapshot_key?, clip_pointer?, ring_buffer_offset?
    }
}
```

### 1.2 Hardness Classification (Fixed)

| Signal Kind | Hardness | Notes |
|-------------|----------|-------|
| person_detected | soft | Camera AI |
| vehicle_detected | soft | Camera AI |
| loitering | soft | Camera AI |
| motion_camera | soft | Camera motion |
| door_open | **hard** | Contact sensor |
| door_close | **hard** | Contact sensor |
| glass_break | **hard** | Acoustic/vibration sensor |
| motion_pir | **hard** | PIR sensor |
| tamper_s | soft | Suspected tamper (single source) |
| tamper_c | **hard** | Confirmed tamper (corroborated) |
| offline | soft | Device health |
| battery_low | soft | Device health |
| context_gate | soft | Context signal (yard/porch) |

### 1.3 Context Gate Signals

Context Gates are abstract binary context signals that accelerate PRE escalation but MUST NOT trigger PENDING/TRIGGERED.

```
ContextGateSignal {
    signal_kind: "context_gate"
    gate_type: yard_confirmed | porch_confirmed
    source_device: str          # Camera, sensor, or fused
    ttl_sec: int                # Time-to-live for this gate
    expires_at: datetime        # Computed: ingest_ts + ttl_sec
}
```

**Context Gate TTL Policy** (FIX for Issue #1):

| Gate Type | Default TTL | Rationale |
|-----------|-------------|-----------|
| yard_confirmed | 120s | Covers approach-to-door path |
| porch_confirmed | 60s | Shorter dwell at door |

**Rules**:
- Each context_gate signal MUST have a TTL
- TTL expiration automatically invalidates the gate
- TTL expiration MUST NOT emit new signals
- Only TTL-valid gates may accelerate PRE escalation
- TTL expired = fail-open (revert to slow thresholds)

### 1.4 Camera Role Classification

| Role | Can Advance PRE? | Can Advance PENDING/TRIGGERED? | Evidence Collection |
|------|------------------|--------------------------------|---------------------|
| **judge** | ✅ Yes | No (only hard signals) | ✅ Primary |
| **witness** | ❌ No | ❌ No | ✅ Secondary/Verification |

**Rules**:
- Only `camera_role=judge` signals may influence PRE classification
- `camera_role=witness` signals are for verification and evidence only
- A single entrypoint SHOULD have exactly one Judge camera
- Witness cameras MAY be battery-powered, cloud-managed, or non-RTSP

### 1.5 Delivery Semantics

- Signal ingestion is **at-least-once**
- Downstream processing MUST be idempotent on `signal_id`
- Late/duplicate signals MAY append to incident but MUST NOT cause re-transition
- Hard signals MUST NOT be dropped under any circumstances

### 1.6 Time Policy

| Use Case | Timestamp | Rationale |
|----------|-----------|-----------|
| Ordering & Correlation | `ingest_ts` | Device clocks may drift |
| Evidence & Audit | Both | Full traceability |
| User Display | `timestamp` | Device-reported time |
| Context Gate Expiry | `ingest_ts + ttl_sec` | Edge-controlled |

---

## 2. Correlation Layer

### 2.1 Responsibilities (Allowed)

- Merge signals into IncidentCandidate
- Deduplicate by `signal_id`
- Group by `leaseKey`
- Attribute to zone/entrypoint/track
- Track active Context Gates and their TTL
- Compute scoring hints (non-binding)

### 2.2 Non-Responsibilities (Forbidden)

| ❌ Forbidden | Reason |
|--------------|--------|
| Change ThreatState | Only State Machine |
| Change WorkflowState | Only State Machine |
| Emit notifications | Only Action Executor |
| Control siren/lights | Only Action Executor |
| Upload evidence | Only Evidence Manager |
| Call external services | Edge isolation |
| Advance state via context_gate | Context only accelerates, never triggers |

### 2.3 Lease & Window Model

```
leaseKey = (home_id, zone_id, entrypoint_id)
```

| Window | Default | Purpose |
|--------|---------|---------|
| PRE aggregation | 30-90s | Group soft signals |
| Hard association | 10-30s | Correlate hard with soft |
| Incident active | 3-10min | Append vs new incident |
| Context Gate TTL | 60-120s | Gate validity window |

### 2.4 IncidentCandidate Structure

```
IncidentCandidate {
    candidate_id: str
    lease_key: str
    
    # Temporal
    window_start: datetime
    window_end: datetime
    last_signal_at: datetime
    
    # Signals
    signals: Signal[]           # All signals
    soft_count: int
    hard_count: int
    
    # Context Gates (with TTL tracking)
    active_gates: {
        yard_confirmed: { valid: bool, expires_at: datetime }
        porch_confirmed: { valid: bool, expires_at: datetime }
    }
    
    # Hints (non-binding)
    threat_hint: ThreatLevel
    confidence: float
    evidence_hints: str[]
    
    # Attribution
    zone_id: str
    entrypoint_id: str?
    track_ids: str[]
    
    # Camera availability
    judge_available: bool
    witness_available: bool
}
```

### 2.5 Split & Merge Rules

**SPLIT** incident when:
- `door_close` + silence > `split_silence_threshold` (default 60s)
- Track exits zone + silence > `track_decay_window` (default 30s)
- Explicit user action (resolve/close)

**MERGE** signals when:
- Same `leaseKey` + within `incident_active_window`
- Continuous track spans adjacent zones (driveway → front door)
- Same device + ROI continuity indicates single actor

**NEVER MERGE**:
- Signals from different `entrypoint_id` (unless track continuity proven)
- Signals separated by > `incident_active_window`

---

## 3. Incident State Machine

### 3.1 Orthogonal State Dimensions

```
┌─────────────────────────────────────────────────────────────┐
│  ThreatState (signal-driven, monotonic with decay)          │
│  NONE → PRE_L1 → PRE_L2 → PRE_L3 → PENDING → TRIGGERED     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  WorkflowState (action/user-driven)                         │
│  IDLE → NOTIFIED → VERIFYING → ESCALATED → RESOLVED → CLOSED│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  JudgeAvailabilityState (health-driven)                     │
│  AVAILABLE | DEGRADED                                        │
└─────────────────────────────────────────────────────────────┘
```

**Key Rules**: 
- ThreatState and WorkflowState are independent
- PRE advancement does not force Workflow advancement
- JudgeAvailabilityState gates PRE escalation

### 3.2 Valid State Combinations

| ThreatState | Valid WorkflowStates |
|-------------|---------------------|
| NONE | IDLE, CLOSED |
| PRE_L1 | IDLE |
| PRE_L2 | IDLE, NOTIFIED |
| PRE_L3 | IDLE, NOTIFIED, VERIFYING |
| PENDING | NOTIFIED, VERIFYING |
| TRIGGERED | NOTIFIED, VERIFYING, ESCALATED, RESOLVED |

Invalid combinations MUST raise `InvalidStateError` and be logged.

### 3.3 Workflow Sub-Phases

WorkflowState `ESCALATED` has sub-phases for finer control:

```
WorkflowSubPhase (for ESCALATED only) {
    SIREN_ACTIVE        # Siren currently sounding
    SIREN_TIMEOUT       # Siren auto-stopped after max duration
    AWAITING_RESPONSE   # Waiting for user/collaborator response
    DISPATCH_REQUESTED  # Emergency dispatch requested
    DISPATCH_CONFIRMED  # Dispatch acknowledged by provider
    DISPATCH_CANCELLED  # User cancelled dispatch
}
```

**Sub-Phase Transitions**:

```
ESCALATED entry → SIREN_ACTIVE (if sirenPolicy.auto=true)
                → AWAITING_RESPONSE (if sirenPolicy.auto=false)

SIREN_ACTIVE --[timeout]--> SIREN_TIMEOUT → AWAITING_RESPONSE
SIREN_ACTIVE --[user_silence]--> AWAITING_RESPONSE

AWAITING_RESPONSE --[user_dispatch]--> DISPATCH_REQUESTED
AWAITING_RESPONSE --[user_resolve]--> (exit to RESOLVED)

DISPATCH_REQUESTED --[provider_ack]--> DISPATCH_CONFIRMED
DISPATCH_REQUESTED --[user_cancel]--> DISPATCH_CANCELLED → AWAITING_RESPONSE
```

### 3.4 Judge Availability & Fallback (FIX for Issue #2)

```
JudgeAvailabilityState {
    AVAILABLE   # Judge camera online and healthy
    DEGRADED    # Judge camera offline or unhealthy
}
```

**Fallback Rules when DEGRADED**:

| Capability | Behavior |
|------------|----------|
| PRE_L2/L3 escalation | ❌ Disabled |
| PRE_L1 logging | ✅ Allowed |
| Hard signal processing | ✅ Unaffected |
| User notification | ✅ "Primary camera unavailable" |
| Witness promotion to Judge | ❌ Not allowed |

**Transition Rules**:

```
Judge offline > offline_threshold_sec (90s) → DEGRADED
Judge heartbeat received → AVAILABLE
```

**Relationship to Tamper**:
- Judge offline ≠ Tamper-S (handled separately)
- Tamper-S follows §9 rules independently

### 3.5 Camera Role Constraints

| Signal Source | Can Advance ThreatState? | Can Advance WorkflowState? |
|---------------|--------------------------|---------------------------|
| Judge camera | ✅ PRE only | ❌ No |
| Witness camera | ❌ No | ❌ No |
| Hard sensor | ✅ PENDING/TRIGGERED | ✅ Yes (via Action Gate) |

### 3.6 Threat Transition Rules

```
# Soft signals from Judge: max PRE_L3
judge_soft_signal → max(current, hint) capped at PRE_L3

# Soft signals from Witness: no advancement
witness_soft_signal → log only, no state change

# Hard signals: can reach PENDING/TRIGGERED
door_open (entry_exit zone) → PENDING
door_open (interior zone) → TRIGGERED
glass_break → TRIGGERED
tamper_c → TRIGGERED (policy-gated)
motion_pir (armed_away) → TRIGGERED

# Judge DEGRADED: PRE capped at L1
if JudgeAvailabilityState == DEGRADED:
    soft_signal → max PRE_L1
```

### 3.7 Context-Accelerated PRE Escalation (Soft Gate)

PRE-L2 escalation threshold depends on Context Gate status:

| Context | PRE-L2 Dwell Threshold | Notes |
|---------|------------------------|-------|
| `yard_confirmed` valid | 30s | Accelerated |
| `yard_confirmed` expired/absent | 90s | Default (fail-open) |

**Rules**:
- Context Gates only affect dwell thresholds, not PRE ceiling
- PRE escalation still capped at PRE_L3 regardless of context
- Context Gate expiry immediately reverts to slow threshold
- Fail-open: no context = conservative behavior

### 3.8 Threat Decay Rules

PRE states decay after silence:

| From | To | Silence Window | Reason Code |
|------|----|----------------|-------------|
| PRE_L3 | PRE_L2 | 120s | DECAY_SILENCE_L3 |
| PRE_L2 | PRE_L1 | 180s | DECAY_SILENCE_L2 |
| PRE_L1 | NONE | 300s | DECAY_SILENCE_L1 |

Decay MUST emit TransitionRecord with `reason_code`.

PENDING/TRIGGERED do NOT auto-decay (require explicit action).

### 3.9 PENDING Cancellation Rules

| Condition | Result | Reason Code |
|-----------|--------|-------------|
| door_close within 3s of door_open | Cancel PENDING → NONE | QUICK_OPEN_CLOSE |
| Valid PIN entered on keypad | Cancel PENDING → NONE | USER_DISARM_PIN |
| User confirms "It's me" in app | Cancel PENDING → RESOLVED | USER_CONFIRM_SELF |
| Entry delay timeout | Escalate → TRIGGERED | ENTRY_DELAY_EXPIRED |

Cancellation NOT allowed for:
- `glass_break` triggered incidents
- `tamper_c` triggered incidents
- Already TRIGGERED state

### 3.10 Human-Verified Tamper Escalation

Tamper detection follows Human-Verify flow:

```
Tamper-S detected → PRE_L2(tamper_s) → Notify user → Wait for response

User actions:
  - "Confirm Threat" → TRIGGERED (reason=tamper_verified_by_user)
  - "Mark as Fault" → RESOLVED (outcome=fault)
  - No response / timeout → See §3.11
```

**Rules**:
- `rule_id=TAMPER_USER_CONFIRM`
- `reason_code=tamper_verified_by_user`
- No automatic siren for tamper by default

### 3.11 Human-Verify Timeout Policy (FIX for Issue #4)

```
HumanVerifyTimeoutPolicy {
    confirm_window_sec: 60              # Time for user to respond
    reminder_enabled: bool              # Low-frequency reminders
    reminder_interval_sec: 300          # If enabled
    decay_after_timeout_sec: 300        # When to decay if still no response
}
```

**When `confirm_window_sec` expires with no user action**:

| Dimension | State | Notes |
|-----------|-------|-------|
| ThreatState | Remains PRE_L2 | No auto-escalation |
| WorkflowState | → IDLE | Reset workflow |
| Event tag | `unresolved_tamper` | For audit |
| Evidence | Remains CANDIDATE | Not promoted |

**Subsequent behavior**:
- Low-frequency reminders MAY be sent
- ThreatState decays per normal PRE decay rules after `decay_after_timeout_sec`
- No automatic TRIGGER is ever generated from timeout

### 3.12 Rule Registry

All transition rules are defined in a registry that supports hot-reload and canary deployment.

```
RuleRegistry {
    rules: Map<rule_id, TransitionRule>
    version: str
    loaded_at: datetime
    source: file | remote | embedded
    
    # Canary deployment
    canary_enabled: bool
    canary_percentage: float
    canary_rules: Map<rule_id, TransitionRule>
    canary_selector: (incident) -> bool
    
    # Methods
    reload(): RuleLoadResult
    get_rule(rule_id, incident): TransitionRule
    evaluate(incident, signal): TransitionResult
}

TransitionRule {
    rule_id: str
    version: str
    priority: int
    
    conditions: {
        signal_kinds: str[]
        threat_states: ThreatState[]
        arming_states: str[]
        zone_types: str[]
        judge_available: bool?          # NEW: Judge availability condition
        context_gates: str[]?           # NEW: Required context gates
        custom_predicate: str?
    }
    
    action: {
        new_threat: ThreatState?
        new_workflow: WorkflowState?
        reason_code: str
    }
    
    enabled: bool
    created_at: datetime
    description: str
}
```

### 3.13 Transition Recording (Mandatory)

Every state change MUST emit:

```
TransitionRecord {
    record_id: str
    timestamp: datetime
    incident_id: str
    
    dimension: "threat" | "workflow" | "sub_phase" | "judge_availability"
    from_state: str
    to_state: str
    
    rule_id: str
    rule_version: str
    is_canary: bool
    reason_code: str
    
    trigger_signal_ids: str[]
    trigger_signal_summary: {
        signal_kind, device_id, confidence, camera_role?
    }
    
    context: {
        arming_state, house_mode, zone_id, entrypoint_id,
        judge_available, active_context_gates
    }
}
```

---

## 4. Mode Policy

### 4.1 Mode Inputs

```
ModeContext {
    arming_state: disarmed | armed_stay | armed_away
    house_mode: home | away | night | vacation
    entry_delay_sec: int        # Default 30
    exit_delay_sec: int         # Default 60
    bypass_zones: str[]         # Zones to ignore
}
```

### 4.2 Threat Transition Matrix

| Arming State | Signal Kind | Zone Type | → ThreatState |
|--------------|-------------|-----------|---------------|
| **disarmed** | any | any | NONE (log only) |
| **armed_stay** | door_open | entry_exit | PENDING |
| **armed_stay** | door_open | interior | NONE |
| **armed_stay** | motion_pir | interior | NONE |
| **armed_stay** | motion_pir | perimeter | PRE_L2 |
| **armed_stay** | glass_break | any | TRIGGERED |
| **armed_away** | door_open | entry_exit | PENDING |
| **armed_away** | door_open | interior | TRIGGERED |
| **armed_away** | motion_pir | any | TRIGGERED |
| **armed_away** | glass_break | any | TRIGGERED |

### 4.3 Bypass Handling

- Signals from `bypass_zones` are logged but do not advance ThreatState
- Bypass status MUST be recorded in TransitionRecord

---

## 5. Action Gate

### 5.1 Action Permission Matrix

| ThreatState | Permitted Actions |
|-------------|-------------------|
| NONE | (none) |
| PRE_L1 | log, cache_evidence_pointer |
| PRE_L2 | log, cache_evidence_pointer, notify_light, spotlight_on, live_view_hint, commit_candidate_evidence |
| PRE_L3 | log, cache_evidence_pointer, notify_strong, spotlight_on, live_view_hint, pull_minimal_clip, beep_warning |
| PENDING | log, notify_urgent, spotlight_on, keypad_countdown, prepare_siren, pull_evidence_packet |
| TRIGGERED | log, notify_alarm, siren_on, spotlight_on, pull_full_evidence, collaboration_alert, dispatch_ready |

### 5.2 Sub-Phase Action Permissions

| Sub-Phase | Additional Actions |
|-----------|-------------------|
| SIREN_ACTIVE | siren_off (user), siren_timeout (system) |
| AWAITING_RESPONSE | request_dispatch, resolve, escalate_collaborator |
| DISPATCH_REQUESTED | cancel_dispatch, dispatch_update |
| DISPATCH_CONFIRMED | (read-only until resolved) |

### 5.3 PRE Notification Suppression

When ThreatState reaches PENDING or TRIGGERED:
- PRE-level notifications (`notify_light`, `notify_strong`) are **suppressed**
- PRE signals continue to append to incident (for evidence)
- Only PENDING/TRIGGERED notifications are sent

### 5.4 PRE Deterrence Auto-Stop

PRE deterrence (beep/light) MUST stop when:
- No presence detected for `no_presence_clear_sec` (default 60s)
- User silences deterrence
- ThreatState decays to NONE

PRE deterrence MUST NOT persist indefinitely.

---

## 6. Action Execution Contract

### 6.1 Action Definition

```
ActionSpec {
    action_id: str
    action_type: str
    target_device: str?
    
    preconditions: Condition[]
    retry_policy: {
        max_attempts: int
        backoff_ms: int
    }
    cooldown_sec: int
    timeout_sec: int
    
    fallback_action: str?
    failure_blocks_state: bool
}
```

### 6.2 Siren Policy (Edge-evaluated)

```
SirenPolicy {
    auto: bool                  # Auto-start on TRIGGERED
    delay_sec: int              # Delay before siren starts
    max_duration_sec: int       # Auto-stop after this duration
}
```

**Default Policies by Trigger Reason**:

| Trigger Reason | auto | delay_sec | max_duration_sec |
|----------------|------|-----------|------------------|
| entry_delay_expired | true | 0 | 180 |
| glass_break | true | 0 | 180 |
| tamper_verified_by_user | false | - | 180 |
| tamper_suspected (PRE-L2) | false | - | - |

### 6.3 Siren Stop Conditions

Siren MUST stop immediately upon any of:
1. Authenticated Disarm (Keypad / App)
2. User presses "Silence Siren" (event remains TRIGGERED)
3. Event marked RESOLVED
4. `max_duration_sec` timeout

### 6.4 Standard Action Specs

| Action | Cooldown | Timeout | Retry | Fallback |
|--------|----------|---------|-------|----------|
| siren_on | 5s | 10s | 3 | spotlight_on |
| siren_off | 1s | 5s | 3 | (none) |
| spotlight_on | 1s | 5s | 3 | (none) |
| notify_alarm | 0s | 30s | 5 | (none) |
| pull_evidence_packet | 60s | 120s | 2 | pull_minimal_clip |
| request_dispatch | 0s | 60s | 3 | notify_alarm |

---

## 7. Evidence Policy

### 7.1 Evidence Levels

| ThreatState | Evidence Mode | Retention | Exportable |
|-------------|---------------|-----------|------------|
| PRE_L1 | Ring buffer pointers only | 1 hour | No |
| PRE_L2 | CANDIDATE (local commit) | 24 hours | No (unless promoted) |
| PRE_L3 | Snapshots + short clips | 24 hours | User request |
| PENDING | Prepared packet | 7 days | Yes |
| TRIGGERED | Full packet | 30 days | Yes |

### 7.2 CANDIDATE Evidence (FIX for Issue #3)

CANDIDATE is a local evidence window committed on PRE-L2 entry.

**Commit Rules**:
- Commit ONLY on **first transition into PRE_L2** for an incident
- Subsequent PRE_L2 refreshes MUST NOT create new commits
- PRE_L3 escalation MAY extend the existing CANDIDATE window (once)
- Decay back to PRE_L1/NONE: no new commit, no overwrite

**Window Configuration**:
```
CandidateEvidenceConfig {
    pre_roll_sec: 10            # Before PRE-L2 entry
    post_roll_sec: 10           # After PRE-L2 entry
    max_extension_sec: 30       # If extended on PRE_L3
    ttl_hours: 24               # Auto-cleanup
}
```

**Promotion**:
- CANDIDATE → EvidencePacket when incident escalates to PENDING/TRIGGERED
- Unpromoted CANDIDATE expires per TTL

### 7.3 Evidence Packet Contents (TRIGGERED)

```
EvidencePacket {
    incident_id: str
    
    clips: [{
        camera_id, camera_role, start_ts, end_ts, resolution, url
    }]
    pre_buffer_sec: 60
    post_buffer_sec: 120
    
    signal_sequence: Signal[]
    
    device_heartbeats: [{
        device_id, last_seen, battery, connectivity
    }]
    
    created_at: datetime
    total_size_bytes: int
    promoted_from_candidate: bool
}
```

### 7.4 Privacy & Storage

- Evidence defaults to **local-only** on Edge
- Cloud upload requires explicit user consent or TRIGGERED state
- PRE/CANDIDATE evidence auto-expires
- TRIGGERED evidence requires manual deletion

---

## 8. Noise Control & Backpressure

### 8.1 Signal Sampling (Soft Only)

Under resource pressure:
- PRE_L1 signals: sample 1-in-N (N configurable)
- PRE_L2/L3 signals: sample 1-in-2 max
- Hard signals: **NEVER sample or drop**

### 8.2 Notification Cooldowns

| ThreatState | Cooldown | Notes |
|-------------|----------|-------|
| PRE_L1 | 600s (10min) | Or skip entirely |
| PRE_L2 | 300s (5min) | |
| PRE_L3 | 60s (1min) | |
| PENDING | 0s | Always notify |
| TRIGGERED | 0s | Always notify |

### 8.3 Sensor Debounce

| Signal Kind | Debounce Window |
|-------------|-----------------|
| door_open/close | 5s |
| motion_pir | 15s |
| glass_break | 0s (never debounce) |
| context_gate | 0s (use TTL instead) |

### 8.4 Backpressure Response

When Edge resources critical:
1. Increase soft signal sampling rate
2. Reduce PRE evidence retention
3. Downshift PRE_L3 → PRE_L2 processing
4. **Never** affect hard signal processing

---

## 9. Health & Reliability Signals

### 9.1 Health Signal Types

| Signal | Source | Typical Interval |
|--------|--------|------------------|
| camera_heartbeat | Camera | 30s |
| rtsp_availability | Edge monitor | 10s |
| battery_level | Sensor | 1h |
| connectivity | Edge monitor | 60s |
| device_offline | Edge monitor | On change |

### 9.2 Health → Threat Policy

**Default**: Health degradation affects available actions, NOT threat level.

| Health Signal | Effect |
|---------------|--------|
| judge_camera_offline | → JudgeAvailabilityState.DEGRADED |
| witness_camera_offline | Log warning, no state change |
| low_battery | Log warning, no threat change |
| connectivity_loss | Queue notifications for retry |

### 9.3 Tamper Detection

**Tamper-S** (Suspected):
- Single camera offline/unhealthy
- Obstruction suspected (dark frame)
- Spray/blur suspected
- Scene shift suspected

**On Tamper-S**:
- ThreatState → PRE_L2 (tamper_s)
- Strong notification to owner
- Human-Verify flow initiated
- No automatic siren

**Tamper-C** (Confirmed):
- Computed by Correlation, not raw signal
- Requires corroboration (dual offline + hard signal, or visual confirmation)
- MAY escalate to TRIGGERED (policy-gated, default OFF)

### 9.4 Tamper-C Policy

```
TamperCPolicy {
    enabled: bool               # Default false
    require_hard_correlation: bool  # Default true
    escalate_to: TRIGGERED | PRE_L3  # Default PRE_L3
    reason_code: "TAMPER_C_ESCALATION"
}
```

---

## 10. Metrics & Observability

### 10.1 Required Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `signal_ingested_total` | Counter | source_type, signal_kind, hardness, camera_role |
| `signal_dropped_total` | Counter | source_type, reason |
| `context_gate_active` | Gauge | gate_type |
| `context_gate_expired_total` | Counter | gate_type |
| `incident_created_total` | Counter | zone_id |
| `incident_by_threat` | Gauge | threat_state |
| `incident_by_subphase` | Gauge | sub_phase |
| `judge_availability` | Gauge | state (available/degraded) |
| `transition_total` | Counter | dimension, from_state, to_state, rule_id |
| `transition_canary_total` | Counter | rule_id, is_canary |
| `action_executed_total` | Counter | action_type, success |
| `action_latency_ms` | Histogram | action_type |
| `signal_to_notify_latency_ms` | Histogram | threat_state |
| `candidate_evidence_committed_total` | Counter | outcome (promoted/expired) |
| `human_verify_timeout_total` | Counter | outcome |

### 10.2 Alerting Thresholds

| Condition | Alert |
|-----------|-------|
| Hard signal drop | CRITICAL |
| Judge camera DEGRADED > 5min | WARNING |
| Action failure rate > 10% | WARNING |
| Signal-to-notify latency > 5s | WARNING |
| Incident backlog > 100 | WARNING |
| Human-verify timeout rate > 50% | INFO |

---

## 11. Incident Replay Contract

### 11.1 Purpose

The Replay Contract enables:
- Reproducing production incidents for debugging
- Regression testing rule changes
- Stress testing with synthetic data
- Compliance auditing

### 11.2 Replay Input

```
ReplayInput {
    replay_id: str
    description: str?
    
    signals: Signal[]           # Ordered by ingest_ts
    
    initial_state: {
        mode_context: ModeContext
        active_incidents: Incident[]
        device_states: DeviceState[]
        judge_availability: JudgeAvailabilityState
        active_context_gates: ContextGate[]
    }
    
    config: Config
    rules: RuleRegistry
    
    time_mode: realtime | accelerated | instant
    acceleration_factor: float?
}
```

### 11.3 Replay Output

```
ReplayOutput {
    replay_id: str
    
    incidents: Incident[]
    transitions: TransitionRecord[]
    actions_authorized: Action[]
    actions_executed: Action[]
    
    candidate_evidence: CandidateEvidence[]
    context_gate_events: ContextGateEvent[]
    
    signals_processed: int
    signals_deduplicated: int
    incidents_created: int
    total_transitions: int
    
    replay_started_at: datetime
    replay_completed_at: datetime
    simulated_duration: duration
    wall_clock_duration: duration
    
    errors: ReplayError[]
    warnings: ReplayWarning[]
}
```

### 11.4 Replay Constraints

| Constraint | Description |
|------------|-------------|
| **Deterministic** | Same input MUST produce identical output |
| **Side-effect-free** | No real notifications, siren, uploads (unless live mode) |
| **Time-isolated** | Uses simulated clock, not system clock |
| **Config-frozen** | Rules and config cannot change during replay |
| **Context-Gate-Aware** | Must simulate TTL expiry correctly |

### 11.5 Standard Test Scenarios

| Scenario | Validates |
|----------|-----------|
| Door breach (away mode) | PENDING → TRIGGERED on timeout |
| Perimeter intrusion | PRE escalation with context acceleration |
| Suspicious person (non-escalating) | PRE decay without TRIGGER |
| Tamper (no response) | Human-verify timeout handling |
| Judge camera offline | PRE capped at L1 |
| Package delivery | Logistics separation |

---

## 12. Edge / Cloud Contract

### 12.1 Overview

```
┌─────────────────┐                    ┌─────────────────┐
│                 │  Event Report      │                 │
│                 │ ─────────────────► │                 │
│                 │  Evidence Upload   │                 │
│      EDGE       │ ─────────────────► │     CLOUD       │
│                 │                    │                 │
│                 │  Config Push       │                 │
│                 │ ◄───────────────── │                 │
│                 │  Remote Command    │                 │
│                 │ ◄───────────────── │                 │
└─────────────────┘                    └─────────────────┘
```

### 12.2 Edge → Cloud: Event Report

```
EventReport {
    report_id: str
    edge_id: str
    home_id: str
    
    incident_id: str
    threat_state: ThreatState
    workflow_state: WorkflowState
    sub_phase: WorkflowSubPhase?
    
    incident_started_at: datetime
    last_transition_at: datetime
    reported_at: datetime
    
    signal_count: int
    hard_signal_count: int
    signal_kinds: str[]
    
    zone_id: str
    entrypoint_id: str?
    
    judge_available: bool
    active_context_gates: str[]
    
    evidence_available: bool
    evidence_size_bytes: int?
    candidate_promoted: bool
    
    transition_count: int
    key_transitions: TransitionRecord[]
    
    tags: str[]                 # e.g., ["unresolved_tamper"]
}
```

### 12.3 Edge → Cloud: Evidence Upload

(unchanged from v2.1)

### 12.4 Cloud → Edge: Config Push

```
ConfigUpdate {
    update_id: str
    timestamp: datetime
    
    changes: [{
        path: str
        old_value: any
        new_value: any
    }]
    
    full_config: Config?
    
    rule_updates: [{
        rule_id: str
        action: "add" | "update" | "delete"
        rule: TransitionRule?
    }]
    
    context_gate_config: {
        yard_ttl_sec: int?
        porch_ttl_sec: int?
    }
    
    require_ack: bool
    ack_timeout_sec: int
}
```

### 12.5 Cloud → Edge: Remote Command

(unchanged from v2.1)

### 12.6 Offline Behavior

| Scenario | Edge Behavior | Sync on Reconnect |
|----------|---------------|-------------------|
| Cloud unreachable | Continue all local operations | Queue EventReports |
| Event queue full | Drop oldest PRE events, keep TRIGGERED | Sync TRIGGERED first |
| Config push missed | Use last known config | Pull latest config |
| Command while offline | Not received | Command expires |

---

## 13. Configuration Defaults

```yaml
correlation:
  pre_aggregation_window_sec: 60
  hard_association_window_sec: 30
  incident_active_window_sec: 300
  split_silence_threshold_sec: 60
  track_decay_window_sec: 30

context_gate:
  yard_confirmed_ttl_sec: 120
  porch_confirmed_ttl_sec: 60

state_machine:
  entry_delay_sec: 30
  exit_delay_sec: 60
  quick_open_close_window_sec: 3
  
  decay:
    pre_l3_silence_sec: 120
    pre_l2_silence_sec: 180
    pre_l1_silence_sec: 300
  
  sub_phase:
    siren_max_duration_sec: 180
    dispatch_timeout_sec: 300

  soft_gate:
    yard_accelerated_dwell_sec: 30
    default_dwell_sec: 90

  human_verify:
    confirm_window_sec: 60
    reminder_enabled: true
    reminder_interval_sec: 300
    decay_after_timeout_sec: 300

judge:
  offline_threshold_sec: 90
  allow_witness_fallback: false

rules:
  registry_source: file
  registry_path: /etc/ng-edge/rules.yaml
  canary_enabled: false
  canary_percentage: 0.0
  hot_reload_enabled: true
  reload_check_interval_sec: 60

action:
  siren_max_duration_sec: 180
  siren_cooldown_sec: 5
  notify_retry_max: 5
  no_presence_clear_sec: 60

evidence:
  candidate:
    pre_roll_sec: 10
    post_roll_sec: 10
    max_extension_sec: 30
    ttl_hours: 24
  pre_retention_hours: 24
  triggered_retention_days: 30
  pre_buffer_sec: 60
  post_buffer_sec: 120

noise:
  pre_l1_notify_cooldown_sec: 600
  pre_l2_notify_cooldown_sec: 300
  pre_l3_notify_cooldown_sec: 60
  door_debounce_sec: 5
  motion_debounce_sec: 15

health:
  camera_heartbeat_interval_sec: 30
  offline_threshold_sec: 90
  tamper_c_enabled: false
  tamper_c_escalate_to: PRE_L3

backpressure:
  soft_sample_rate_normal: 1.0
  soft_sample_rate_pressure: 0.5
  hard_sample_rate: 1.0

replay:
  enabled: true
  max_concurrent: 3
  result_retention_hours: 24

cloud:
  event_report_endpoint: https://api.neighborguard.com/v1/events
  evidence_upload_endpoint: https://api.neighborguard.com/v1/evidence
  config_poll_interval_sec: 300
  websocket_enabled: true
  websocket_endpoint: wss://api.neighborguard.com/v1/edge/ws
  offline_queue_max_size: 1000
```

---

## 14. Explicit Deferrals

| Topic | Reason | Hook Preserved |
|-------|--------|----------------|
| Collaboration / circle workflows | Multi-party complexity | `collaboration_hint` field |
| Cross-house correlation | Privacy & scale | `home_id` in all records |
| Cloud-side learning | Requires data pipeline | Metrics emission |
| PTZ camera presets | Hardware-specific | `device_capabilities` |
| Voice announcements | UX design pending | `announcement_hint` field |
| Geofencing auto-arm | Mobile app dependency | `arming_trigger` field |
| Witness-to-Judge promotion | Safety concerns | `allow_witness_fallback: false` |

---

## 15. Implementation Checklist

| # | Component | Status | Notes |
|---|-----------|--------|-------|
| 1 | Signal Envelope validation | ⬜ | Include camera_role, context_gate |
| 2 | Context Gate TTL tracking | ⬜ | Per-gate expiry |
| 3 | Correlation Layer | ⬜ | Pure logic, testable |
| 4 | Lease Manager | ⬜ | Zone-level isolation |
| 5 | State Machine (triple dimension) | ⬜ | Threat + Workflow + JudgeAvailability |
| 6 | Sub-Phase handling | ⬜ | ESCALATED sub-states |
| 7 | Judge Availability tracking | ⬜ | AVAILABLE/DEGRADED |
| 8 | Soft Gate acceleration | ⬜ | Context-aware dwell |
| 9 | Rule Registry | ⬜ | Hot-reload support |
| 10 | Transition Recording | ⬜ | Every state change |
| 11 | Action Gate | ⬜ | Permission matrix |
| 12 | Action Executor | ⬜ | With retry/cooldown |
| 13 | Siren Policy evaluation | ⬜ | Per-trigger-reason |
| 14 | Evidence Manager | ⬜ | CANDIDATE support |
| 15 | Human-Verify timeout | ⬜ | Workflow reset |
| 16 | Noise Policy | ⬜ | Debounce + cooldown |
| 17 | Health Monitor | ⬜ | Judge + Tamper |
| 18 | Replay Engine | ⬜ | Deterministic replay |
| 19 | Cloud Client | ⬜ | Event report, evidence |
| 20 | Command Handler | ⬜ | Remote commands |
| 21 | Metrics emission | ⬜ | Prometheus format |
| 22 | Config loader | ⬜ | YAML with defaults |

---

## 16. Migration Path from v18.x

| Current Component | Target Component | Change Type |
|-------------------|------------------|-------------|
| `state_machine_v5.py` | `incident_state_machine.py` | Refactor (triple dimension) |
| (none) | `judge_availability_tracker.py` | New |
| (none) | `context_gate_manager.py` | New |
| (none) | `rule_registry.py` | New |
| `zigbee_signal_router.py` | `signal_layer/sensor_source.py` | Add camera_role |
| `camera_signal_source.py` | `signal_layer/camera_source.py` | Add camera_role, context |
| (none) | `correlation/correlator.py` | New |
| (none) | `correlation/lease_manager.py` | New |
| `manager.py._trigger_*` | `action/action_gate.py` | Extract |
| `manager.py._trigger_*` | `action/action_executor.py` | Extract |
| (none) | `action/siren_policy.py` | New |
| (none) | `evidence/evidence_manager.py` | New (CANDIDATE support) |
| (none) | `evidence/candidate_tracker.py` | New |
| (none) | `health/health_monitor.py` | New |
| (none) | `health/human_verify_tracker.py` | New |
| (none) | `noise/noise_policy.py` | New |
| (none) | `replay/replay_engine.py` | New |
| (none) | `cloud/cloud_client.py` | New |
| (none) | `cloud/command_handler.py` | New |

---

*End of Architecture Spec v2.2*
