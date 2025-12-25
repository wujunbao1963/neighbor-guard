# NeighborGuard EDGE PRD v7.6.1 (Consolidated)

> Status: **Consolidated / Architecture-Frozen**  
> Supersedes: v7.5.x  
> Nature: **Inheritance + Clarification (No semantic rollback)**

---

## 0. Purpose & Scope

This document is the **authoritative, consolidated PRD** for NeighborGuard EDGE v7.6.1.

It explicitly:
- **Inherits all non-conflicting principles and constraints from v7.5**
- **Clarifies and tightens behaviors introduced or debated in v7.6**
- **Freezes semantics** to prevent regression or reinterpretation in future versions

Reading this document alone is sufficient to understand the system.

---

## 1. Non-Negotiable System Principles (Inherited from v7.5)

The following principles are **permanent unless a major-version reset occurs**.

### 1.1 Edge-Authoritative Security
- All raw signals, detections, correlations, and state transitions occur on **EDGE**.
- EDGE is the **single source of truth** for security state.
- Server MUST NOT infer, recompute, or override security decisions.

### 1.2 Privacy-First Signal Handling
- Raw signals, continuous video, and unapproved evidence MUST NOT leave EDGE.
- Server receives **derived summaries only**, unless explicit authorization is given.

### 1.3 Evidence-Based Alarms
- Alarms require **strong physical evidence**, not inference.
- Presence, loitering, or AI-only judgments MUST NOT directly trigger alarms.

### 1.4 Human-in-the-Loop Escalation
- Users always retain final authority to escalate, silence, or collaborate.
- Automation assists; it does not replace human judgment.

---

## 2. System State Model (Frozen)

### 2.1 States
- **PRE** – Deterrence & Observe
- **PENDING** – Entry Delay (door-open only)
- **TRIGGER** – Evidence-based alarm
- **RESOLVED** – Event closed

> Presence-based or camera-derived signals MUST NOT advance the system into PENDING or TRIGGER.

---

## 3. PRE (Deterrence & Observe)

PRE is a **non-alarming awareness state** whose goal is to deter intrusion and enable verification.

### 3.1 PRE Levels (Final)

| Level | Typical Cause | Default Behavior |
|---|---|---|
| PRE-L0 | Low-confidence / pass-by | Silent logging |
| PRE-L1 | Short presence (< `pre_l1_dwell_threshold_sec`) | Steady light, optional silent notify |
| PRE-L2 | Sustained presence (≥ `pre_l2_dwell_threshold_sec`), near entry, or Tamper-S | Enhanced light + 1Hz beep, strong notify, one-tap Live |

> PRE does **not** escalate to PENDING under any circumstance.

### 3.2 PRE Constraints
- No siren
- No dispatch
- No forced user action
- Live View MUST always be available

---

## 4. PENDING (Entry Delay)

### 4.1 Scope (Inherited Constraint)

PENDING exists **only** to support traditional entry workflows.

- Triggered exclusively by **door contact open**
- Active only in **Away / Night** modes
- Default duration: `entry_delay_sec` (30s)

### 4.2 Outcomes
- Authenticated disarm → Normal entry → PRE/Home
- Timeout → TRIGGER (reason: `entry_delay_expired`)

No other signal may create or accelerate PENDING.

---

## 5. TRIGGER (Alarm)

### 5.1 Valid Trigger Sources (MVP, Frozen)

| Source | Notes |
|---|---|
| Door contact + PENDING timeout | Primary entry breach |
| Glass break (high-confidence) | Immediate |
| Tamper-C (confirmed) | Tier-gated |

Attempt, vibration, and follower acceleration are **non-authoritative**.

---

## 6. Verify-First User Experience

Upon entering TRIGGER:
1. Live video opens immediately
2. Trigger cause is shown explicitly
3. Secondary camera offered if available
4. Siren / collaboration are **secondary, deliberate actions**

---

## 7. Camera Capability Tiers (Inherited + Clarified)

| Tier | Deployment | Guarantees |
|---|---|---|
| Tier-0 | No cameras | No Tamper-C |
| Tier-1 | Single camera | Tamper-S only |
| Tier-2 | Dual cameras | Tamper-C supported |
| Tier-3 | Dual cameras, independent failure domains | High-confidence Tamper-C |

Camera Tier MUST be visible in UI and included in event summaries.

---

## 8. Tamper Model (Final)

### 8.1 Tamper-S (Suspected)

Examples:
- Single camera offline
- Short stream interruption

Behavior:
- PRE-L2
- Strong notification
- Video verification

### 8.2 Tamper-C (Confirmed)

Requires **visual corroboration** (any one of):
1. Dual camera offline ≥ `offline_confirm_sec` (independent domains only)
2. Single camera offline + second camera detects obstruction / spray / hand
3. Camera offline + door contact open (within `correlation_window_sec`)
4. Camera offline + glass break (within `correlation_window_sec`)

Tier-0 / Tier-1 MUST NOT escalate to Tamper-C.

---

## 9. Shared Failure Domains

- Cameras sharing power, PoE, or network are a single failure domain.
- Default assumption: **shared**, unless explicitly marked independent.
- Dual-offline in shared domain → Tamper-S only.

---

## 10. Siren / Beep / Light Policy (Frozen)

### 10.1 PRE
- Beep / light = deterrence only
- Volume below nuisance threshold

### 10.2 Trigger Fallback

| Trigger Source | Auto Siren |
|---|---|
| Door breach | Yes |
| Glass break | Yes |
| Tamper-C only | Default No |

Optional delayed siren for Tamper-C: `tamper_c_siren_delay_sec` (120s).

---

## 11. PTZ Cameras (Clarified)

### 11.1 Role

PTZ cameras are **verification amplifiers**, not detection sources.

> A PTZ camera MUST NOT be the sole camera covering an entry point.

### 11.2 Verification Presets

Standard presets:
- `VERIFY_ENTRY` (required)
- `OVERVIEW` (optional)

Automatic movement:
- Tamper-S → move `VERIFY_ENTRY`
- PRE-L2 → optional move `VERIFY_ENTRY`
- User Live View → hold position

PTZ movement MUST NOT affect trigger logic.

---

## 12. Modes (Inherited)

| Mode | Behavior |
|---|---|
| Home | No PENDING, normal activity |
| Away | Full security |
| Night | Perimeter-focused |
| Disarm | PRE disabled; core evidence remains |

---

## 13. LOGISTICS Channel (Inherited Separation)

LOGISTICS (package delivery) is handled separately:
- State: DETECTED → NOTIFIED → HANDLED
- No interaction with PRE / PENDING / TRIGGER
- Shares verification UI and collaboration tools only

LOGISTICS MUST NOT contaminate SECURITY state.

---

## 14. Explicit Non-Goals (Frozen)

- No alarm on presence alone
- No vibration-only triggers
- No server-side security inference
- No automatic PTZ patrols

---

## Appendix A. Default Parameters

| Parameter | Default |
|---|---|
| offline_confirm_sec | 90s |
| correlation_window_sec | 10s |
| entry_delay_sec | 30s |
| tamper_c_siren_delay_sec | 120s |
| pre_l1_dwell_threshold_sec | 10s |
| pre_l2_dwell_threshold_sec | 30s |

---

*End of Consolidated PRD*
