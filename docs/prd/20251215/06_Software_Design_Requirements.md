# 软件设计要求（实现约束与工程准则）
版本：v2025.12  
日期：2025-12-13

---

## 1. 端到端一致性目标

- 事件语义一致：Edge 与 Cloud 对 EventType/Severity/NotificationLevel 的枚举必须一致
- 幂等一致：Edge 重试不导致云端重复事件
- 可解释一致：每个 Event 必带 ruleId + explainSummary（用于 UI 与报告）

---

## 2. Edge 设计要求（HA Add-on / Integration）

- 资源约束：允许在 N100/N97/树莓派5 + AI 卡等环境运行（推理依赖摄像头生态/外部 AI 时更轻）
- 时间源：NTP 校准；Event timestamp 以 Edge 为准，Cloud 记录 receivedAt
- 离线队列：EventIngest 与 EvidenceUpload 分开队列；支持 backoff 与断点续传
- 安全：deviceKey 存储加密；支持撤销与轮换
- 可观测性：本地诊断页面（最近 ingest 失败原因、队列长度、最后同步时间）

---

## 3. Cloud 设计要求（协作与存证）

- 不再包含 Fusion 推断代码路径（防止“边界漂移”）
- 事件账本不可随意重写：保留 edgeEventId、ingestAt、deviceId
- 推送必达：失败重试、退避；重要事件可二次通道（短信/电话作为未来扩展）
- Evidence Vault：大文件上传走对象存储；服务端只保存 manifest 与访问控制
- 权限：复用 CircleMember 权限模型（媒体可见性/allowed zones）

---

## 4. Mobile App 设计要求（无感双通道）

- 统一数据模型：Event/Zone/EntryPoint 在本地与云端一致
- 路由策略：
  - 同网优先 Edge（mDNS/局域网发现 + 健康检查）
  - Edge 不可达自动切换 Cloud
  - 显示“当前连接状态”但不要求用户理解网络细节
- 安全：
  - Edge 配对必须显式（扫码/一次性码）
  - 本地通道建议支持 TLS（自签证书 + pinning 或设备密钥签名）

---

## 5. 测试要求（场景驱动）

最小场景集：
- 夜间 AWAY：门磁 + 室内运动 → break_in_attempt（HIGH + 自动备档）
- 白天 DISARMED：同样组合 → 仅记录/不推送（NONE/NORMAL）
- 可疑人员：后院 PRIVATE 停留 20s → suspicious_person（MEDIUM，按模式升级）
- 包裹：package_delivered → NORMAL（仅前门相关圈内成员）
- 断网：触发 HIGH 事件 → 本地仍记录；恢复网络后云端补齐账本与备档

---

## 6. 兼容既有设计的约束
- 云端现有手工创建 Event 入口保留，但应与 ingest 模型一致（统一字段、统一权限）
- 现有 webhook 若用于 raw sensor 推断，应默认关闭或改造为 ingest-only
