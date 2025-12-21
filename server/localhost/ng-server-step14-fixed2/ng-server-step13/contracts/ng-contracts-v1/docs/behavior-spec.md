# NG Contracts v1 — Cloud Stub Behavior Spec (Draft)

This document defines **server-side behavioral requirements** for the v1 contracts in `schemas/`.
It is intended to be implementable as a minimal **Cloud Stub** while keeping the Edge offline-queue safe and deterministic.

Normative keywords: **MUST**, **SHOULD**, **MAY**.

## 0) Common conventions

### 0.1 Content types
- Requests with a body MUST set `Content-Type: application/json`.
- Responses SHOULD be `application/json`.

### 0.2 Request correlation
Cloud SHOULD return a `requestId` in the error envelope when available.
Cloud MAY also return an `NG-Request-Id` header (optional).

### 0.3 Unified error envelope
All non-2xx responses SHOULD use:
- Schema: `schemas/error.response.schema.json`

Retry guidance is defined in `docs/error-codes-and-retry.md`.

### 0.4 Time semantics
- `event.occurredAt` is **Edge-authoritative** and MUST NOT be rewritten by Cloud.
- Cloud SHOULD record `serverReceivedAt` (ingest time) for observability and troubleshooting.
- Timeline ordering in Cloud UI SHOULD use `occurredAt` as primary, `serverReceivedAt` as tie-breaker.

### 0.5 “Materially different” payload
For idempotency/conflict checks, Cloud SHOULD consider a payload “materially different” if any of these change:
- `event.eventType`, `event.severity`, `event.notificationLevel`, `event.status`
- `event.occurredAt`, `event.title`
- `event.zoneId`, `event.entryPointId`
- `event.explainSummary.ruleId` or `event.explainSummary.keySignals`

Cloud MAY ignore changes in `event.description` for conflict detection (optional), but MUST be consistent.

---

## 1) Authentication & authorization

### 1.1 Schemes
- **UserJwt**: used by App / setup flows (pairing).
- **DeviceKeyAuth** (`Authorization: Device <deviceKey>`): used by Edge for ingest and evidence upload flows.

Security scheme definitions: `schemas/security.schemes.json`.

### 1.2 Standard auth errors
- Missing auth header → `401 AUTH_MISSING`
- Invalid credential → `401 AUTH_INVALID`
- Revoked device key → `401 DEVICE_KEY_REVOKED`
- Device disabled / blocked → `403 DEVICE_DISABLED` (or `403 FORBIDDEN`)

---

## 2) POST /api/circles/:circleId/edge/devices — Device Registration (pair Edge)

Schemas:
- Request: `schemas/device.register.request.schema.json`
- Response: `schemas/device.register.response.schema.json`

### 2.1 Authorization
- Cloud SHOULD require **UserJwt** (a permitted circle member) to create/pair a device.
- Cloud MAY allow a one-time pairing code flow; if so, it is out of scope for v1 contracts.

### 2.2 Behavior
On success, Cloud MUST:
1) Create a new device identity (`deviceId`) bound to `circleId`.
2) Generate a `deviceKey` (secret) and return it **in this response**.
3) Persist `capabilities` as last-reported capabilities for the device.

### 2.3 One-edge-per-circle policy (optional)
If you enforce “one active Edge per circle”, Cloud SHOULD:
- If an active device already exists → `409 DEVICE_ALREADY_PAIRED` (Permanent).

### 2.4 Idempotency (recommended)
Device registration is naturally sensitive because `deviceKey` is a secret.
For MVP Cloud Stub, the simplest acceptable behavior is:
- If the server detects a duplicate pairing attempt (same user + same `haInstanceId` within the same circle), it MAY return `200` with the existing `deviceId` and **a newly rotated `deviceKey`**, and mark the old key as revoked.

If you need strict idempotency, add an explicit idempotency mechanism in v1.1 (e.g., `Idempotency-Key` header).

---

## 3) POST /api/circles/:circleId/events/ingest — Event Ingest (Edge → Cloud)

Schemas:
- Request: `schemas/events.ingest.request.schema.json`
- Response: `schemas/events.ingest.response.schema.json`

### 3.1 Authorization
- Cloud MUST require **DeviceKeyAuth**.

### 3.2 Validation
Cloud MUST validate the request against the schema.
- On schema failure → `422 VALIDATION_ERROR` (Permanent; send to DLQ).

### 3.3 Idempotency & de-duplication (MUST)
Inputs:
- `idempotencyKey` (required)
- `event.eventId` (required)

Cloud MUST implement safe retry semantics:
- Primary dedupe key: `(deviceId, idempotencyKey)`
- Secondary dedupe key: `(circleId, eventId)` (or globally unique `eventId`)

Rules:
1) If `(deviceId, idempotencyKey)` has been seen with the **same** payload:
   - Return `200` with the original `eventId` and `deduped=true`.
2) If `(deviceId, idempotencyKey)` has been seen with a **materially different** payload:
   - Return `409 IDEMPOTENCY_CONFLICT` (Permanent; DLQ).
3) If `eventId` already exists with the **same** payload:
   - Return `200` with `deduped=true`.
4) If `eventId` already exists with a **materially different** payload:
   - Return `409 EVENT_CONFLICT` (Permanent; DLQ).

### 3.4 Storage effects
On first acceptance (non-deduped), Cloud SHOULD:
- Persist the event record for the circle timeline.
- Persist the **raw ingested payload** (or a hash) for audit/debug.
- Record `serverReceivedAt` as ingestion timestamp.

Cloud MUST NOT re-run Fusion/Track inference; it stores what Edge decided.

### 3.5 Response behavior
- Always return `accepted=true` on success (including deduped cases).
- `serverReceivedAt` SHOULD reflect the time the server processed this request.

### 3.6 Rate limiting & transient failures
- If rate-limited → `429 RATE_LIMITED` with `retryAfterSec`.
- Transient upstream/storage issues → `503 SERVICE_UNAVAILABLE` or `504 UPSTREAM_TIMEOUT`.
Edge retry rules: see `docs/error-codes-and-retry.md`.

---

## 4) POST /api/circles/:circleId/events/:eventId/evidence/upload-session — Evidence Upload Session

Schemas:
- Request: `schemas/evidence.uploadSession.request.schema.json`
- Response: `schemas/evidence.uploadSession.response.schema.json`
- Manifest: `schemas/evidence.manifest.schema.json`

### 4.1 Authorization
- Cloud MUST require **DeviceKeyAuth**.

### 4.2 Preconditions
Cloud SHOULD verify:
- `circleId` exists; else `404 CIRCLE_NOT_FOUND`.
- `eventId` exists; else `404 EVENT_NOT_FOUND`.

Policy gate (recommended for MVP):
- If evidence archiving is not allowed by policy (e.g., wrong severity / forbidden zones):
  - Return `412 EVIDENCE_POLICY_BLOCKED` (Permanent).

### 4.3 Behavior
Cloud MUST:
1) Validate the `manifest` schema.
2) Create an evidence upload session: `sessionId`.
3) Return `uploadUrls[]` matching the manifest item count.

Implementation notes (non-normative):
- `uploadUrls[i]` may be a presigned PUT URL to object storage.
- The server should keep a mapping of `(sessionId → expected object keys + sha256 + size)` for completion checks.

### 4.4 Retry behavior
For MVP Cloud Stub, upload-session MAY be non-idempotent (new session per call).
If it is non-idempotent:
- Edge SHOULD persist `sessionId` immediately once received.
- Orphan sessions/objects are acceptable and can be garbage-collected later.

---

## 5) POST /api/circles/:circleId/events/:eventId/evidence/complete — Evidence Complete

Schemas:
- Request: `schemas/evidence.complete.request.schema.json`
- Response: `schemas/evidence.complete.response.schema.json`

### 5.1 Authorization
- Cloud MUST require **DeviceKeyAuth**.

### 5.2 Preconditions
Cloud MUST verify:
- `eventId` exists; else `404 EVENT_NOT_FOUND`.
- `sessionId` exists; else `404 EVIDENCE_SESSION_NOT_FOUND`.

### 5.3 Completion checks
Cloud SHOULD perform these checks:
1) All manifest items exist in object storage (HEAD by object key).
   - If any are missing → `409 EVIDENCE_MISSING_UPLOADS` with `details.missing[]`.
   - This is **Transient-with-cap**: Edge retries up to N times then DLQ.
2) (Optional) If hash verification is supported, verify `sha256`.
   - On mismatch → `422 EVIDENCE_HASH_MISMATCH` (Permanent; DLQ).

### 5.4 Idempotency (MUST)
Evidence completion MUST be safe to retry:
- If the same `sessionId` has already been completed successfully:
  - Return `200` with the same `evidenceId` and `deduped=true`.
  - `evidenceStatus` SHOULD be stable (e.g., `ARCHIVED`).

### 5.5 Status model (MVP recommendation)
For MVP Cloud Stub, you can implement a synchronous “archived” outcome:
- On success: `evidenceStatus="ARCHIVED"`, set `archivedAt`.
- If you later add async verification, extend with `VERIFYING` (backward-compatible).

### 5.6 Response requirements
On success, Cloud MUST return:
- `accepted=true`
- `eventId`, `sessionId`, `evidenceId`
- `evidenceStatus`
- `completedAt`
- `manifest` (canonical manifest stored by the server)

Cloud SHOULD include:
- `archivedAt` when status is `ARCHIVED`
- `deduped=true` when returning an idempotent replay

---

## 6) Edge Offline Queue binding (implementation guidance)

Edge SHOULD treat the following endpoints as queueable operations:
- `events/ingest`
- `evidence/complete`
- (optionally) `evidence/upload-session` if you need fully offline capture

Edge queue item MUST persist:
- `endpoint`, `method`, `idempotencyKey` (where applicable), `payload`, `createdAt`
- `attemptCount`, `lastErrorCode`, `nextRetryAt`

Outcome buckets:
- 2xx → drop
- Transient (`408/429/5xx` and any explicitly transient codes) → retry with exponential backoff
- Permanent (most `4xx`, including `VALIDATION_ERROR`, `*_CONFLICT`) → DLQ + surface operator action

See `docs/error-codes-and-retry.md` for the authoritative matrix.

## Collaboration APIs (Cloud → App) — v1

These APIs govern human collaboration (ACK/RESOLVE and notes). They are **Cloud-authoritative** and MUST NOT be implemented on Edge.

### GET /api/circles/:circleId/events
- Purpose: list events for timeline.
- Ordering: `occurredAt` descending (Edge time); tie-breaker by `serverReceivedAt` descending.
- Response: `events.list.response.schema.json`
- Retry:
  - `408/429/5xx` retryable.
  - `401/403/404/422` non-retryable.

### GET /api/circles/:circleId/events/:eventId
- Purpose: fetch full event detail (including `trackSummary`, `explainSummary`, evidence status, notes).
- Response: `events.get.response.schema.json`
- Shaping: apply `PrivacyLevel` policy (see `privacy-level-policy.md`).

### PATCH /api/circles/:circleId/events/:eventId/status
- Allowed transitions:
  - `OPEN → ACKED → RESOLVED`
  - `OPEN → RESOLVED` is allowed for authorized roles (owner/creator).
  - Repeating the same status is idempotent (`deduped=true`).
- Request/Response: `events.status.update.*.schema.json`
- Concurrency:
  - If `status` is behind the current state (e.g. trying to set `OPEN` after `ACKED`), return `409 EVENT_STATUS_CONFLICT` (non-retryable).
- Retry:
  - `408/429/5xx` retryable; others non-retryable.

### POST /api/circles/:circleId/events/:eventId/notes
- Purpose: add a human note.
- Request/Response: `events.notes.create.*.schema.json`
- Idempotency:
  - If `clientNoteId` is provided and already exists for this event, return the existing note with `created=true` and `deduped=true` (optional extension).
- Retry:
  - `408/429/5xx` retryable.
  - `422 VALIDATION_ERROR` non-retryable.

## Field-level behaviors added in v1.0.1

### haInstanceId
- Sent during device registration.
- Should be stable per Home Assistant instance. Prefer HA `instance_id` (UUID), but other stable identifiers are accepted.

### explainSummary.keySignals
- Type: array of `KeySignal` objects.
- Rationale: structured signals allow the App to render consistent explanations and allow rule analytics.

### trackSummary.zonesVisited
- Type: array of `ZoneRef` objects.
- For MVP, `zoneName` is sufficient; `zoneId` becomes mandatory when TopoMap is enforced.

### event.alarmState
- Optional but recommended for keypad/alarm integrations.
- Must represent alarm system state at `occurredAt`.

### event.localDisarm
- Optional.
- True if the incident was disarmed on Edge shortly after detection; Server may downgrade notification in future policies but MUST preserve the event record.
