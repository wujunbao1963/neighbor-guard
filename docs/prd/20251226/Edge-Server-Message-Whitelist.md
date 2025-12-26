# Edge / Server Message Whitelist (v7.6.1-r1)

> Status: **Frozen Boundary Contract**  
> Revision: **r1 – Contract field completeness**

---

## 1. EDGE → Server (Allowed)

### 1.1 Security Summary

- eventId
- homeId
- securityState
- preLevel
- tamperLevel
- cameraTier
- triggerType
- ptzPreset (optional)
- sirenPolicy (optional)
- timestamps (coarse)

### 1.2 Collaboration

- collabState
- escalationRequest
- userNotes

---

## 2. EDGE → Server (Conditionally Allowed)

Only after explicit authorization:
- evidenceRef
- incidentPacketId

---

## 3. EDGE → Server (Forbidden)

- Raw sensor events
- Continuous video
- AI detection metadata
- Fine-grained timelines

---

## 4. Server → EDGE

- Notification routing
- Circle membership updates
- Collaboration actions

Server MUST NOT send security decisions or state transitions.

---

*End of Whitelist*

