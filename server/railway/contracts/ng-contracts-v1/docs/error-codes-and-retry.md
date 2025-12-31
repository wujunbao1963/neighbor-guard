# NG Contracts v1 — Standard Error Codes & Retry Rules (Draft)

This document binds **Cloud error responses** to **Edge offline-queue behavior**.

## Unified error envelope

All non-2xx responses SHOULD use the unified error envelope.

- Schema: `schemas/error.response.schema.json`

Key fields:
- `statusCode`: integer, mirrors HTTP status.
- `error`: short HTTP-family label (e.g., `Unauthorized`, `Validation Failed`).
- `code`: stable machine code (see below).
- `message`: human-readable summary.
- `details`: optional object for structured diagnostics.
- `retryable`: optional boolean; if omitted, clients should infer from `statusCode`.
- `retryAfterSec`: optional integer; if present, client should wait at least this long.

### Retry classification (Edge)

Edge SHOULD classify outcomes into three buckets:

1) **Success** (2xx) — drop from queue.
2) **Transient failure** — keep queued and retry with exponential backoff.
3) **Permanent failure / operator action** — move to Dead Letter Queue (DLQ) and surface diagnostic.

**Default rule (if `retryable` omitted):**

- Transient: `408`, `429`, `500`, `502`, `503`, `504`.
- Permanent: all other `4xx` (except any explicitly documented as transient below).

Idempotency note:
- When Edge retries (network failure, timeout, or transient error), it MUST reuse the same `idempotencyKey`.

## Standard error codes (global)

The following codes are reserved for v1. Codes are stable across endpoints.

### Authentication / authorization
- `AUTH_MISSING` (401) — missing `Authorization` header.
- `AUTH_INVALID` (401) — malformed / invalid credential.
- `DEVICE_KEY_REVOKED` (401) — known key but revoked.
- `DEVICE_DISABLED` (403) — device exists but disabled.
- `FORBIDDEN` (403) — authenticated but not permitted.

### Routing / existence
- `CIRCLE_NOT_FOUND` (404)
- `EVENT_NOT_FOUND` (404)
- `EVIDENCE_SESSION_NOT_FOUND` (404)

### Validation
- `VALIDATION_ERROR` (422) — schema validation failed.
- `PAYLOAD_TOO_LARGE` (413)

### Idempotency / conflicts
- `IDEMPOTENCY_CONFLICT` (409) — same `idempotencyKey` but materially different payload.
- `EVENT_CONFLICT` (409) — `eventId` exists with materially different payload.
 - `DEVICE_ALREADY_PAIRED` (409) — a circle already has an active Edge device (only if you enforce 1-edge-per-circle).

### Evidence-specific
- `EVIDENCE_POLICY_BLOCKED` (412) — policy forbids archiving for this event (or forbidden zones).
- `EVIDENCE_MISSING_UPLOADS` (409) — one or more manifest items not found in object storage yet.
- `EVIDENCE_HASH_MISMATCH` (422) — integrity check failed (when supported).
- `EVIDENCE_SESSION_ALREADY_COMPLETED` (200/409) — repeated complete. Recommended: return `200` with `deduped=true`.

### Rate limiting / availability
- `RATE_LIMITED` (429)
- `SERVICE_UNAVAILABLE` (503)
- `UPSTREAM_TIMEOUT` (504)

## Endpoint matrix

The matrix below lists the **recommended** errors, and how Edge should handle them.

### 1) POST /api/circles/:circleId/edge/devices (Device Registration)

Possible non-2xx errors:
- `AUTH_MISSING` / `AUTH_INVALID` (401) — **Permanent** (fix credentials / use user auth if applicable).
- `FORBIDDEN` (403) — **Permanent**.
- `CIRCLE_NOT_FOUND` (404) — **Permanent** (bad circleId).
- `VALIDATION_ERROR` (422) — **Permanent** (client bug).
- `RATE_LIMITED` (429) — **Transient**; respect `retryAfterSec`.
- `SERVICE_UNAVAILABLE` / `UPSTREAM_TIMEOUT` (503/504) — **Transient**.

Optional (if you enforce one-edge-per-circle):
- `DEVICE_ALREADY_PAIRED` (409) — **Permanent** unless user unpairs.

### 2) POST /api/circles/:circleId/events/ingest (Event Ingest)

Non-2xx errors:
- `AUTH_*` (401) / `DEVICE_DISABLED` (403) — **Permanent**, stop queue and alert.
- `CIRCLE_NOT_FOUND` (404) — **Permanent**.
- `VALIDATION_ERROR` (422) — **Permanent** (drop + DLQ with payload snapshot).
- `IDEMPOTENCY_CONFLICT` (409) — **Permanent** (DLQ). Root cause: bug generating idempotencyKey.
- `EVENT_CONFLICT` (409) — **Permanent** (DLQ). Root cause: reused eventId with different body.
- `RATE_LIMITED` (429) — **Transient**.
- `SERVICE_UNAVAILABLE` / `UPSTREAM_TIMEOUT` (503/504) — **Transient**.

Cloud behavior recommendations:
- For duplicates (same `idempotencyKey` or same `eventId` with same body), return **200** with `accepted=true` and `deduped=true`.

### 3) POST /api/circles/:circleId/events/:eventId/evidence/upload-session

Non-2xx errors:
- `AUTH_*` (401) / `DEVICE_DISABLED` (403) — **Permanent**.
- `CIRCLE_NOT_FOUND` / `EVENT_NOT_FOUND` (404) — **Permanent**.
- `EVIDENCE_POLICY_BLOCKED` (412) — **Permanent** (do not retry; surface policy reason).
- `VALIDATION_ERROR` (422) — **Permanent**.
- `RATE_LIMITED` (429) — **Transient**.
- `SERVICE_UNAVAILABLE` / `UPSTREAM_TIMEOUT` (503/504) — **Transient**.

### 4) POST /api/circles/:circleId/events/:eventId/evidence/complete

Non-2xx errors:
- `AUTH_*` (401) / `DEVICE_DISABLED` (403) — **Permanent**.
- `CIRCLE_NOT_FOUND` / `EVENT_NOT_FOUND` / `EVIDENCE_SESSION_NOT_FOUND` (404) — **Permanent**.
- `EVIDENCE_POLICY_BLOCKED` (412) — **Permanent**.
- `VALIDATION_ERROR` (422) — **Permanent**.
- `EVIDENCE_MISSING_UPLOADS` (409) — **Transient-with-cap**:
  - retry with short backoff (e.g., 15s, 30s, 60s) up to N attempts;
  - if still failing, move to DLQ and surface `details.missingSha256s`.
- `EVIDENCE_HASH_MISMATCH` (422) — **Permanent** (DLQ; operator action).
- `RATE_LIMITED` (429) — **Transient**.
- `SERVICE_UNAVAILABLE` / `UPSTREAM_TIMEOUT` (503/504) — **Transient**.

Cloud behavior recommendation (idempotent complete):
- Repeated complete with identical body should return **200** with `deduped=true` and the same `evidenceId`.

## Minimal DLQ payload to store (Edge)

For each DLQ item, Edge SHOULD store:
- endpoint name
- `idempotencyKey` (if any)
- request body hash
- last error envelope (`code`, `message`, `details`, `requestId`)
- timestamps (`firstAttemptAt`, `lastAttemptAt`) and attempt count


## Collaboration APIs — Standard Error Codes

### GET /events, GET /events/:id
- 401 `UNAUTHENTICATED` (no)
- 403 `FORBIDDEN` (no)
- 404 `NOT_FOUND` (no)
- 408 `TIMEOUT` (yes)
- 429 `RATE_LIMITED` (yes, respect `retryAfterSec`)
- 5xx `SERVER_ERROR` (yes)

### PATCH /events/:id/status
- 401 `UNAUTHENTICATED` (no)
- 403 `FORBIDDEN` (no)
- 404 `NOT_FOUND` (no)
- 409 `EVENT_STATUS_CONFLICT` (no)
- 422 `VALIDATION_ERROR` (no)
- 408/429/5xx retryable as above.

### POST /events/:id/notes
- 401/403/404 non-retryable
- 422 `VALIDATION_ERROR` non-retryable
- 408/429/5xx retryable
