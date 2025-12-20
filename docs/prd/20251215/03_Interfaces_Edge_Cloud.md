# Edge ↔ Cloud 接口契约（建议稿）
版本：v2025.12  
日期：2025-12-13

> 说明：以下为“现有 API 基础上”的增量/调整建议，目标是让服务器端只做协作与存证；Edge 侧负责推理与事件创建。

---

## 1. 设备注册与鉴权（Edge Identity）

### 1.1 设备注册（Cloud）
- `POST /api/circles/:circleId/edge/devices`
- 目的：为某个 Circle 绑定一台 Edge Agent（HA 主机）
- 返回：`deviceId`、`deviceKey`（仅显示一次）、可选 `mTLS cert` 或 `publicKey` 交换信息

**Response（示例）**
```json
{
  "deviceId": "uuid",
  "deviceKey": "base64-secret",
  "pairedAt": "2025-12-13T00:00:00Z",
  "capabilities": {
    "fusion": true,
    "evidenceUpload": true,
    "topomap": true
  }
}
```

### 1.2 Edge 上报鉴权
- `Authorization: Device <deviceKey>`（或 HMAC 签名）
- 要求：支持 key rotation；支持撤销（device disabled）

---

## 2. Event Ingest（Edge → Cloud）

### 2.1 上报事件
- `POST /api/circles/:circleId/events/ingest`
- 语义：Edge 已完成推理并创建事件，Cloud 仅落账本与触发协作/通知

**Request（示例）**
```json
{
  "idempotencyKey": "uuid-or-hash",
  "event": {
    "eventId": "uuid",
    "occurredAt": "2025-12-13T01:23:45Z",
    "eventType": "break_in_attempt",
    "severity": "HIGH",
    "notificationLevel": "HIGH",
    "status": "OPEN",
    "title": "Possible break-in attempt",
    "description": "Front door opened + indoor motion within 30s",
    "zoneId": "uuid",
    "entryPointId": "uuid",
    "locationHint": {
      "zoneId": "uuid",
      "confidence": 0.85,
      "source": ["door_contact", "pir"]
    },
    "trackSummary": {
      "trackId": "uuid",
      "windowSec": 120,
      "zonesVisited": ["FrontYard", "Porch", "IndoorEntry"],
      "maxPrivacyLevel": "RESTRICTED",
      "dwellSeconds": 35,
      "objectTypes": ["person"]
    },
    "explainSummary": {
      "ruleId": "R1_BREAKIN_DOOR_PIR",
      "keySignals": ["door_contact(front_door)", "pir(indoor_entry)"],
      "mode": "NIGHT"
    },
    "evidence": {
      "available": true,
      "policy": "AUTO_ARCHIVE_HIGH",
      "clips": [
        {"cameraId":"cam1","startOffsetSec":-10,"endOffsetSec":30}
      ]
    }
  }
}
```

**Response（示例）**
```json
{
  "accepted": true,
  "eventId": "uuid",
  "serverReceivedAt": "2025-12-13T01:23:47Z"
}
```

### 2.2 幂等规则
- Cloud 以 `idempotencyKey` 或 `eventId` 去重
- Edge 允许重试；Cloud 返回已存在也视为成功

---

## 3. Evidence Vault Upload（Edge → Cloud）

### 3.1 请求上传会话（拿 presigned urls）
- `POST /api/circles/:circleId/events/:eventId/evidence/upload-session`

**Request（示例）**
```json
{
  "manifest": {
    "items": [
      {"type":"image","sha256":"...","contentType":"image/jpeg","size":123456},
      {"type":"video","sha256":"...","contentType":"video/mp4","size":4567890}
    ],
    "encryption": {"scheme":"age","recipientPublicKey":"..."}
  }
}
```

**Response（示例）**
```json
{
  "sessionId": "uuid",
  "uploadUrls": [
    {"sha256":"...","url":"https://..."},
    {"sha256":"...","url":"https://..."}
  ]
}
```

### 3.2 完成上传并绑定
- `POST /api/circles/:circleId/events/:eventId/evidence/complete`

**Request（示例）**
```json
{
  "sessionId":"uuid",
  "manifest": { "...": "..." },
  "reportPackage": {
    "included": true,
    "type": "pdf",
    "sha256": "..."
  }
}
```

---

## 4. TopoMap 备份（可选）

- `GET /api/circles/:circleId/topomap`
- `PUT /api/circles/:circleId/topomap`（加密 blob + 版本号）
- Cloud 仅用于备份与跨端同步；Edge 仍为权威源

---

## 5. App → Edge Local API（建议）

> 仅定义语义，具体实现可通过 HA Add-on HTTP 端口或 HA WebSocket 暴露。

- `GET /local/topomap`
- `PUT /local/topomap`
- `GET /local/devices`（已发现传感器/摄像头）
- `PUT /local/bindings`（sensor→zone/entryPoint）
- `POST /local/walk-test/start` / `.../stop`
- `GET /local/events/recent`（离线时本地查看）

---

## 6. 现有 Cloud API 的调整点（摘要）

- 保留：auth、circles、members、events（list/detail/update status/notes/feedback）
- 调整：新增 ingest 路径；`POST /events` 作为 UI 手工创建仍可保留，但应与 ingest 同一模型
- 废弃/改造：`/webhooks/ha/*` 若当前用于 raw sensor 推断，应停止使用或改为“仅接收已融合事件”
