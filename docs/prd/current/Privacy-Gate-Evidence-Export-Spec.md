# Privacy Gate & Evidence Export Spec (v7.6.1-r1)

> Scope: EDGE → Server data boundary  
> Status: **Authoritative / Privacy-Frozen**  
> Revision: **r1 – Explicit enums & contract alignment**

---

## 1. Principles (Inherited)

- EDGE is the **sole processor of raw signals**.
- Server operates on **derived, minimal summaries** only.
- Evidence leaves EDGE **only with explicit user authorization**.

---

## 2. Data Classification

### 2.1 Raw Signals (EDGE-Only)

Never leave EDGE:
- Continuous video streams
- Raw motion / AI detections
- mmWave / PIR raw readings
- Uncorrelated timestamps

### 2.2 Derived Security State (Exportable)

May be sent to Server:
- eventId
- securityState: `PRE | PENDING | TRIGGER | RESOLVED`
- preLevel: `PRE_L0 | PRE_L1 | PRE_L2`
- tamperLevel: `TAMPER_S | TAMPER_C`
- cameraTier: `TIER_0 | TIER_1 | TIER_2 | TIER_3`
- ptzPreset: `VERIFY_ENTRY | OVERVIEW` (optional)
- sirenPolicy: `{ auto, delaySec }` (optional)
- coarse timestamps (rounded)

---

## 3. Evidence Export Conditions

Evidence MAY be exported only when **any** of the following is true:
1. User explicitly taps **Share / Escalate**
2. User enables **Circle / Neighbor assist**
3. Professional dispatch is initiated

Default: **No evidence export**.

---

## 4. Evidence Forms

| Form | Description |
|---|---|
| Snapshot | Single frame |
| Clip | Short bounded clip (≤30s) |
| Incident Packet | Structured bundle |

---

## 5. Incident Packet (Minimal)

Fields:
- eventId
- entryPointId
- triggerType
- timestamps (start/end)
- evidenceRefs (URLs or hashes)
- integrityHash

No continuous feeds.

---

## 6. Retention

- EDGE retains raw evidence per local policy
- Server stores only shared evidence, time-limited

---

*End of Privacy Gate Spec*

