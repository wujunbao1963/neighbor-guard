# Addendum §16 — Configuration Elasticity, Zone Gating & Evidence Arming

> Applies to: NG-EDGE-PRD v7.6.1 (Consolidated)
> Nature: **Additive / Non-breaking**

---

## 16.1 Scope & Intent

This addendum refines **PRE behavior, configuration flexibility, and evidence handling** without modifying any frozen semantics defined in v7.6.1.

All rules herein:
- MUST preserve Edge-authoritative security
- MUST NOT introduce new TRIGGER paths
- MUST remain compatible with baseline configurations

---

## 16.2 Configuration Elasticity

The system SHALL support both **minimal** and **enhanced** configurations.

### 16.2.1 Baseline EntryPoint (Minimum Viable)

Required:
- Door contact (interior)
- Glass break sensor (recommended)
- Keypad / disarm method
- Judge camera (door-area zoning)

Guarantees:
- PRE deterrence with live verification
- Door-only PENDING
- Evidence-based TRIGGER only

### 16.2.2 Optional Capabilities

Optional sensors and cameras MAY be added to improve intelligence and reliability:
- Yard gate contact
- Porch presence / mmWave
- Indoor motion
- Witness camera (verification / tamper supervision)

Optional inputs MUST only affect PRE behavior and verification quality.

---

## 16.3 Context Gate Abstraction

The system defines abstract binary context signals:

- `context_gate.yard_confirmed`
- `context_gate.porch_confirmed`

Sources are not fixed and MAY include contacts, cameras, or presence sensors.

Context gates:
- Accelerate PRE escalation
- MUST NOT trigger PENDING or TRIGGER

---

## 16.4 Soft Gate Policy (Yard → Porch)

The system SHALL implement **Soft Gate** escalation:

- Porch detection ALWAYS allows PRE-L0/L1
- PRE-L2 escalation depends on dwell time and context acceleration

Recommended defaults:
- Yard confirmed: PRE-L2 at 30s
- Yard unknown: PRE-L2 at 90s

Fail-open rule:
- Loss of yard context MUST fall back to longer dwell thresholds

---

## 16.5 Evidence Arming on PRE-L2

Upon entering PRE-L2:
- EDGE commits a local evidence window
- Pre/post roll applied (default 10s)

If PRE-L2 exits without escalation:
- Evidence retained locally as `CANDIDATE`
- Not exportable by default
- Subject to TTL cleanup

---

## 16.6 Dual Camera Role Split

### Judge Camera
- Sole source for PRE classification
- Focused on DOOR zone and dwell

### Witness Camera
- Used for live verification and Tamper supervision
- MUST NOT participate in PRE/PENDING/TRIGGER decisions

---

## 16.7 Non-Goals (Reaffirmed)

- No mandatory sensor types
- No server-side security inference
- No presence-only alarms

---

## 16.8 Tamper Human-Verify Flow (Judge + Human-Verify Camera)

### 16.8.1 Intent

Tamper detection prioritizes **human verification over automatic escalation**. Automated logic detects *suspected tamper*; confirmation is explicitly performed by the user via a secondary (Human-Verify) camera.

This model reduces false alarms while preserving rapid escalation when a real attack is confirmed.

---

### 16.8.2 Roles

- **Judge Camera**: Primary detection source. Runs all automated tamper algorithms on EDGE.
- **Human-Verify Camera** (e.g. Blink Outdoor): Secondary view used only for manual verification.

Human-Verify cameras:
- MUST NOT participate in automatic Tamper-C confirmation
- MAY be battery-powered, cloud-managed, or non-RTSP
- Are used exclusively for user-in-the-loop verification

---

### 16.8.3 Tamper-S Detection (EDGE)

The following conditions trigger **Tamper-S**:
- Camera offline / heartbeat loss
- Obstruction suspected (sudden dark/flat frame)
- Spray or blur suspected (edge/contrast collapse)
- Scene shift suspected (viewpoint displacement)

On Tamper-S:
- System enters **PRE-L2 (Tamper-S)**
- Strong notification is sent to owner
- Verification entry points are presented

No automatic siren or dispatch occurs at this stage.

---

### 16.8.4 User Verification Actions

Upon notification, the user MAY choose:

1. **Confirm Threat**
   - System escalates to `TRIGGER(reason=tamper_verified_by_user)`
   - Siren / collaboration MAY be initiated per user action

2. **Mark as Fault**
   - Event is labeled `tamper_outcome=fault`
   - No escalation; maintenance follow-up is suggested

3. **Ignore / Uncertain**
   - System remains in PRE-L2 temporarily, then de-escalates
   - Evidence remains local as `CANDIDATE`

---

### 16.8.5 Human-Verify Unavailable Fallback

If the Human-Verify camera cannot provide a snapshot or live view within `confirm_window_sec` (default 60s):
- System MUST notify the user that verification is unavailable
- Automatic escalation MUST NOT occur
- User MAY choose to:
  - Request neighbor assistance
  - Maintain observation
  - Manually escalate

---

### 16.8.6 No-Response Policy

If the user does not respond:
- No automatic TRIGGER is generated
- The event is marked `unresolved_tamper`
- Optional low-frequency reminders MAY be sent

Automatic siren for tamper events is disabled by default.

---

## 16.9 Siren & Light Lifecycle (Policy-driven)

### 16.9.1 Principle

On TRIGGER, NG always enters **Verify-first UX**. Siren and enhanced lighting are **secondary, policy-driven actions** that may start automatically for strong-evidence triggers, and are always user-controllable.

---

### 16.9.2 Siren Policy

Siren behavior is governed by `sirenPolicy`:

| Trigger Reason | Default sirenPolicy |
|---|---|
| `entry_delay_expired` (Door breach) | `{ auto: true, delaySec: 0 }` |
| `glass_break` | `{ auto: true, delaySec: 0 }` |
| `tamper_verified_by_user` | `{ auto: false }` |
| `tamper_suspected` / PRE-L2 | `{ auto: false }` |

`SirenPolicy` is evaluated on EDGE.

---

### 16.9.3 Siren Stop Conditions

Siren and enhanced lighting MUST stop immediately upon any of the following:

1. **Authenticated Disarm** (Keypad / App)
2. **User presses "Silence Siren"** (silence only; event remains TRIGGER)
3. **Event marked RESOLVED**

---

### 16.9.4 Automatic Siren Timeout

To reduce nuisance, an automatic timeout MAY be applied:

- `siren_max_duration_sec` (default: 180s)

After timeout:
- Siren stops
- Event remains in TRIGGER
- Verify-first UX remains available

---

### 16.9.5 PRE Deterrence Sound Stop

For PRE-L2 deterrence sounds (beep/light):

- Stop when no presence detected for `no_presence_clear_sec` (default: 60s)
- Or when user silences deterrence

PRE deterrence MUST NOT persist indefinitely.

---

## 16.10 Evidence Lifecycle & Export Workflow

### 16.10.1 Intent

PRE-L2 MUST preserve local evidence sufficient to support later TRIGGER handling (door breach, glass break, or user-confirmed tamper) while minimizing privacy exposure.

Evidence is processed and stored on **EDGE**, and exported only under explicit authorization.

---

### 16.10.2 Evidence States (EDGE)

Evidence objects follow a minimal lifecycle:

- `BUFFERING` — Rolling local buffer (not guaranteed durable)
- `CANDIDATE` — Committed on PRE-L2 entry/exit window; default non-exportable
- `RETAINED` — Promoted when a strong-evidence TRIGGER occurs or user explicitly retains
- `EXPORTED` — User-authorized export completed; referenced by `evidenceRef` / `incidentPacketId`

---

### 16.10.3 State Transitions

1. **PRE-L2 entry** → commit local window → `CANDIDATE`
2. **TRIGGER** with strong evidence (e.g., `entry_delay_expired`, `glass_break`) within correlation window → promote `CANDIDATE` → `RETAINED`
3. **User Confirm Threat** (`tamper_verified_by_user`) → promote current evidence set → `RETAINED`
4. **User Mark Fault / Ignore** → remains `CANDIDATE`
5. **TTL expiry** → `CANDIDATE` is deleted locally
6. **Authorized export** (Share/Escalate/Collab) → `RETAINED` → `EXPORTED`

Server MUST NOT directly pull raw evidence. Export is EDGE-initiated and authorization-gated.

---

### 16.10.4 Default Parameters

| Parameter | Default | Notes |
|---|---:|---|
| `pre_roll_sec` | 10s | Applied when committing PRE-L2 window |
| `post_roll_sec` | 10s | Applied when committing PRE-L2 window |
| `candidate_ttl_hours` | 24h | Auto-delete if no escalation |
| `retained_ttl_days` | 7d | Longer retention after TRIGGER/retain |
| `export_max_clip_sec` | 30s | Clip export size limit |
| `export_requires_auth` | true | Privacy gate (fixed) |

---

### 16.10.5 Export Workflow (Edge → Server)

Export MAY occur only when explicitly authorized:
- User taps Share / Escalate
- User enables Circle / Neighbor assist
- Professional dispatch is initiated

When authorized, EDGE:
1. Selects minimal evidence (snapshot/clip/packet)
2. Generates `evidenceRef` (opaque) and/or `incidentPacketId`
3. Uploads using time-limited URLs
4. Sends only references + summaries to Server

Server stores only exported evidence and references. No continuous feeds.

---

*End of Addendum §16*

