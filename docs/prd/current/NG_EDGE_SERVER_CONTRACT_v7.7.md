# NeighborGuard EDGE ↔ Server Contract v7.7
**Status:** Frozen for v7.x (Server-design baseline)  
**Aligned With:** NG_EDGE_PRD_v7.7, NG_EDGE_ARCHITECTURE_v7.7, NG_EDGE_DRILLS_v7.7  
**Goal:** Define the minimal, safe, testable interface between EDGE and Server.

> Core rule: **EDGE decides security state. Server coordinates people & storage.**  
> Server MUST NOT infer or override EDGE security state.

---

## 0. Scope

This contract covers:
- **Edge → Server**: event summaries, workflow updates, collaboration packets, evidence references
- **Server → Edge**: coordination inputs (verify requests, collaboration updates), and non-security configuration (optional)
- **Delivery semantics**: idempotency, retry, ordering, and versioning

Non-goals:
- Server-side security inference
- Server-originated security triggers
- Server pulling raw signals, raw video, or AI metadata

---

## 1. Data Classification & Privacy

### 1.1 Data Classes
| Class | Examples | May leave EDGE? |
|---|---|---|
| Raw signals | door_open timestamps, PIR pulses, RF, Zigbee frames | **NO** |
| Raw video / continuous stream | RTSP, HLS, full timeline export | **NO** |
| AI internals | embeddings, per-frame detections, tracker IDs | **NO** |
| Derived summaries | security state, reason codes, coarse zones | **YES** |
| Evidence references | evidenceRef, incidentPacketId | **YES (ref only)** |
| User-authorized media | exported clips/snapshots | **YES (explicit consent)** |

### 1.2 Evidence Export Rule (Hard)
Server MUST NOT request or pull evidence by default.
Evidence may be uploaded only when:
- user explicitly requests export, or
- a workflow policy explicitly says “upload incident packet on TRIGGERED” and user consent exists.

---

## 2. Versioning

All messages MUST include:
- `contractVersion`: `"ng.edge.server/1.1"` (this document)
- `edgeSpecVersion`: `"v7.7"`
- `schemaVersion`: per-message schema tag
- `edgeInstanceId`: stable identifier for the edge device
- `eventId`: stable event identifier (UUID)

Server MUST accept older minor schema versions as long as required fields exist.

---

## 3. Identity & Idempotency

### 3.1 Idempotency Keys
All Edge → Server writes MUST be idempotent using:
- `idempotencyKey = edgeInstanceId + ":" + eventId + ":" + messageType + ":" + sequence`

Server MUST treat repeated messages with same idempotencyKey as no-ops and return the same result.

### 3.2 Ordering
- Server MUST NOT assume strict ordering.
- Server MUST accept out-of-order updates and reconcile via `(eventId, sequence, timestamp)`.
- Edge SHOULD send monotonic `sequence` per `(eventId, stream)`.

---

## 4. Edge → Server Messages

### 4.1 EventSummaryUpsert (required)
**Purpose:** create/update a server-side record of an EDGE event without leaking raw signals.

**Schema tag:** `ng.edge.server.EventSummaryUpsert/1`

Minimum fields:
- `contractVersion`, `edgeSpecVersion`, `edgeInstanceId`
- `eventId`
- `createdAt`, `updatedAt`
- `mode`: `home|away|night|disarm`
- `workflowClass`: `SECURITY_HEAVY|SUSPICION_LIGHT|LOGISTICS|LIFE_SAFETY|NONE`
- `threatState`: `NONE|PRE|PENDING|TRIGGERED|RESOLVED|CANCELED`
- `triggerReason`: one of
  - `entry_delay_expired`
  - `glass_break`
  - `tamper_verified_by_user`
  - `life_safety`
  - `none`
- `entryPointId` (if applicable)
- `cameraTier` (0-3)
- `privacyLevel`: `summary_only|authorized_media`
- `evidenceStatus`: `none|candidate|retained|exported`

Constraints:
- MUST NOT include raw signal timelines.
- MUST NOT include continuous video URLs.
- If `threatState=PENDING`, MUST NOT include “accelerators” (no motion/camera escalation).

### 4.2 RemoteVerifySegmentIndex (optional, recommended)
**Purpose:** allow server/app to request small time-bounded segments for verification UX (without exposing continuous streams).

**Schema tag:** `ng.edge.server.RemoteVerifySegmentIndex/1`

Fields:
- `eventId`
- `segments`: list of `{segmentId, startTs, endTs, cameraId, kind: clip|snapshot}`
- `segmentTTLSeconds`
- `access`: `edge_signed_url|relay_ticket`
- `requiresUserConsent`: boolean

Rule:
- Segment access MUST expire.
- Segment data MUST be generated from local retained buffers.
- This is “verification UX”, not “cloud surveillance”.

### 4.3 IncidentPacketManifest (required on TRIGGERED if policy says so)
**Purpose:** summarize what media exists for an incident packet without uploading it by default.

**Schema tag:** `ng.edge.server.IncidentPacketManifest/1`

Fields:
- `eventId`
- `incidentPacketId`
- `items`: list of `{itemId, type: clip|snapshot|log, startTs, endTs, sizeBytesApprox}`
- `uploadPolicy`: `none|on_user_request|auto_after_consent`
- `hashes`: optional (sha256) for integrity

### 4.4 EvidenceUploadComplete (only after upload)
**Purpose:** confirm evidence upload finished (server storage is ready).

**Schema tag:** `ng.edge.server.EvidenceUploadComplete/1`

Fields:
- `eventId`
- `incidentPacketId`
- `objectKeys` or `evidenceRefs`
- `uploadedAt`
- `integrity`: `{sha256, sizeBytes}`

---

## 5. Server → Edge Messages

### 5.1 CollaborationUpdate (required)
**Purpose:** deliver human workflow updates (neighbors/keyholders) to EDGE for display and local decision support.

**Schema tag:** `ng.edge.server.CollaborationUpdate/1`

Fields:
- `eventId`
- `updateId` (UUID)
- `actorRole`: `owner|neighbor|keyholder|dispatcher`
- `updateType`: e.g. `ON_SCENE_NO_SIGNS|CONFIRMED_INTRUSION|FALSE_ALARM|NEED_MORE_VIDEO`
- `note` (optional, short)
- `timestamp`

Hard rule:
- CollaborationUpdate MUST NOT set or override `threatState`.
- It may influence **UX recommendations** only (e.g., “suggest remote disarm”).

### 5.2 VerifyRequest (optional)
**Purpose:** request EDGE to generate additional verification artifacts (e.g., new segment index) for the app.

**Schema tag:** `ng.edge.server.VerifyRequest/1`

Fields:
- `eventId`
- `requestId`
- `requestedArtifacts`: `[segment_index|snapshot|ptz_preset]`
- `constraints`: `{maxDurationSec, maxItems}`
- `requiresUserConsent`: boolean

Rule:
- VerifyRequest is advisory; EDGE may refuse based on privacy or load.

### 5.3 Non-Security Config (optional)
**Purpose:** deliver user-approved config changes that do not change frozen semantics.

Examples:
- notification routing
- camera labels
- collaboration list

Hard rule:
- Server MUST NOT push changes that alter:
  - allowed trigger sources
  - PENDING semantics
  - soft-signal authority
These require an EDGE firmware/spec major update.

---

## 6. Delivery Semantics

### 6.1 Retry & Backoff
- Edge MUST retry on network failures with exponential backoff.
- Server MUST return retryable vs non-retryable errors explicitly.

### 6.2 Exactly-once (practical)
We implement “exactly-once effect” via:
- idempotencyKey
- upsert semantics
- monotonic sequence per stream

### 6.3 Offline Behavior
- Edge queues outbound messages locally.
- On reconnection, Edge replays buffered upserts in order of `(eventId, sequence)`.
- Server must handle duplicates and out-of-order arrivals.

---

## 7. Security Requirements

- All messages must be authenticated (mTLS or signed JWT bound to edgeInstanceId).
- Rate limits per edgeInstanceId.
- Server must not accept messages missing contractVersion/edgeSpecVersion.
- PII minimization: no faces, no raw audio, no continuous location history.

---

## 8. Test Hooks (What to Validate in Integration)

Minimum integration test cases:
1. EventSummaryUpsert idempotency (replay same message 3x)
2. Out-of-order updates (sequence 5 arrives before 4)
3. TRIGGERED creates IncidentPacketManifest but does not auto-upload unless consent/policy
4. CollaborationUpdate does not alter threatState
5. Segment index TTL expiry and re-request behavior

---

## 9. Change Control

v7.7 contract is frozen. Any change to:
- message classes
- allowed trigger sources
- evidence export policy
requires `contractVersion` bump and/or `edgeSpecVersion` major bump (v8.0).

---

**End of NG_EDGE_SERVER_CONTRACT_v7.7**
