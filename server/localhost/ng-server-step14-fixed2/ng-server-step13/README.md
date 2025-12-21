# NG Server - Step 10.6 (Evidence Complete Contract Fix)

Step 10 keeps **app-side identity + authorization** (JWT), **Circle membership** APIs, and **Edge DeviceKey** auth for ingest/evidence upload.

This package contains:

1) an **evidence DB alignment hotfix** for persistent Railway Postgres databases that may have:

- `ng_evidence_sessions.manifest_hash` as **NOT NULL**
- `ng_evidence_items.circle_id` / `event_id` / `object_key` / `time_range_start_at` / `device_ref_kind` as **NOT NULL**
- plus legacy JSONB columns (`time_range`, `device_ref`) which may be NULL or missing
- `ng_event_evidence.status` (instead of `evidence_status`)

2) a **contract fix**: `POST .../evidence/complete` now returns `warnings` as an array of objects `{ code, message, itemSha256? }` per schema.

## What changed in Step 9

### New endpoints (dev/local)

- `POST /api/auth/dev/login` → create/update a user and return a JWT
- `POST /api/circles` → create a circle (caller becomes `owner`)

### Existing endpoints now require Bearer JWT

- `POST /api/circles/:circleId/edge/devices` (device registration)
- `GET /api/circles/:circleId/events` (list)
- `GET /api/circles/:circleId/events/:eventId` (detail)
- `PATCH /api/circles/:circleId/events/:eventId/status`
- `POST /api/circles/:circleId/events/:eventId/notes`
- `GET /api/circles/:circleId/events/:eventId/evidence`
- `POST /api/circles/:circleId/events/:eventId/evidence/items/:sha256/download-url`

### Edge-auth endpoints (unchanged)

- `POST /api/circles/:circleId/events/ingest` (`Authorization: Device <deviceKey>`)
- `POST /api/circles/:circleId/events/:eventId/evidence/upload-session` (`Authorization: Device <deviceKey>`)
- `POST /api/circles/:circleId/events/:eventId/evidence/complete` (`Authorization: Device <deviceKey>`)

## Setup (Ubuntu)

```bash
unzip ng-server-step10.6.zip
cd ng-server-step10.6

cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` = your Railway Postgres URL
- `DB_SSL=true`
- `DB_SSL_REJECT_UNAUTHORIZED=false` (dev-only workaround if you hit TLS chain issues)
- `DEVICE_KEY_PEPPER=dev-pepper` (change for production)
- `JWT_SECRET=dev-jwt-secret` (change for production)

## Install deps

```bash
npm install
```

## Run migrations + tests

```bash
npm run test:e2e
```

## Run the server

```bash
npm run start:dev
```

## Quick smoke test (curl)

### 1) Dev login → JWT

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/dev/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","displayName":"Alice"}' | jq -r .accessToken)
```

### 2) Create a circle

```bash
CIRCLE_ID=$(curl -s -X POST http://localhost:3000/api/circles \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Home"}' | jq -r .circleId)
```

### 3) Register an Edge device (gets DeviceKey)

```bash
DEVICE_KEY=$(curl -s -X POST http://localhost:3000/api/circles/$CIRCLE_ID/edge/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deviceName":"EDGE-1","platform":"ha","capabilities":{"fusion":true,"evidenceUpload":true,"topomap":false}}' \
  | jq -r .deviceKey)
```

### 4) Ingest an event (DeviceKey)

```bash
curl -X POST http://localhost:3000/api/circles/$CIRCLE_ID/events/ingest \
  -H "Authorization: Device $DEVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"idempotencyKey":"demo-1","event":{"eventId":"00000000-0000-4000-8000-000000000001","title":"Test","eventType":"SUSPICIOUS_PERSON","severity":"MEDIUM","notificationLevel":"record","occurredAt":"2025-12-19T00:00:00Z","explainSummary":"demo","keySignals":{},"zonesVisited":[],"raw":{}}}'
```

### 5) List events (Bearer JWT)

```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/circles/$CIRCLE_ID/events?limit=50"
```
