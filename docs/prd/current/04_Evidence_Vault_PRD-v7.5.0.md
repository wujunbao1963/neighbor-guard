# Evidence Vault PRD（报警/保险一键材料与自动备档）

> Aligned with NG Edge PRD v7.5.0 (Remote Verify & Incident Packet aligned).

版本：v2025.12  
日期：2025-12-13

---

## 1. 背景与问题

- 安防系统在“最需要证据”的时刻（入侵、破坏、火灾等），本地主机可能被断电、损坏或被盗。
- 仅本地存储会导致：报警材料/保险材料缺失，直接伤害“安全第一”的产品承诺。

因此：在用户授权下，对关键事件自动云端备档（至少元数据；可选加密媒体/报告包）。

---

## 2. 目标

- **证据抗丢失**：Edge 不可用时，Cloud 仍可访问备档材料（权限受控）
- **一键导出**：生成可提交给报警/保险的 PDF/ZIP 报告包
- **隐私最小化**：默认不上传 RESTRICTED 区域媒体；媒体上传可加密
- **可审计**：时间戳、哈希、上传记录、访问日志（可选）

---

## 3. 触发策略（Policy）

默认策略（建议）：
- `Severity=HIGH` → 自动备档（AUTO_ARCHIVE_HIGH）
- `Severity=MEDIUM` → 仅在 AWAY/NIGHT 且用户开启时备档（AUTO_ARCHIVE_MEDIUM_AWAY_NIGHT）
- `Severity=LOW` → 不备档

隐私规则：
- `PUBLIC/SEMI_PRIVATE`：允许媒体备档（按用户开关）
- `PRIVATE`：默认仅关键帧/短 clip
- `RESTRICTED`：默认仅元数据（除非显式允许端到端加密上传）

---

## 4. 备档对象（EvidencePackage）

### 4.1 必选
- Event Ledger（eventType/severity/occurredAt/zone/entryPoint/status）
- TrackSummary + ExplainSummary（ruleId、keySignals、dwell、path）
- EvidenceManifest（items：sha256、contentType、size、timeRange、deviceRef）

### 4.2 可选
- Encrypted media（image/video clip）
- ReportPackage（PDF/ZIP，包含：事件摘要、时间线、位置示意、证据列表、协作记录）

---

## 5. 用户体验

### 5.1 设置项（Home Settings → Evidence Vault）
- Enable Evidence Vault（默认关闭，首次引导解释）
- Auto-archive triggers（HIGH only / HIGH+some MEDIUM）
- Upload mode（Metadata-only / Encrypted media / Media+ReportPackage）
- Retention（30/90/365 days）
- Restricted zone policy（never / encrypted only）

### 5.2 事件详情页
- “Evidence archived” 状态
- “Generate report” 一键导出（下载或分享链接）
- 权限提示：谁能看媒体、谁只能看摘要

---

## 6. 安全要求

- 传输：TLS
- 存储：服务端加密 + 可选端到端加密（Edge 加密后上传）
- 哈希：sha256 用于完整性校验
- 访问控制：复用 CircleMember 权限（媒体权限/allowed zones）

---

## 7. 验收标准（MVP）
- HIGH 事件发生后，在网络可用条件下 X 分钟内在 Cloud 中可见“已备档”状态
- 报告包可从 App 一键生成并导出（至少包含事件摘要 + 证据 manifest）
- RESTRICTED 区域默认不上传媒体，且在 UI 中明确提示

## Evidence Types for Remote Verify (v7.5.0)
- `snapshot`: 单帧/短图，用于快速预览
- `remote_segment`: 5–10s 滚动片段，用于“类直播”拼接
- `neighbor_upload`: 协作方手机拍摄的照片/视频
- `document`: 报险/维修/警方沟通材料

Manifest item 推荐字段：`role`, `origin`, `sequenceNo`, `captureContext`（eventId/cameraId/zoneId）。
