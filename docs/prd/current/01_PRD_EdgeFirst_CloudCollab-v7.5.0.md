# NeighborGuard 更新版产品 PRD（Edge-First + Cloud Collaboration）

> Aligned with NG Edge PRD v7.5.0 (Remote Verify & Incident Packet aligned).

版本：v2025.12（基于现有 Phase 1/2 实现现状 + 本 chat 决策更新）  
日期：2025-12-13

---

## 0. 本次更新的核心结论（必须对齐的产品边界）

1) **事件创建之前（传感器接入、时间窗推断、Track、Fusion 规则、严重度升级、通知级别决策）全部在本地机（Home Assistant/Edge）完成。**  
2) **服务器不再接收 raw sensor 流、不再做时间推断与 FusionEngine。服务器专注 Circle 协作、通知分发、事件账本（Timeline）与证据备档（Evidence Vault）。**  
3) **“安全第一”原则：在顾客授权下，对报警/理赔级事件自动云端备档（至少元数据，按配置可加密上传关键媒体/报告包），避免本地主机损坏/被盗导致证据丢失。**  
4) **拓扑图（TopoMap）不是精确平面图：以 Zone/连接/入口点（门窗）为核心的“拓扑结构”，默认模板化生成；可视化编辑与更精细标定（ROI→Zone）作为可选/Pro。**  
5) **手机 App 采用“单一体验、双通道路由”：在家优先直连 Edge（建图/校准/实时态势），远程走 Cloud（协作/时间线/证据库/推送），用户无感切换。**

---

## 1. 产品定位与范围

### 1.1 定位
NeighborGuard（NG）是面向北美独立屋/联排住宅的 **家庭安防协作系统**：
- 本地机负责：实时检测与推理（低时延、离线可用、隐私优先）
- 云端负责：圈内协作、跨网络访问、通知必达、证据备档与报告分享

### 1.2 目标用户
- 屋主（Owner）
- 同住人（Household）
- 非同住亲属（Relative）
- 可信邻居（Neighbor）
- 可选：临时访客/服务人员（以“白名单时段/服务画像”降低误报，后续迭代）

### 1.3 不在本次范围
- Phase 3 “多家庭/社区级联防聚合、跨家庭相关性检测”不作为当前必交付能力（保留接口扩展空间）。
- 不追求厘米级定位与精确户型建模；定位目标为 **区域级（Zone-level）准确**。

---

## 2. 核心事件体系（EventType）

> 原则：**大多数“正常信号”不建 Event**；一旦建成 Event，**进入时间线**并可协作处理；是否推送由 **House Mode × Severity → Notification Level** 决定。

### 2.1 事件分组
**A. Life Safety（生命安全）**
- `fire_detected`（烟雾）
- `co_detected`（一氧化碳）
- `water_leak_detected`（漏水）

**B. Security（安防入侵/破坏）**
- `break_in_attempt`（入侵尝试：门窗 + 室内运动等组合）
- `perimeter_damage`（周界破坏：玻璃破碎/强振动等）
- `suspicious_person`（可疑人员：私密区停留/徘徊/后院出现等）
- `suspicious_vehicle`（可疑车辆：停留过久/反复出现等）

**C. Package（包裹）**
- `package_delivered` / `package_removed`（或统一 `package_event` + subtype）

**D. Fallback（兜底）**
- `motion_detected`（仅在需要时启用，用于调试/低配场景；默认不推送）

### 2.2 严重度（Severity）
- `HIGH`：应急/报警级，默认触发 Evidence Vault（若用户授权）
- `MEDIUM`：可疑，需要结合模式/隐私级别升级
- `LOW`：记录为主

### 2.3 House Mode × Severity → Notification Level（建议在 Edge 决策）
```
House Mode × Event Severity → Notification Level

              │ HIGH 事件  │ MEDIUM 事件 │ LOW 事件
──────────────┼───────────┼────────────┼─────────
DISARMED      │ NORMAL    │ NONE       │ NONE
HOME          │ HIGH      │ NORMAL     │ NONE
AWAY          │ HIGH      │ HIGH       │ NORMAL
NIGHT         │ HIGH      │ NORMAL*    │ NONE

* 如果 nightModeHighOnly=true，则 MEDIUM 事件也为 NONE
```

---

## 3. 体系架构（Edge-First）

### 3.1 组件
**Edge（HA 主机 + NG Add-on）**
- 传感器/摄像头事件接入与标准化（SensorEvent）
- Track（时间窗聚合）与 Fusion 规则评估
- 生成 Event（含 locationHint / trackSummary / ruleId）
- 本地时间线与本地告警联动（可选）
- 离线队列：向云端同步 Event 与 EvidencePackage

**Cloud（NG Server）**
- 身份与 Circle（成员/角色/权限/通知偏好）
- Event Ledger（云端时间线账本）+ 协作（评论/状态流转/反馈）
- 通知分发（APNS/FCM 等）+ 收件人过滤
- Evidence Vault（关键事件证据备档、报告包、分享/权限控制）

**Mobile App（单一体验，双路由）**
- Edge 通道：建图/校准/局域网实时态势/设备绑定
- Cloud 通道：协作/时间线/证据库/推送打开详情

### 3.2 数据流（高层）
1) Sensors/Cameras → Edge：标准化为 SensorEvent  
2) Edge：Track + Rules → Event（并计算 Notification Level、EvidencePolicy）  
3) Edge → Cloud：EventIngest（幂等）  
4) Cloud：落 Event Ledger，按成员偏好过滤并推送  
5) 如需备档：Edge → Cloud：EvidencePackage（manifest + 可选加密媒体/报告）

---

## 4. Edge 侧 PRD（必须交付）

### 4.1 SensorEvent 标准化
Edge 将 HA entity/state/camera AI flags 归一为：
- `sensorType`（door/window/pir/glass_break/camera_ai/…）
- `zoneId`（来自用户配置：传感器→Zone/EntryPoint 绑定）
- `privacyLevel`（Zone 属性）
- `flags`（person/vehicle/loitering/intrusion/package/…）
- `occurredAt`（Edge 本地时间 + NTP 校准）

### 4.2 Track（时间窗聚合）
- 默认 `TRACK_WINDOW=120s`，`TRACK_GAP=60s`（可配置）
- 输出 `trackSummary`：zonesVisited、maxPrivacyLevel、dwellSeconds、objectTypes

### 4.3 Fusion Rules（本地执行）
- 按优先级从安全规则开始，首个命中规则决定 EventType
- 规则输入：Track 内 SensorEvents + HouseMode + Zone/Privacy
- 规则输出：EventType、Severity、NotificationLevel、RuleId、ExplainSummary（可解释摘要）

### 4.4 本地时间线与离线能力
- Edge 保留至少 7–30 天事件索引（可配置）
- 断网时仍可：检测、建 Event、本地通知/联动
- 网络恢复后：补传 Event Ledger 与 Evidence Vault（按策略）

---

## 5. Cloud 侧 PRD（裁剪后的服务器边界）

### 5.1 服务器不再负责
- 不接收 raw sensor webhook 用于推断
- 不维护 SensorEvent/Track 的推断状态机
- 不运行 FusionEngine

### 5.2 服务器必须负责
- Circle/成员/权限/通知偏好（系统的协作骨架）
- Event Ledger：保存 Edge 生成的 Event（含 trackSummary 与 explainSummary）
- 协作：状态（open/acked/resolved）、评论/备注、反馈标签
- 通知：按成员偏好 + 权限过滤后推送
- Evidence Vault：在授权策略下自动备档关键事件证据与报告包

---

## 6. Evidence Vault（安全第一的备档机制）

### 6.1 目标
在不牺牲“本地推理/隐私优先”的前提下，确保报警/理赔级事件具备：
- 抗丢失（设备损坏/被盗仍可取证）
- 可分享（圈内协作/导出报警或保险材料）
- 可审计（时间戳、哈希、权限）

### 6.2 触发策略（默认建议）
- 默认仅对 `Severity=HIGH` 自动备档
- 可配置：对 `AWAY/NIGHT` 下的特定 `MEDIUM` 事件也备档
- Zone 隐私级别控制：
  - `RESTRICTED` 默认仅上传元数据（除非显式允许加密媒体上传）

### 6.3 备档内容（最小充分）
- Event Ledger（事件元数据）
- Track Summary + Explain Summary（ruleId、关键触发依据、dwell、zonesVisited）
- Evidence Manifest（媒体哈希、时间范围、设备、类型）
- 可选：加密媒体（关键帧/短 clip）与 ReportPackage（PDF/ZIP）

---

## 7. TopoMap（拓扑建图）与安装建议

### 7.1 TopoMap 的定位
- **不追求尺寸与形状精确**；追求“拓扑结构正确”（相邻关系、入口点、可达路径）
- 目标是：
  - Zone-level 位置提示
  - 入口点（门窗/院门）级别提示
  - 安装建议（覆盖缺口/交叉验证组合）
  - 报告叙事增强（“从后门进入→侧通道→后院”）

### 7.2 默认（Standard）与 Pro
- Standard：模板生成拓扑（问卷 4–6 题），用于覆盖评分与安装建议，不强制可视化编辑
- Pro：可视化编辑 + 门窗点位层 + 摄像头 ROI→Zone + Walk Test 校准

---

## 8. App 体验与路由要求（用户无感）

### 8.1 单 App 双通道
- 在家（同局域网）：优先 Edge API（建图/校准/实时态势/本地日志）
- 远程：Cloud API（协作/时间线/证据库）
- 失败降级：Edge 不可达 → 自动切换 Cloud；Cloud 不可达 → 仅本地模式

### 8.2 鉴权模型（概念）
- Cloud：用户 JWT（登录/邀请/成员权限）
- Edge：设备配对密钥（DeviceKey），可由 Cloud 发行并绑定 Circle/Home

---

## 9. 非功能需求（软件设计要求）

- **可靠性**：Edge 推理链路在断网时仍可运行；云端仅影响协作与备档/推送
- **低时延**：Edge 从 SensorEvent 到 Event 目标 < 1–2s（取决于相机 AI 来源）
- **隐私最小化**：默认只上云事件账本 + 摘要；媒体仅在授权/高严重度策略下上传
- **安全**：证据备档支持端到端加密（Edge 加密后上传）；设备密钥可轮换
- **幂等与重试**：Edge→Cloud 上报必须支持幂等（idempotencyKey）与离线重试
- **可解释性**：Event 必须携带 ruleId + explainSummary（可用于用户理解与报告）

---

## 10. 交付物与变更要求（对齐研发）

本版本 PRD 伴随交付以下文档（同包）：
- 服务器边界与本地边界（Boundary）
- Edge↔Cloud 接口契约（Interfaces）
- Evidence Vault 规格
- TopoMap 与安装建议规格
- 迁移/裁剪计划（对现有服务器实现的删除/保留清单）