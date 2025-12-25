# Implementation Notes (v7.6.1-r1)

> Audience: EDGE / Server engineers  
> Revision: **r1 – Timer completeness & PRD alignment**

---

## 1. Authoritative Logic Placement

All of the following run on EDGE:
- PRE / PENDING / TRIGGER state machine
- Tamper-S / Tamper-C OR evaluation
- Siren fallback timers
- PTZ preset invocation

Server performs **no security inference**.

---

## 2. Timers & Scheduling

| Timer | Location | Default |
|---|---|---|
| entry_delay_sec | EDGE | 30s |
| offline_confirm_sec | EDGE | 90s |
| tamper_c_siren_delay_sec | EDGE | 120s |
| correlation_window_sec | EDGE | 10s |
| pre_l1_dwell_threshold_sec | EDGE | 10s |
| pre_l2_dwell_threshold_sec | EDGE | 30s |

All timers are authoritative on EDGE and MUST NOT be overridden by Server input.

---

## 3. Feature Flags

- follower_accel_enabled (default: false, deprecated)
- ptz_auto_move_pre_l2 (default: true)

Feature flags MUST NOT bypass frozen PRD rules.

---

## 4. Failure Handling

- Server offline → EDGE continues fully
- Camera offline → Tamper-S logic
- Dual camera offline (shared domain) → no Tamper-C

---

## 5. Storage

- Raw evidence stored locally on EDGE
- EvidenceRefs are opaque tokens only

---

*End of Implementation Notes*

