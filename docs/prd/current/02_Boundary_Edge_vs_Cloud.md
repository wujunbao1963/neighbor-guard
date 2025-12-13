# Edge vs Cloud 边界定义（Server/Local 边界）
版本：v2025.12  
日期：2025-12-13

---

## 1. 总原则

- **Edge 是“安全功能的权威源（source of truth）”**：传感器接入、融合推理、事件生成、通知级别决策、离线运行。  
- **Cloud 是“协作与证据的权威源”**：身份/圈子/权限、通知分发、时间线账本、证据备档与分享。

---

## 2. Edge（HA 主机）必须包含的能力

### 2.1 数据接入与归一化
- 从 HA 读取实体状态变化、相机 AI 标志（或来自摄像头生态的事件）
- 归一化为 SensorEvent（带 zone/entryPoint 语义）

### 2.2 推理与事件创建
- Track（时间窗聚合、dwell、路径）
- Fusion rules（按优先级、模式、隐私级别）
- 输出 Event（含 ruleId、explainSummary、trackSummary、locationHint）

### 2.3 本地可用性
- 断网仍可：建 Event、局域网通知/联动、本地时间线查看（至少基本列表）
- 离线队列：EventIngest 与 EvidenceUpload 的重试

### 2.4 配置与校准
- 传感器/摄像头 → Zone/EntryPoint 绑定
- TopoMap（模板/编辑）与 Walk Test 校准（Pro）

---

## 3. Cloud（服务器）必须包含的能力

### 3.1 身份与 Circle
- OTP/JWT 登录
- Circle 创建、邀请、成员角色与权限矩阵
- 成员通知偏好（notifyOnHigh/Medium/Low、媒体权限、allowedMediaZones）

### 3.2 协作与时间线账本
- Event Ledger：保存 Edge 生成事件（不可篡改的账本语义）
- 协作字段：status、notes、resolution、feedback
- 查询与分页：timeline、未处理事件、按类型筛选

### 3.3 通知分发
- 接收 EventIngest 后按规则过滤收件人并推送（APNS/FCM）
- 推送 payload 以 eventId/circleId 为主，避免携带敏感媒体

### 3.4 Evidence Vault
- 保存 EvidenceManifest（哈希、时间范围、设备、类型）
- 可选保存加密媒体/报告包
- 权限控制与可分享（可选：临时链接/一次性访问）

---

## 4. Cloud 必须移除/禁用的能力（本次裁剪）

- raw sensor webhook → FusionEngine（禁用）
- Track/SensorEvent 的云端推断状态机（不再生成）
- 任何基于云端时间窗的“二次推断”（除非 Phase 3 明确重新引入）

---

## 5. 数据权威与冲突策略（避免同步地狱）

- **TopoMap/Zone 结构**：Edge 权威；Cloud 仅备份（可选）  
- **House Mode**：Edge 权威（确保离线）；Cloud 可存“最近状态”用于协作显示  
- **Event 创建**：Edge 权威；Cloud 仅落账本 + 协作字段  
- **Event 协作状态**：Cloud 权威；Edge 可拉取并缓存，用于本地显示一致性

---

## 6. 两种运行模式（产品层面）

1) **Connected Mode（推荐）**  
Edge 推理 + Cloud 协作/推送/备档，完整价值闭环。

2) **Local-Only Mode（可选）**  
无云端登录与协作，仅本地推理与本地联动；不保证远程推送与证据备档。
