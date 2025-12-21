# NG Contracts v1 (Draft)

This folder is an **engineering-freeze draft** for the Edge↔Cloud contracts described in:
- **03_Interfaces_Edge_Cloud.md** (endpoint list + example payloads)
- **01_PRD_EdgeFirst_CloudCollab.md** (EventType/Severity/NotificationLevel)
- **04_Evidence_Vault_PRD.md** (EvidenceManifest required fields)
- **06_Software_Design_Requirements.md** (idempotency + explainSummary requirement)

## Contents

### schemas/
- `common.schema.json` — shared enums + common object fragments.
- `error.response.schema.json` — unified error envelope.
- `security.schemes.json` — OpenAPI-like security scheme definition (DeviceKeyAuth + UserJwt).
- `device.register.request.schema.json`
- `device.register.response.schema.json`
- `events.ingest.request.schema.json`
- `events.ingest.response.schema.json`
- `evidence.manifest.schema.json`
- `evidence.uploadSession.request.schema.json`
- `evidence.uploadSession.response.schema.json`
- `evidence.complete.request.schema.json`
 - `evidence.complete.response.schema.json`

### examples/
- `event-ingest/` — 5 scenario-driven examples aligned to 06_Software_Design_Requirements.md “最小场景集”.
- additional endpoint examples for device registration & evidence upload.

### docs/
- `error-codes-and-retry.md` — standard error codes, retry rules, and Edge offline-queue binding.
- `behavior-spec.md` — server stub behavioral spec (idempotency, dedupe, evidence flow).

## Validation

All examples under `examples/event-ingest/` validate against `schemas/events.ingest.request.schema.json`.

The examples `examples/evidence.*.example.json` validate against the corresponding schemas.



## Added in v1.0.1 (Draft)
- Collaboration API schemas: events.list/get/status.update/notes.create
- TopoMap schema: topomap.schema.json
- Privacy policy doc: docs/privacy-level-policy.md
