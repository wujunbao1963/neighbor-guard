# PrivacyLevel Policy (v1)

This document defines how `PrivacyLevel` affects what the Server returns and what the App is allowed to display/export.

## Levels
- `HOUSEHOLD`: Full details and media for household members (subject to per-member permissions).
- `CIRCLE`: Full details and media for circle members (default for most home security events).
- `NEIGHBORS`: Redacted details; media may be blurred/metadata-only unless explicit share action exists (future).
- `PUBLIC`: Public shareable metadata only (future).
- `PRIVATE`: Metadata-only; no media URLs, no face/plate identifiers; `trackSummary` may be omitted.

## Server response shaping
When the viewer's permission level is below `event.maxPrivacyLevel`, the Server MUST:
1) Remove media download URLs / presigned URLs.
2) Optionally replace `trackSummary` with `{ trackId, windowSec }` only.
3) Keep `eventId/occurredAt/eventType/severity/status/title` to preserve timeline coherence.

## Evidence Vault export
Evidence exports are allowed only if viewer permission >= `event.maxPrivacyLevel` and event policy permits export.
