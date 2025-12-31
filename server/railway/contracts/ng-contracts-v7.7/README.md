# NG Contracts v7.7 (Incremental)

This folder contains **incremental v7.7 schemas** used by the server during the migration from v1.

## Schemas
- `schemas/edge.eventSummaryUpsert.schema.json`

Notes:
- Step 1 uses a permissive schema (`additionalProperties: true`) as a landing zone.
- Later steps will tighten the schema and add more v7.7 endpoints.
