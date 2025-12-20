# 现有实现的裁剪与迁移计划（从“云推断”到“Edge 推断”）
版本：v2025.12  
日期：2025-12-13

---

## 1. 现状假设（来自已上传设计）
- Cloud 侧已有：Auth/Circle/Member/Event/Home/Zone/Sensor 的 API 与数据模型
- Phase 2 设计中包含：Webhook→SensorEvent→Track→FusionEngine→Event 的云端路径
- 通知矩阵与成员偏好已在 Cloud 侧具备实现基础

---

## 2. 需要“删除/禁用”的服务器能力

1) raw sensor webhook 推断链路  
- 停止使用 `/webhooks/ha/*` 作为 raw sensor 输入（若当前存在）
- 删除或永久关闭：云端 Track 聚合、FusionEngine 规则评估

2) 云端写入 SensorEvent/Track 的代码路径  
- 数据表可短期保留（兼容迁移），但不再写入/不再作为业务依赖

---

## 3. 需要“保留/加强”的服务器能力

- Circle/成员/权限/通知偏好（不变）
- Event 列表/详情/状态更新/评论/反馈（不变）
- 通知分发（加强稳定性与可观测性）
- Evidence Vault（新增）
- Edge Device Registry（新增：device 绑定与密钥）

---

## 4. 新增接口（最小集）

- `POST /circles/:circleId/edge/devices`（配对）
- `POST /circles/:circleId/events/ingest`（Edge 上报事件）
- Evidence Vault upload-session/complete（对象存储上传）

---

## 5. 前端/移动端影响（必须提前规划）

- Timeline 与详情页以 Cloud Event Ledger 为主（协作一致）
- 本地（Edge）提供：建图/校准/Walk Test/离线事件列表
- 同一事件在 Edge 与 Cloud 的 ID 对齐（edgeEventId=eventId），避免映射复杂度

---

## 6. 逐步迁移策略（建议）

Phase A（最快跑通闭环）
- Edge 仅生成 Event（无媒体上传）
- Cloud 仅落账本 + 推送 + 协作

Phase B（安全第一）
- 引入 Evidence Vault：HIGH 自动备档（metadata + 可选媒体）
- 报告包导出

Phase C（体验增强）
- TopoMap Pro：可视化编辑 + ROI→Zone + 安装建议
