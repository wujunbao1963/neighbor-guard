# NeighborGuard Edge PRD v7.4.2 Integrated (Edge + Gateway Stub)
## 单一真相文档 (Single Source of Truth)

**Version:** 2025-12-16-v7.4.2-EDGE-INTEGRATED  
**Status:** RELEASE  
**Last Updated:** 2025-12-16  
**Normative:** 本文档为 v7.4.2 唯一权威规范（含 Gateway Contract Stub 约束）  

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v7.0 | 2025-12-16 | 专业安防对标版 |
| v7.1 | 2025-12-16 | Mode 统一、AVS 两段式 |
| v7.2 | 2025-12-16 | 契约闭合: Evidence, EventDisposition |
| v7.2.1 | 2025-12-16 | Dispatch 决策树、Verification 建模 |
| v7.2.2 | 2025-12-16 | DCV 终止、delay=0、并发处理 |
| **v7.2.2-FINAL** | 2025-12-16 | **P0 修复: AVS cancellation、wire format、timer transition** |
| **v7.3.0** | 2025-12-16 | Integrated：Heavy/Light、Night 双轨、Dispatch Readiness、Gateway Stub、Edge Export |
| **v7.3.4** | 2025-12-16 | Patch：补齐双轨计算、WorkflowClass 路由、ThreatTier、Service Access Window（临时授权窗口）、Drills 对齐 |
| **v7.3.5** | 2025-12-16 | Fix：ON_SCENE_NO_SIGNS 语义修正（continue_verify 而非 none）、Drill Schema v2.3.3 对齐、文档一致性修复 |
| **v7.4.0** | 2025-12-16 | Integrated：协作证据链（Cloud）与本地报警包（Edge）解耦；DCV 从“Edge gating”改为“Cloud 升级”；支持邻居撤回/取消编排（含审计） |
| **v7.4.1** | 2025-12-16 | Fix：冻结 EventUpdate wire format + Contract Tests（避免 Edge-only 导致网关语义退化） |
| **v7.4.2** | 2025-12-16 | Fix：冻结 EventUpdate 权限矩阵（ActorRole×UpdateType）、authorized_action_result 审计闭环、命名风格一致性、错误码/合同测试补齐 |

---

# 第零部分：产品定义与边界（P0）

本 PRD 的目标不是把 NG 变成“中央站专业安防系统”，而是把 **可靠事件构建（Edge）** 固化为一套 **事件驱动网关标准（Gateway）**，从而支撑三类用户目标：

1) **报警用（降噪）**：减少误报/漏报；提供可撤回与可审计的处置语义（Entry Delay / Abort / Cancel）。  
2) **自己用（夜间安全）**：夜间可被可靠唤醒并完成最小安全决策（观察/继续验证/解除）。  
3) **互助用（联防基础）**：以事件为核心的消息/协作机制（分发、隐私裁剪、证据备档、训练闭环），不依赖“手工创建事件”。

## 0.1 责任边界（Normative）

- **Edge 是处置事实的唯一来源（Source of Truth）**：事件推理、AlarmSM、定时器、Disposition、AVS、DCV（双确认源）与 DispatchRecommendation 均由 Edge 产生并审计。  
- **Cloud 是事件账本与协作网关（Ledger + Collaboration Gateway）**：接收/存储/索引/通知分发/权限裁剪/证据备档；**不得在云端重算或推进处置状态**。  
- **Gateway Contract** 是 Edge↔Cloud 的唯一硬标准（见第十一部分）；Edge 与 Cloud 的实现必须通过合同测试（contract tests）。

## 0.2 工作流分层（Heavy / Light / Logistics）

为避免“把所有信号都当成报警”的噪声与复杂度，事件被归类为工作流（`workflowClass`）：

- **SECURITY_HEAVY**：入侵/强行进入、关键周界越界（达到阈值）。进入 AlarmSM（PRE/PENDING/TRIGGERED…），支持输出设备分级与 DCV。  
- **LIFE_SAFETY**：烟雾/CO 等 24H。允许绕过部分撤回策略直接高优先级处置，但必须审计且支持静音。  
- **SUSPICION_LIGHT**：人员/车辆/徘徊等高频信号。**不得进入 AlarmSM 的 PENDING/TRIGGERED**；允许停留在 `PRE`（Observation）用于时间线/去重。默认仅记录/轻提示/低强度驱离，可作为“上下文证据”提升后续入侵事件置信度（见 0.2.2 / 6.5.1）。  
- **LOGISTICS**：包裹/代收代取等互助服务。使用轻量 Task 工作流（不进入 AlarmSM），复用 Circle/权限/审计/证据机制（详见 Cloud PRD；本 PRD 仅定义网关字段与隔离约束）。

> 说明：`authorized_access_session`（施工/维护的授权访问会话）属于 `SUSPICION_LIGHT` 的特例，由 ServiceAccessWindow 路由产生（见 §1.3.1），用于审计与降噪，不得触发报警链路。



### 0.2.1 WorkflowClass 路由规则（Normative）

NG EDGE 必须可解释地将“原始信号（Signal）”路由到某个工作流。路由以 **ZoneType + SignalType + Mode** 为主，不以“品牌/厂商”做规则分支。

**路由优先级（从高到低）**：

0) **ServiceAccessWindow 授权覆盖（仅在窗口内生效）**  
   - 若 `AccessPolicyResolver` 判定 `AUTHORIZED` → 强制路由为 `SUSPICION_LIGHT` 且 `eventType="authorized_access_session"`，并写入 `accessDecision`；不得进入 `PENDING/TRIGGERED`。  
   - 若 `UNAUTHORIZED` → 继续按下述规则路由（通常落入 SECURITY_HEAVY）。

1) **LIFE_SAFETY**（最高优先级，24H）  
   - `smoke_detected / co_detected / fire_alarm` 等 → LIFE_SAFETY（无视布防模式）

2) **SECURITY_HEAVY**（布防相关的强安全语义）  
   - 在 `ENTRY_EXIT / PERIMETER / FIRE_ESCAPE` 等关键区发生：  
     - `door_open / window_open / forced_entry / glass_break` → SECURITY_HEAVY  
   - 在 `INTERIOR_FOLLOWER` 发生：  
     - `motion_active` 仅作为 SECURITY_HEAVY 的“入内确认/链路 follower”，不单独触发 Heavy（除非 HomePolicy 明确允许）

3) **SUSPICION_LIGHT**（高频、低置信）  
   - 在 `EXTERIOR`：`person_detected / vehicle_detected / loiter / approach_entry` → SUSPICION_LIGHT  
   - 在 `ENTRY`：`person_near_entry`（摄像头/雷达）→ SUSPICION_LIGHT（可升级）

4) **LOGISTICS**（服务类）  
   - `package_delivered / package_removed / courier_arrived` → LOGISTICS（不进入 AlarmSM）

**示例**：
- `door_open` in `ENTRY_EXIT`（Away/Night）→ SECURITY_HEAVY（至少进入 PENDING 或直接 TRIGGERED）  
- `person_detected` in `EXTERIOR`（Night）→ SUSPICION_LIGHT（可进入 PRE/轻唤醒，但不得进入 PENDING/TRIGGERED）  
- `motion_active` in `INTERIOR_FOLLOWER` 若无 entry/forced 信号 → 默认不生成 Heavy（避免宠物/误触）；HomePolicy 可例外

### 0.2.2 SUSPICION_LIGHT 作为“上下文证据”的升级规则（Normative）

SUSPICION_LIGHT 本身不产生 “dispatchRecommendation”，但可作为 **Context Evidence** 提升 SECURITY_HEAVY 的证据强度与脚本措辞。

参数（默认值，可配置）：
- `T_context_sec = 30`：上下文窗口（以 entry/forced 信号为锚点，向前回溯）
- `context_decay_tau_sec = 15`：上下文加成衰减
- `context_bonus_score = +0.8`：对 EPHE 评分的加成（用于更快达到 Attempted Break-in）
- `context_shortened_entry_delay_sec = min(10, floor(entryDelaySec/3))`：仅用于 Night_occupied 的“更快叫醒”，不得用于 Away（避免误触导致过度报警）

规则：
1) 若同一 EntryPoint 在 `T_context_sec` 内出现 `approach_entry / loiter / person_near_entry`，随后出现 `door_open/glass_break/forced_entry`，则该入侵事件标记：
   - `contextEvidence=true`
   - `attemptedBreakInSatisfied=true`（满足 §6.5.1 的 Attempted Break-in 条件分支 2）
2) 上下文证据必须写入 `explainSummary` 与 `dispatch_script_15s`（“在破门前 30 秒有人员接近并徘徊”）。
3) 若 `T_context_sec` 内仅出现 `vehicle_detected`（无接近/徘徊），默认不加成；除非用户显式配置“车道入侵”策略（Out of Scope）。


## 0.3 Capability Tier（V/E/N）与 Kit 承诺边界

为避免“杂牌混用但接口缺失导致交付失败”，NG 对外按能力分层承诺：

- **Tier V (Video-Verified)**：可稳定获取本地视频/快照（RTSP/ONVIF/本地 SDK）。支持“屋主远程视频确认（W1）”与更强证据包。  
- **Tier E (Event-Only)**：只能拿到事件/通知，无法稳定拉视频。可用于上下文增强，但不得作为唯一验证证据源。  
- **Tier N (No-Camera)**：无摄像头接入，仅靠传感器链条闭环。

**Kit（推荐硬件包）**：产品交付与文案应以 Kit 为单位陈述能力，不承诺“支持全部闭源摄像头生态”。

- **Kit A：Sensor-First（Tier N/E）**：门磁/玻碎/室内 PIR + 输出设备（Siren/Strobe）+ 本地解除。  
- **Kit B：Video-Verified（Tier V）**：Kit A + 1–2 个“验证位”摄像头（门口/后门）。  
- **Kit C：Perimeter+Garage（可选）**：在关键周界/车库补充周界与 follower。

## 0.4 本阶段策略：可先做 Edge，但必须冻结输出边界

若阶段性只聚焦 Edge 的可靠落地，仍必须同时完成两项“占位”以避免未来 Cloud 衔接混乱：

1) **Gateway Contract Stub（v0.1）**：定义必须字段、幂等与 update/revision 语义（第十一部分）。  
2) **Edge Output Bundle（edge-export-v1）**：Edge 可离线导出标准事件包（用于回放、合同测试与后续批量补传）。



## 0.7 协作证据链与本地报警包（P0，Normative）

NeighborGuard 的目标是“协作型安防”（圈子协作、隐私分发、训练闭环），但 **Edge 在运行时只掌握本地事实**，邻居确认/外部取证/包裹互助等协作信息发生在 Cloud/移动端。为避免系统被“第二人确认永远到不了 Edge”锁死，本 PRD 明确把证据链拆成两层，并规定各自的单一真相归属：

### 0.7.1 Local Alarm Packet（Edge 单一真相）

Edge 必须在离线可用前提下生成 **本地报警包**（Local Alarm Packet），用于：
- 叫醒/驱离/本地输出（User Safety Track）
- 向屋主提供“可复述脚本（本地版）”
- 作为 Cloud 协作证据链的起始事实（append-only）

Local Alarm Packet **只能陈述本地事实**，不得假设邻居已确认、不得等待 DCV 结果。

### 0.7.2 Collaborative Evidence Chain（Cloud 单一真相）

Cloud 负责把同一事件的协作输入（DCV、邻居 on-scene、外部媒体、包裹互助任务、尝试联系日志等）以 **EventUpdate（append-only ledger）** 形式追加到事件账本，并生成：
- Evidence Chain Page（协作证据链页，含权限裁剪与审计）
- dispatch_script_15s（协作版，可选）
- dispatchRecommendation/dispatchReadinessLevel 的 **协作升级或撤回**

### 0.7.3 关键约束：Edge 不等待协作门槛（避免锁死）

- **AlarmSM（PENDING/TRIGGERED…）与本地输出**只由 Edge 本地证据驱动；不得等待 DCV/邻居结果。
- **DCV/最小证人集（W2）门槛**属于 Cloud 的协作升级逻辑：协作信息一旦满足门槛，Cloud 立即更新 `dispatchRecommendation/dispatchReadinessLevel`，无需等待 Edge“再收集齐”。
- 邻居“检查无事”属于 **负面观察（negative observation）**，默认降低确定性并推动继续验证；若要“撤回/取消”，必须通过 **授权取消动作**（见 §6.8），并全程审计。

---
# 第一部分：核心枚举与模式

## 1.1 House Mode 枚举

```python
class HouseMode(Enum):
    DISARMED = "disarmed"
    HOME = "home"
    AWAY = "away"
    NIGHT = "night"

class NightSubMode(Enum):
    NIGHT_PERIMETER = "night_perimeter"
    NIGHT_OCCUPIED = "night_occupied"

class HomePolicy(Enum):
    RECORD_ONLY = "record_only"
    PREALERT_ONLY = "prealert_only"
    ESCALATE_SUSTAINED = "escalate_sustained"
```


## 1.1.1 EventType 枚举（P0，Output ABI）

`eventType` 是 Edge→Cloud 的稳定输出字段，用于 UI 分类、互助协作分发与训练标注。  
约束：`eventType` **必须与 `workflowClass` 一致**，并且在事件生命周期内允许“升级”（例如从 attempted → confirmed），但必须通过 revision 记录变更原因。

```python
class EventType(Enum):
    # SECURITY_HEAVY
    INTRUSION_ATTEMPTED = "intrusion_attempted"
    INTRUSION_CONFIRMED = "intrusion_confirmed"
    PERIMETER_BREACH = "perimeter_breach"
    FORCED_ENTRY = "forced_entry"
    GLASS_BREAK = "glass_break"

    # SUSPICION_LIGHT / Audit Sessions
    PRE_ALERT = "pre_alert"
    AUTHORIZED_ACCESS_SESSION = "authorized_access_session"

    # LOGISTICS
    PACKAGE_DELIVERED = "package_delivered"
    PACKAGE_REMOVED = "package_removed"

    # LIFE_SAFETY
    SMOKE_ALARM = "smoke_alarm"
    CO_ALARM = "co_alarm"
```

映射规则（最小实现）：
- `door_open/window_open` 达到 Attempted Break-in → `intrusion_attempted`
- 形成 Confirmed Intrusion → `intrusion_confirmed`
- `glass_break` 主导 → `glass_break`（可在 confirmed 时升级为 `intrusion_confirmed`，但须保留证据说明）
- ServiceAccessWindow AUTHORIZED → `authorized_access_session`
- Logistics 信号 → `package_delivered/package_removed`
- 烟雾/CO → `smoke_alarm/co_alarm`
## 1.2 Night 子模式行为（P0）

Night 在 NG 中必须区分“睡觉但有人在家”与“夜间周界严防”的两个语义，以同时满足：
- **用户视角**：叫醒、查看、最小决策（不要因派警门槛而延迟叫醒）
- **对外处置视角**：入侵/越界时可快速进入重链路（必要时 delay=0）

### 1.2.1 子模式差异（Normative）

| 子模式 | Entry Delay | Interior Zones | 典型场景 |
|---|---:|---|---|
| `night_occupied` | 短延迟（默认 15s，可配置 0-30s） | **Bypass** 大部分室内活动区（卧室/客厅）但保留 `INTERIOR_FOLLOWER`（玄关/走廊） | 夜间睡觉、有人可能起夜 |
| `night_perimeter` | 即时（默认 0s） | **Bypass** 室内（仅周界/入口点），`INTERIOR_FOLLOWER` 只用于“确认入内/证据加成” | 高风险/外出/只看周界 |

约束：
- `night_perimeter` 的目标是“周界即入侵”，默认不等待 follower PIR 再进入 TRIGGERED（但 follower 仍用于提升 AVS/脚本措辞）。
- `night_occupied` 必须优先保证“可叫醒”，因此 `PRE` 允许轻唤醒；`PENDING` 进入强唤醒 + 撤回窗口。

### 1.2.2 自动切换（推荐实现，非强制）

若配置了 Presence/Occupancy（手机在家/蓝牙/静默规则），可按如下策略自动选择子模式：

- 若检测到 `occupied=true`（至少 1 人在家）→ 默认 `night_occupied`
- 若 `occupied=false` 或全屋静默 ≥ 30 分钟且用户明确启用“周界严防” → 可自动切到 `night_perimeter`
- 手动切换优先级高于自动；自动切换必须写入审计（AuditTrail）



## 1.3 HOME Policy 配置

```python
HOME_POLICY_CONFIGS = {
    HomePolicy.RECORD_ONLY: {"max_alarm_state": "QUIET", "indoor_multiplier": 0.1},
    HomePolicy.PREALERT_ONLY: {"max_alarm_state": "PRE", "indoor_multiplier": 0.3},
    HomePolicy.ESCALATE_SUSTAINED: {
        "max_alarm_state": "TRIGGERED",
        "indoor_multiplier": 0.3,
        "sustained_threshold_sec": 60,
        "require_multi_zone": True,
    },
}
```

---



## 1.3.1 Service Access Window（度假施工/维护场景，P0）

本节解决典型场景：屋主处于 `away`（度假）期间，白天有工人进屋刷墙/维修/读表。系统必须既能**避免合法进出导致的入侵误报**，又能对**非授权时间/非授权入口/非授权区域/破坏类信号**保持高灵敏。

### 设计目标（Normative）
- 在授权窗口内：允许指定 `EntryPoints` / `Zones` 的合法活动，不进入 `PENDING/TRIGGERED`，不触发声光报警，不通知邻居；但必须**审计可追溯**并可选留存证据。
- 在授权窗口外或越界：按 `SECURITY_HEAVY` 处理，进入 AlarmSM。
- **破坏类信号优先级最高**：`glass_break / forced_entry` 在任何授权窗口内仍必须走 `SECURITY_HEAVY`。

### ServiceAccessWindow 配置结构（Normative）
```json
{
  "serviceWindowId": "svc_day_001",
  "name": "Painter - Daytime",
  "timezone": "America/Edmonton",
  "startAtLocal": "09:00",
  "endAtLocal": "17:00",
  "daysOfWeek": ["MON","TUE","WED","THU","FRI"],
  "allowedEntryPointIds": ["front_door_ep"],
  "allowedZoneIds": ["foyer", "living_room", "hallway"],
  "restrictedZoneIds": ["bedrooms", "basement", "office"],
  "actions": {
    "suppressAlarmOutputs": true,
    "suppressNeighborNotifications": true,
    "stillRecordEvidence": true,
    "overrideFollowerAcceleration": false
  },
  "session": {
    "idleTimeoutSec": 900,
    "summaryNotification": "silent"
  }
}
```

### 运行时规则（Normative）
1) **优先判定授权**
- 每条 `ZoneTrip` / 关键 `Signal` 到达后，先执行 `AccessPolicyResolver`：
  - 若命中有效的 `ServiceAccessWindow` 且满足 `allowedEntryPointIds/allowedZoneIds` → 标记 `accessDecision=AUTHORIZED`。
  - 若在窗口内但进入 `restrictedZoneIds` 或触发未授权入口 → `accessDecision=UNAUTHORIZED`。
  - 若不在窗口内 → `accessDecision=NOT_IN_WINDOW`。

2) **AUTHORIZED 行为**
- 对 `AUTHORIZED` 活动，系统创建/更新一个 **Authorized Access Session**（事件语义为审计会话）：
  - `workflowClass = "suspicion_light"`（不进入 `PENDING/TRIGGERED`）
  - `eventType = "authorized_access_session"`
  - `alarmSM` 允许保持在 `PRE`（用于统一时间线/去重），但 **必须 `mustNotReach=["PENDING","TRIGGERED"]`**
  - `dispatchReadinessLevel = 0`，`dispatchRecommendation = "none"`
- 强制覆盖：`overrideFollowerAcceleration=false`（即在授权窗口内禁用 follower 加速触发）

3) **UNAUTHORIZED / NOT_IN_WINDOW 行为**
- 按正常路由进入 `SECURITY_HEAVY` 规则与 AlarmSM（包括 follower 加速触发）。

4) **破坏类信号覆盖**
- `glass_break / forced_entry` 永远忽略 AUTHORIZED，直接进入 `SECURITY_HEAVY`（允许并行创建 `authorized_access_session`，但应在 explain 中标记“破坏覆盖”。）

### 用户体验（建议但可验收）
- 授权窗口内仅给屋主发送**静默摘要**（开始/结束/持续时长/涉及入口点与区域）；默认不叫醒、不推邻居。
- 若发生 UNAUTHORIZED/破坏覆盖：按 `away` 高优先级通知并允许声光输出（除非用户显式关闭）。

---
## 1.4 双轨输出模型（User Safety Track vs Dispatch Track）

同一事件在 NG EDGE 内核中同时产生两类输出，二者由同一套证据与状态机派生，但阈值与用途不同：

- **User Safety Track（用户安全）**：目标是“叫醒 + 最小决策”。输出 `userAlertLevel(0-3)`、唤醒渠道与三按钮交互：  
  - `DISARM`（解除/撤防，强认证 + 审计）  
  - `CONTINUE_VERIFY`（继续观察/继续验证，默认）  
  - `CONFIRM_ANOMALY`（确认异常，生成对外脚本并触发协作）

- **Dispatch Track（对外处置准备度）**：目标是“对口报案/互助协作”。输出 `dispatchReadinessLevel(0-3)`、DCV 进度、15 秒可复述脚本与 `dispatchRecommendation`。

**Night 默认策略（可由 UserAlertPolicyProfile 覆盖）**
- PRE：允许轻唤醒（不触发警号，不通知邻居）  
- PENDING：强唤醒 + 倒计时可撤回（EntryDelay/Abort）  
- TRIGGERED：全量唤醒 + 输出设备策略 + 启动 DCV/脚本生成

约束（锁定）：
- `userAlertLevel` 不以 `dispatchReadinessLevel` 为前置条件；不得为了“满足派警门槛”而延迟夜间唤醒。  
- `dispatchRecommendation` 只由 SECURITY_HEAVY/LIFE_SAFETY 产生；SUSPICION_LIGHT 默认不得直接产生“建议派警”。




### 1.4.1 `userAlertLevel` 计算规则（Normative）

`userAlertLevel` 的目的是描述“对用户的**唤醒/提醒强度**”，它不等价于派警准备度，也不以 DCV 完成为前置条件。

定义（0-3）：

- **0**：无提醒/仅记录
- **1**：轻提醒（silent push / UI badge / 轻提示音），不要求立刻起身
- **2**：强唤醒（夜间叫醒、强提示音/床头 chime），期望用户立即查看
- **3**：警情级提醒（critical push / siren/strobe 或等价强度），期望用户立即采取行动（撤防/确认/求助）

计算规则（以事件在 Edge 端的**当前状态**为输入；若上报到 Cloud，建议同时上报 `userAlertLevelPeak`，但本 PRD 将 `userAlertLevel` 作为“当前/最新快照值”）：

| WorkflowClass | AlarmSM State | Away | Night (occupied) | Night (perimeter) | Home |
|---|---|---:|---:|---:|---:|
| SUSPICION_LIGHT | PRE/Observation | 1 | 1 | 1 | 0-1 |
| SECURITY_HEAVY | PRE | 2 | 1 | 1 | 1 |
| SECURITY_HEAVY | PENDING | 3 | 2 | 3 *(delay=0 可直接 TRIGGERED)* | 2 |
| SECURITY_HEAVY | TRIGGERED | 3 | 3 | 3 | 3 |
| LIFE_SAFETY | (any) | 3 | 3 | 3 | 3 |
| LOGISTICS | (n/a) | 0-1 | 0 | 0 | 0-1 |

*注：Home 模式下 `SUSPICION_LIGHT` 的 0/1 判定（Normative）
    - 默认 **0**（仅记录），除非满足任一条件：  
      1) `homePolicy.notifySuspicion = true`；或  
      2) `quietHours=true` 且触发发生在 `ENTRY_EXIT`/`PERIMETER` 的关键入口点附近（EntryPoint 绑定的 OUTDOOR zone 也算）；或  
      3) 用户在 UI 中对该 EntryPoint/Zone 显式开启 “Home 下可疑提醒”。  
    - 若触发源为 `vehicle_detected` 且无 `approach_entry/loiter`，默认仍为 0。

    **注：LOGISTICS 的 0/1 判定（Normative）**
    - 默认 **0**（不打扰）。  
    - 仅当 `logisticsPolicy.notifyOnDelivery=true` 或“夜间防偷包裹”开启时，允许为 1（轻提醒）；不得进入 2/3，也不得触发输出设备。

补充规则：
- `CANCELED/RESOLVED` 不强制降低历史提醒强度；UI 可用 `eventDisposition` 解释“已取消/已结束”。
- Away 下 `PRE` 之所以可能达到 2，是为了支持“在外也要及时查看”的用户需求（但不自动触发 siren）。

### 1.4.2 `dispatchReadinessLevel` / `dispatchRecommendation` 的归属与计算（P0，Normative）

为兼容现有 ABI，本 PRD 保留对外字段：

- `dispatchReadinessLevel(0-3)`：对外处置准备度（**有效值 effective**）
- `dispatchRecommendation`：`none | continue_verify | recommend_call_for_service`

同时引入内部来源分解（可选上报）以避免“协作门槛锁死”：

- `dispatchReadinessLocal`：Edge 仅基于本地证据给出的准备度估计（通常 0-2）
- `dispatchReadinessCollab`：Cloud 基于 DCV/协作证据给出的准备度（0-3）
- `dispatchReadinessLevel = max(dispatchReadinessLocal, dispatchReadinessCollab)`（effective）
- `dispatchRecommendationEffective`：Cloud 侧的最终建议（若无 Cloud 更新，则等于 Edge 的本地建议）

#### (A) Edge 本地计算（Local）

Edge **不等待协作输入**，并在事件创建/更新时给出：

- `dispatchReadinessLocal=0`：SUSPICION_LIGHT/LOGISTICS；或 `eventDisposition` 为 `canceled_* / verified_false`；或 `avs_final_level=0`
- `dispatchReadinessLocal=1`：边界证据成立（Entry/Forced-Entry）进入 `PENDING` 或 `TRIGGERED`
- `dispatchReadinessLocal=2`：满足 “Confirmed Intrusion（入内确认）” 的本地证据（如 interior follower / 第二入口点 / Tier-V 本地视频明确入内），或屋主（W1）显式确认异常

本地建议：
- 默认 `dispatchRecommendation=continue_verify`
- 仅当 `dispatchReadinessLocal>=2` 且 `avs_final_level>=2` 且 `verified_false` 不成立时，允许本地建议为 `recommend_call_for_service`（提示“你可自行报案”；并生成 `dispatch_script_15s` 本地版）

#### (B) Cloud 协作升级/撤回（Collaborative）

Cloud 接收协作输入后可通过 EventUpdate 覆盖 effective 值：

- 若 DCV/协作证据满足最小证据/证人集（W1+W2 或等效策略），Cloud 可将：
  - `dispatchReadinessCollab` 提升至 2/3
  - `dispatchRecommendation` 提升为 `recommend_call_for_service`
  - 生成/更新 `dispatch_script_15s` 协作版（可选）

- 若收到 `ON_SCENE_NO_SIGNS`：**不等于 CONFIRMED_FALSE**。默认：
  - `dispatchRecommendation=continue_verify`
  - `dispatchReadinessCollab` 不上升（可下降但不归零）
  - 触发“撤回/取消”提示（仅提示，不自动取消 AlarmSM）

- 若收到明确否定（`CONFIRMED_FALSE` 或 `eventDisposition=verified_false`）：Cloud 必须将：
  - `dispatchReadinessLevel=0`
  - `dispatchRecommendation="none"`

> 重要：Cloud 的撤回/取消不会“替代撤防”。若需要停止本地输出，必须通过 `disarm/cancel` 授权动作（见 §6.8 与 §11.4）。

### 1.4.3 UserAlertPolicyProfile（结构、默认值、覆盖规则）

UserAlertPolicyProfile 用于“叫醒策略/渠道/节流”的配置，允许按 `mode + nightSubMode + workflowClass` 覆盖默认行为。

```json
{
  "id": "default",
  "channels": {
    "level1": ["push"],
    "level2": ["push", "chime"],
    "level3": ["push_critical", "siren", "strobe"]
  },
  "rateLimit": {"cooldownSecByLevel": {"1": 60, "2": 30, "3": 10}},
  "nightDefaults": {
    "night_occupied": {"preLevel": 1, "pendingLevel": 2, "triggeredLevel": 3},
    "night_perimeter": {"preLevel": 1, "pendingLevel": 3, "triggeredLevel": 3}
  },
  "homeDefaults": {"preLevel": 1, "pendingLevel": 2, "triggeredLevel": 3},
  "awayDefaults": {"preLevel": 2, "pendingLevel": 3, "triggeredLevel": 3}
}
```

覆盖规则（Normative）：
- 若 profile 未配置某 level，则回退到系统默认表（§1.4.1）。
- profile 只能改变“通知渠道/强度”，不得改变 AlarmSM 的安全语义（不得用 profile 把 TRIGGERED 降为 PRE）。


# 第二部分：数据契约

## 2.1 Evidence

```python
@dataclass
class Evidence:
    """
    单条证据记录
    
    注意: System signals (disarm/network/verification) 不进入 EvidenceLedger，
    而是记录在 AuditLog 或 VerificationAttemptLog 中。
    """
    evidence_id: str
    timestamp: datetime
    signal_id: str
    sensor_id: str
    sensor_type: str
    signal_type: str
    
    # 位置信息 (仅物理传感器必填)
    zone_id: str
    zone_type: ZoneType
    location_type: LocationType
    entry_point_id: Optional[str]
    
    # 置信度
    signal_confidence: float
    sensor_reliability: float
    base_weight: float
    mode_multiplier: float
    chain_bonus: float
    final_contribution: float
```

**重要**: System signals (`disarm`, `network_down/up`, `verification_*`) 是控制信号而非证据，不写入 EvidenceLedger。

## 2.2 EventDisposition

```python
class EventDisposition(Enum):
    ACTIVE = "active"
    RESOLVED_TIMEOUT = "resolved_timeout"
    RESOLVED_VERIFIED = "resolved_verified"
    CANCELED_BEFORE_TRIGGER = "canceled_before_trigger"
    CANCELED_AFTER_TRIGGER = "canceled_after_trigger"
    CANCELED_AFTER_ABORT = "canceled_after_abort"
    VERIFIED_FALSE = "verified_false"
    VERIFIED_TRUE = "verified_true"
```

## 2.3 AVS Assessment

```python
@dataclass
class AVSAssessment:
    # 峰值 (事件期间最高，不因取消改变)
    avs_peak_level: int
    avs_peak_rationale: str
    avs_peak_timestamp: datetime
    
    # 最终 (可能因取消/验证改变)
    avs_final_level: int
    avs_final_rationale: str
    
    # 分层
    presence_tier: int
    threat_tier: int
    human_confirmed: bool
```

## 2.4 VerificationResult

```python
class VerificationResult(Enum):
    """
    验证结果枚举（用于 DCV：Dual-Contact Verification）

    Wire Format 规范:
    - JSON/Drills 使用 UPPERCASE: "CONFIRMED_TRUE", "EXHAUSTED"
    - 内部代码使用 lowercase: confirmed_true, exhausted
    - Runner 负责大小写转换
    """
    PENDING = "pending"
    CONFIRMED_TRUE = "confirmed_true"
    CONFIRMED_FALSE = "confirmed_false"
    UNCERTAIN = "uncertain"
    NO_ANSWER = "no_answer"
    EXHAUSTED = "exhausted"

    # 现场（外部）确认：禁止引导进入室内
    ON_SCENE_SIGNS_PRESENT = "on_scene_signs_present"
    ON_SCENE_NO_SIGNS = "on_scene_no_signs"
    ON_SCENE_UNSAFE = "on_scene_unsafe"
```

## 2.5 WorkflowClass

```python
class WorkflowClass(Enum):
    SECURITY_HEAVY = "security_heavy"
    SUSPICION_LIGHT = "suspicion_light"
    LIFE_SAFETY = "life_safety"
    LOGISTICS = "logistics"
```

### 2.5.1 路由约束（Normative）

- WorkflowClass 的判定必须可解释（写入 `explainSummary`），且与 ZoneType/SignalType/Mode 一致。  
- 详细路由规则见 §0.2.1（作为单一真相）。本节仅列出实现必须覆盖的最小映射：

| ZoneType | SignalType | 默认 WorkflowClass |
|---|---|---|
| FIRE_24H / CO_24H | smoke_detected / co_detected | LIFE_SAFETY |
| ENTRY_EXIT / PERIMETER | door_open / window_open / forced_entry / glass_break | SECURITY_HEAVY |
| EXTERIOR | person_detected / vehicle_detected / loiter / approach_entry | SUSPICION_LIGHT |
| (any) | package_delivered / package_removed | LOGISTICS |



## 2.6 UserAlertLevel 与 DispatchReadinessLevel

```python
class UserAlertLevel(IntEnum):
    # 面向屋主/同住人：叫醒与决策强度
    NONE = 0
    SOFT = 1
    STRONG = 2
    ALARM = 3

class DispatchReadinessLevel(IntEnum):
    # 面向对外处置：脚本与协作准备度
    NONE = 0               # 不建议对外
    CONTINUE_VERIFY = 1    # 继续验证/观察
    VERIFIED = 2           # 已具备最小证据/证人集
    HIGH_RISK = 3          # 高风险/生命安全（视辖区政策可建议紧急处置）
```class UserAlertPolicyProfile(TypedDict, total=False):
    """用户提醒策略（可覆盖默认双轨输出表）。

    - 不影响 AlarmSM/AVS 推理，仅改变用户提醒的强度与渠道偏好。
    - 允许按 mode/submode 覆盖。
    """
    id: str
    name: str

    # 默认表覆盖（若缺省则回退 §1.4.1）
    awayDefaults: dict   # {"preLevel":2,"pendingLevel":3,"triggeredLevel":3}
    nightOccupiedDefaults: dict
    nightPerimeterDefaults: dict
    homeDefaults: dict

    # SUSPICION_LIGHT 在 Home 下是否提醒（用于 §1.4.1 的 0/1 判定）
    notifySuspicionInHome: bool  # default false

    # LOGISTICS 是否提醒（用于 §1.4.1 的 0/1 判定）
    notifyLogistics: bool  # default false

class EdgeLevelPeaks(TypedDict, total=False):
    """可选：为 UI/审计保存峰值（不改变当前快照语义）。"""
    userAlertLevelPeak: int
    dispatchReadinessLevelPeak: int


## 2.7 CapabilityTier（Camera/Video）

```python
class CapabilityTier(Enum):
    V = "V"   # Video-Verified
    E = "E"   # Event-Only
    N = "N"   # No-Camera
```


---

# 第三部分：状态机规则

## 3.1 AlarmState 枚举

```python
class AlarmState(Enum):
    QUIET = "quiet"
    PRE = "pre"
    PENDING = "pending"
    TRIGGERED = "triggered"
    CANCELED = "canceled"
    RESOLVED = "resolved"
```


### 3.1.1 AlarmSM 时序与计时器（P0，Normative）

AlarmSM 的正确性高度依赖“计时器边界”。本节给出**实现必须满足**的时序约束（用于对照专业系统的 Entry Delay / Abort / Siren Timeout 语义）。

```
T=0                   T=entry_delay            T=entry_delay+abort       T=siren_timeout
│                         │                          │                        │
▼                         ▼                          ▼                        ▼
PENDING ───────────────► TRIGGERED ─────────────────────────────────────────► (SIREN_STOP/RESOLVED_TIMEOUT)
  │  [disarm]               │  [disarm]                    │
  ▼                         ▼                              │
CANCELED (before_trigger)  CANCELED (after_trigger)        │
  (AVS peak 保留)            (AVS peak 保留, disposition 标记)   │
```

默认值（可配置）：
- `entryDelaySec`：Away=30s，Night_occupied=15s，Night_perimeter=0s，Home=30s（或由 HomePolicy 覆盖）
- `abortWindowSec`：默认 30s（TRIGGERED 后允许快速取消/静音的窗口）
- `sirenTimeoutSec`：默认 180s（仅停止输出设备，不等于事件已解决）

关键规则（硬规则）：
1) `PENDING → TRIGGERED` **只能**由 entryDelay 到期、delay=0 立即触发，或 `INTERIOR_FOLLOWER` 加速触发（§3.2.2）；不得由 EPHE 分数直接触发。  
2) Disarm 在 `PENDING` 发生 → `eventDisposition=canceled_before_trigger`；在 `TRIGGERED` 发生 → `canceled_after_trigger`。  
3) TRIGGERED 后 Disarm：**AVS Peak 保留**（用于审计与训练），但 `dispatchRecommendation` 必须为 none。  
4) `sirenTimeout` 到期仅停止输出设备；事件仍可继续 DCV/协作，直到 `resolvedByUser` 或 `resolved_timeout`。


## 3.2 触发边界 (锁定)

```
EPHE 职责 (只能推进到 PRE):
  - 证据累积与评分
  - ephe_state 最多到 PREALERT

AlarmSM 进入 PENDING 的唯一条件:
  - Entry Zone ZoneTrip
  - Perimeter Zone ZoneTrip
  - Fire/CO Zone ZoneTrip (24-hour)
  - User Panic

禁止:
  - ❌ 仅 camera person/loiter 进入 PENDING
  - ❌ EPHE score 超阈值直接进入 PENDING
```


### 3.2.1 Debounce / Nuisance Filter（P0，Normative）

为通过 AWAY-EDGE-002 等“门磁抖动不应触发事件”的用例，NG EDGE 必须在构造 Evidence 之前进行**信号卫生处理**（不属于 EPHE/AlarmSM 的职责）。

默认规则（可配置，但必须有安全下限）：

```python
DEBOUNCE_RULES = {
  "door_contact": {
    # 开门至少持续 500ms 才算有效（防止瞬时抖动/接触不良）
    "min_open_duration_ms": 500,
    # 5 秒内开关次数 >= 3 视为 bounce → 丢弃本窗口内的 door_open 作为“触发边界”
    "bounce_window_sec": 5,
    "bounce_threshold": 3
  },
  "motion_pir": {
    # 同一 PIR 10 秒内不重复计分（但首次触发仍可作为 follower）
    "cooldown_sec": 10
  },
  "camera_ai": {
    # 同一摄像头的 person/loiter 事件节流（避免频繁上下文加成）
    "cooldown_sec": 5
  },
  "glass_break": {
    # 玻璃破碎不做 debounce（但可做“重复上报合并”）
    "cooldown_sec": 0
  }
}
```

硬约束：
- Debounce 只能影响“是否生成有效 Evidence/是否允许触发边界”，不得篡改原始信号日志（raw signals 仍需审计可追溯）。
- 对 LIFE_SAFETY 信号不得应用会导致漏报的 debounce（允许合并重复上报，但不得抑制首次报警）。


### 3.2.2 `INTERIOR_FOLLOWER` 加速触发（P0，Normative）

约束回顾：`camera/motion` **不能单独**把系统从 IDLE 推进到 `PENDING/TRIGGERED`（必须先有边界/入口点信号）。

但当且仅当出现以下前置条件时，`INTERIOR_FOLLOWER` 允许**提前结束 EntryDelay 并加速进入 TRIGGERED**：

- 前置条件：同一 EntryPoint 已因 `door_open / glass_break / forced_entry / window_open` 进入 `PENDING`（EntryDelay 进行中）。
- 加速条件：在 `T_path_sec`（默认 20s）内，绑定该 EntryPoint 的 `INTERIOR_FOLLOWER`（如 `motion_foyer`）触发 `motion_active`。

行为（Normative）：
- 立即将 `PENDING → TRIGGERED`（不等待 EntryDelay 到期），并记录 `trigger_reason = "follower_accelerated"`.
- 若处于 `night_occupied`：该加速行为默认开启（符合“睡觉但有人在家”的风险模型）。
- 若处于 `away`：该加速行为默认开启（外出布防时，入口后随即出现室内 follower 代表“已入内”，无需等待 EntryDelay 到期）。
- 若处于 `home`：默认不加速（避免家人活动误触），除非用户显式启用 “Home follower accelerates”。

解释性要求：
- 必须在 `explainSummary` 与 `dispatch_script_15s` 写明“入口打开后 X 秒，玄关 PIR 触发，判定已入内”。

## 3.3 delay=0 语义 (v7.2.2)

```python
def _handle_entry_zone_trip(self, zone_trip):
    entry_delay = self._get_entry_delay()
    
    if entry_delay == 0:
        # delay=0: 跳过 PENDING，直接 TRIGGERED
        return self._enter_triggered(zone_trip, reason="entry_instant_mode")
    else:
        return self._enter_pending(zone_trip, reason="entry_zone_violated")
```

## 3.4 Entry Delay 到期转换 (硬规则)

```python
"""
PENDING → TRIGGERED 定时转换规则

触发条件: Entry Delay 计时器到期
起始时间: 进入 PENDING 状态的时刻
到期时间: 起始时间 + entry_delay_sec
转换动作: PENDING → TRIGGERED
Reason 字符串: "entry_delay_expired"

示例:
  T=0:  door_open → 进入 PENDING，启动 entry_delay 计时器 (30s)
  T=30: 计时器到期 → 转换到 TRIGGERED (reason="entry_delay_expired")
"""

class AlarmStateMachine:
    def _enter_pending(self, zone_trip, reason):
        self.state = AlarmState.PENDING
        self.pending_entered_at = now()
        
        # 启动 Entry Delay 计时器
        self._start_entry_delay_timer(
            duration_sec=self._get_entry_delay(),
            on_expire=lambda: self._transition_to_triggered("entry_delay_expired")
        )
        
        return AlarmStateOutput(state=self.state, reason=reason)
    
    def _transition_to_triggered(self, reason):
        """
        定时转换: PENDING → TRIGGERED
        """
        if self.state != AlarmState.PENDING:
            return  # 已被取消或其他状态
        
        self.state = AlarmState.TRIGGERED
        self._start_siren()
        self._start_verification()
        self._start_abort_window_timer()
        
        return AlarmStateOutput(state=self.state, reason=reason)
```

## 3.5 撤防处理与 AVS 语义 (修正)

```python
"""
AVS Cancellation 语义 (v7.2.2-FINAL 统一规则)

规则:
  - canceled_before_trigger → avs_final = 0 (事件未真正触发)
  - canceled_after_trigger  → avs_final = avs_peak (已触发，保留峰值)
  - canceled_after_abort    → avs_final = avs_peak (已触发，保留峰值)
  - verified_false          → avs_final = 0 (确认误报)

重要: Dispatch 决策中，所有 canceled_* 状态均返回 "none"，
      无论 avs_final 是多少。UI 展示 disposition 优先于 avs。
"""

def _handle_disarm(self):
    if self.state == AlarmState.PENDING:
        # PENDING 内撤防: 事件未真正触发
        self.event_disposition = EventDisposition.CANCELED_BEFORE_TRIGGER
        self.avs_assessment.avs_final_level = 0
        self.avs_assessment.avs_final_rationale = "canceled_before_alarm_triggered"
        
    elif self.state == AlarmState.TRIGGERED:
        if self._in_abort_window():
            # Abort Window 内撤防
            self.event_disposition = EventDisposition.CANCELED_AFTER_TRIGGER
        else:
            # Abort Window 后撤防
            self.event_disposition = EventDisposition.CANCELED_AFTER_ABORT
        
        # 已触发的事件保留 avs_peak 作为 avs_final
        self.avs_assessment.avs_final_level = self.avs_assessment.avs_peak_level
        self.avs_assessment.avs_final_rationale = "alarm_triggered_then_canceled"
    
    self._stop_all_outputs()
    self._stop_verification()
    
    return AlarmStateOutput(state=AlarmState.CANCELED)
```

---

# 第四部分：AVS 计算

## 4.1 Presence Tier (0-3)

Presence Tier 表示“**人（嫌疑人/人员）存在**”的证据强度，供 AVS 计算使用。它与 Capability Tier（V/E/N）有关，但 **不得假设一定有摄像头**：Tier E / Tier N 也必须能通过门磁+室内 PIR 得到 Tier 2/3。

### 4.1.1 证据原语（Evidence Primitives）

- `P_VISUAL`：摄像头 AI 人形检测（confidence ≥ 0.70）
- `P_VISUAL_STRONG`：高置信人形（confidence ≥ 0.85）
- `P_INDOOR_FOLLOWER`：与同一 EntryPoint 绑定的 `INTERIOR_FOLLOWER` PIR，在 `T_path` 内触发（视为“入内线索”）
- `P_INDOOR_MULTI_ZONE`：两个不同室内 zone 的 PIR/传感器在 session 内连续触发（更强）
- `P_CROSS_ENTRYPOINT`：第二 EntryPoint 触发（多入口链路）
- `P_DCV_TRUE`：DCV 结果为 `CONFIRMED_TRUE` 或 `ON_SCENE_SIGNS_PRESENT`

CapabilityTier 对原语可用性的影响（Normative）：
- Tier **V**：允许使用 `P_VISUAL/P_VISUAL_STRONG` 与 “远程视频确认”  
- Tier **E**：忽略视觉原语（无稳定视频），主要依赖 `P_INDOOR_* / P_CROSS_ENTRYPOINT / P_DCV_TRUE`  
- Tier **N**：同 Tier E，但通常更少传感器；仍必须允许通过“门磁 + follower PIR”达到 Tier 2

### 4.1.2 Tier 判定（Normative）

| Presence Tier | 满足条件（任一） |
|---:|---|
| **3** | `P_INDOOR_MULTI_ZONE`；或 `P_DCV_TRUE` + (`P_INDOOR_FOLLOWER` 或 `P_CROSS_ENTRYPOINT`)；或 `P_VISUAL_STRONG` + `P_INDOOR_FOLLOWER`；或 `P_VISUAL_STRONG` + `P_CROSS_ENTRYPOINT` |
| **2** | `P_INDOOR_FOLLOWER`；或 `P_CROSS_ENTRYPOINT`；或 `P_DCV_TRUE`；或 (`P_VISUAL_STRONG` + Entry/Forced-Entry)；或 (`P_VISUAL` + `P_INDOOR_FOLLOWER`) |
| **1** | `P_VISUAL`；或（任一室内 PIR 单次触发，但不满足 follower 条件） |
| **0** | 以上均不满足 |

说明：
- Tier N（无摄像头）仍可达到 Presence Tier 2：`door_open`（Entry 证据）+ `P_INDOOR_FOLLOWER`。  
- “两摄像头人形”只是 Tier 3 的一种实现路径，不是唯一条件。  
- `glass_break` 属于 Threat 证据，不自动提升 Presence Tier（除非伴随视觉/室内证据）。



### 4.1.3 Threat Tier (1-4)（P0，Normative）

Threat Tier 表示“**威胁性质/后果严重性**”，用于区分“仅可疑”与“明确入侵/生命威胁”，并与 Presence Tier 一起决定 AVS Level。

定义（1-4）：
- **1**：可疑接近/徘徊（未触达边界、未发生破坏）
- **2**：周界尝试/试探（例如反复触发门磁抖动、门把手尝试、短时徘徊 + 入口附近异常；但未确认边界突破）
- **3**：边界突破或入侵高度可疑（door/window open when armed、glass_break、forced_entry、或“入口打开 + follower PIR”）
- **4**：生命威胁/暴力风险（smoke/co/duress、或“明确暴力破坏”由用户/现场确认）

判定规则（最小映射，Normative）：

| 触发/证据 | Threat Tier 下限 |
|---|---:|
| `person_detected / loiter / approach_entry`（仅室外） | 1 |
| `door_open/window_open` 且 Mode 为 `away/night_*` | 3 |
| `glass_break / forced_entry` | 3 |
| `door_open` + `INTERIOR_FOLLOWER`（§3.2.2） | 3 |
| `smoke_detected / co_detected / duress` | 4 |
| `ON_SCENE_SIGNS_PRESENT` 且描述为“破坏/入侵迹象” | 3（可提升到 4 仅当用户明确报告暴力/生命威胁） |

备注（Normative）：
- Threat Tier 取“证据下限的最大值”（max of lower bounds）。
- CapabilityTier（V/E/N）**不直接改变** Threat Tier；它影响 Presence Tier 与可用证据原语。

## 4.2 AVS Level 映射

```python
def calculate_avs_level(presence_tier, threat_tier, human_confirmed):
    """
    计算 AVS Level (不处理 disposition)
    
    注意: disposition 对 avs_final 的影响在 _handle_disarm() 中处理，
    不在此函数中。此函数仅计算基于证据的 AVS 分数。
    """
    if threat_tier == 4 and presence_tier >= 3 and human_confirmed:
        return 4
    if threat_tier >= 3 and presence_tier >= 2:
        return 3
    if presence_tier >= 2:
        return 2
    return 1
```

---

# 第五部分：Dispatch 决策树

## 5.1 硬规则

本节定义 `dispatchRecommendation` 的 **有效值（effective）** 决策树。实现要求：

- Edge 在本地可计算一个 `dispatchRecommendationLocal`（默认 continue_verify），用于“用户自行报案”的即时指导；
- Cloud 在接收到协作输入（DCV/邻居 on-scene/外部证据）后，可通过 EventUpdate 覆盖 `dispatchRecommendation/dispatchReadinessLevel`，形成最终有效值；
- 若 Cloud 不可达或未产生更新，则 effective 值等于 Edge 的本地值。

```python
def get_dispatch_recommendation(
    avs,
    verification_result: str,
    policy,
    disposition: str,
    readiness_validation_passed: bool = True,
):
    """
    Dispatch 决策树（P0，Normative）

    输出：
      - ("none" | "continue_verify" | "recommend_call_for_service", reason)

    关键原则：
      1) CANCELED / verified_false / AVS=0 → 永不建议
      2) Readiness 未通过 → 永不建议（但允许继续验证/记录）
      3) ON_SCENE_* 是 DCV 的“现场结果”，需要进入决策树
    """

    vr = (verification_result or "").upper()

    # 0) Readiness gate（配置未达标不得输出派警建议）
    if not readiness_validation_passed:
        return ("none", "readiness_validation_failed")

    # 1) 已取消一律 none（当前快照）
    if disposition in [
        "canceled_before_trigger",
        "canceled_after_trigger",
        "canceled_after_abort",
    ]:
        return ("none", "event_canceled_by_user")

    # 2) 明确否定一律 none
    if vr == "CONFIRMED_FALSE" or disposition == "verified_false":
        return ("none", "verified_false_alarm")
    if avs.avs_final_level == 0:
        return ("none", "avs_level_0")

    # 3) DCV on-scene outcomes
    on_scene_signs = (vr == "ON_SCENE_SIGNS_PRESENT")
    on_scene_no_signs = (vr == "ON_SCENE_NO_SIGNS")
    on_scene_unsafe = (vr == "ON_SCENE_UNSAFE")

    # ON_SCENE_SIGNS_PRESENT：视为“二级确认源”的强证据（但不等同生命威胁人证）
    if on_scene_signs:
        avs.human_confirmed = True

    # 4) Level 4（生命威胁）：必须有人证（Primary 或 DCV 强确认）
    if avs.avs_final_level == 4:
        if avs.human_confirmed:
            return ("recommend_call_for_service", "life_threat_human_confirmed")
        if on_scene_unsafe:
            return ("continue_verify", "life_threat_on_scene_unsafe_awaiting_primary_confirm")
        return ("continue_verify", "life_threat_awaiting_primary_confirm")

    # 5) No-One-Hit 策略：AVS=1 默认不建议（除非政策允许且有强确认）
    if policy.no_one_hit and avs.avs_final_level == 1:
        if vr == "CONFIRMED_TRUE" or on_scene_signs:
            return ("continue_verify", "one_hit_policy_requires_more_evidence")
        return ("none", "one_hit_policy_single_evidence")

    # 6) AVS=2-3：有强确认即可建议；无强确认则继续验证
    if avs.avs_final_level >= 2:
        if vr == "CONFIRMED_TRUE" or on_scene_signs:
            return ("recommend_call_for_service", "avs_ge_2_confirmed")
        # ON_SCENE_NO_SIGNS：降低确定性，继续验证（不等于 false alarm，见 §1.4.2）
        if on_scene_no_signs:
            return ("continue_verify", "on_scene_no_signs_reduced_certainty")
        # 现场不安全 + 高威胁（AVS=3）且联系失败：允许“条件性建议”
        if on_scene_unsafe and avs.avs_final_level == 3 and policy.allow_on_scene_unsafe_escalation:
            return ("recommend_call_for_service", "high_threat_on_scene_unsafe")
        return ("continue_verify", "avs_ge_2_unconfirmed")

    # 7) 默认继续验证
    return ("continue_verify", "default_continue_verify")
``````

---


# 第六部分：DCV（Dual-Contact Verification）与 Dispatch Readiness（P0）

本部分替代“中央站 DCV”概念，定义在 NG（屋主/亲属/邻居）语境下的 **双确认源/双联系人验证编排（DCV）**，并将“最小证据集/最小证人集”固化为可配置且可测试的 **Dispatch Readiness**。

**归属与运行时约束（P0，Normative）**
- **DCV/协作验证编排属于 Cloud（圈子/移动端）**：联系人梯队、重试、邻居任务卡与 on-scene 结果由 Cloud 产生并写入 EventUpdate。
- **Edge 只做“verificationIntent”声明与本地提示**：在 TRIGGERED/高风险时标记需要协作验证，但 **不得等待 DCV 才推进 AlarmSM/本地输出**（见 §0.7）。
- Edge 可离线运行；Cloud 的协作升级/撤回通过 EventUpdate 覆盖 `dispatchRecommendation/dispatchReadinessLevel`（见 §1.4.2 与 §11.0）。

## 6.1 术语与兼容（ECV → DCV）

- 本 PRD 使用 **DCV（Dual-Contact Verification）** 作为术语：强调“圈子双确认源机制”，不宣称等同中央站坐席 ECV。  
- **兼容别名（Wire Format）**：历史字段/实现若仍使用 `requireECV` / `ecv_*`，必须被解释为 DCV 的兼容别名；新实现应使用 `requireDCV` / `dcv_*`。  
- 对外文案不得使用“ECV compliant”，应表述为“DCV（借鉴 ECV 目的：降低误报、提升有效处置）”。

## 6.2 早停（Early Termination）规则（硬规则）

```
CONFIRMED_TRUE / CONFIRMED_FALSE → 立即终止（可提前），并写入审计
UNCERTAIN → 继续验证梯队（不早停）
NO_ANSWER → 继续到下一联系人
minDistinctContacts 仅在未拿到终止结果前强制
```

## 6.3 默认验证梯队（可配置）

```python
VERIFICATION_CONFIG = {
  "ladder": [
    {"recipientType": "primary_user", "channels": ["push", "sms"], "timeoutSec": 60, "maxAttempts": 2},
    {"recipientType": "keyholder_1", "channels": ["sms", "call"], "timeoutSec": 45, "maxAttempts": 1},
    {"recipientType": "keyholder_2", "channels": ["sms", "call"], "timeoutSec": 45, "maxAttempts": 1},
    {"recipientType": "neighbor_opt_in", "channels": ["push"], "timeoutSec": 90, "maxAttempts": 1},
  ],
  "totalTimeoutSec": 300,
  "minDistinctContacts": 2,
  "minDistinctNumbers": 2
}
```

## 6.4 邻居安全边界（ON_SCENE_UNSAFE）（硬规则）

- 邻居/非同住 keyholder 的任务卡默认只允许：**安全距离观察、回报不安全、可选外部照片/备注**。  
- **禁止引导进入室内**，禁止建议与嫌疑人接触。  
- `ON_SCENE_UNSAFE` 为合法结果：不等价 `CONFIRMED_TRUE`，但可作为高风险上下文影响 `dispatchRecommendation`（并在脚本中注明“现场不安全/无法接近”）。

## 6.5 Dispatch Readiness（最小证据集 + 最小证人集）（P0）

Dispatch Readiness 仅适用于 `workflowClass=SECURITY_HEAVY/LIFE_SAFETY`。其目标不是“把证据发给 911”，而是让系统能生成**可复述、可审计**的处置脚本与协作分发。

### 6.5.1 入侵类最小证据集（Minimum Evidence Set）

分两档语义（用于脚本措辞与分级）：

- **Attempted Break-in（尝试进入/未确认入内）**：满足其一即可  
  1) `Entry/Forced-Entry`（door_open/forced_entry/glass_break/window_open） + `Tier V remote video`（屋主/同住人显式确认看到接近/撬门/破坏）  
  2) `Entry/Forced-Entry` + `SUSPICION_LIGHT context`（同 EntryPoint，T_context 内出现 person_near_entry/loiter）

- **Confirmed Intrusion（确认入内）**：在 Attempted Break-in 基础上，再满足其一  
  1) 室内 follower PIR（entry hall / corridor）  
  2) 第二入口点触发（cross-entrypoint）  
  3) Tier V 视频明确显示入内

> 说明：在 **AWAY/NIGHT** 下，`Entry/Forced-Entry + Tier V 远程确认` 已可满足高置信“尝试入侵”，不要求必须等待室内 PIR。

### 6.5.2 最小证人集（Minimum Witness/Contact Set）

- **W1（Primary）**：屋主/同住人 App 显式确认：`CONFIRMED_TRUE / CONFIRMED_FALSE / UNCERTAIN`（仅打开页面不算确认）。  
- **W2（Secondary）**：第二确认源（亲属/同住人/邻居其一）。允许结果：`NO_ANSWER / EXHAUSTED / ON_SCENE_UNSAFE / ON_SCENE_*`。

## 6.6 DispatchReadinessValidator（配置期校验：仅 Edge 本地要素，Fail Fast）

DispatchReadinessValidator 的目的，是防止“本地拓扑/传感器缺失导致系统无法形成可靠链路”，但它 **不应把协作门槛（第二联系人/邻居）变成 Edge 的运行时锁**（见 §0.7）。

因此本校验器 **只验证 Edge 可见的本地要素**：

1) 每个关键 EntryPoint：至少 1 个强边界触发（`door_contact` / `window_contact` / `glass_break` / `forced_entry`）。  
2) 每个关键 EntryPoint：至少 1 个 **INTERIOR_FOLLOWER** PIR **或** 至少 1 个 Tier-V verification camera（绑定到该 EntryPoint）。  
3) Night：至少 1 个唤醒渠道（push/chime/wearable 之一）。  
4) 若配置了 ServiceAccessWindow：必须显式声明 `overrideFollowerAcceleration=false`（窗口内禁用）与 `suppressAlarmOutputs=true`（默认）。

> 说明：**“至少两名 keyholder/邻居 opt-in”属于 Cloud 侧圈子配置校验**，不由 Edge 校验；Edge 仅可展示“未配置协作联系人，协作升级不可用”的提示（非门控）。

失败错误码示例：
- `ERR_ENTRYPOINT_MISSING_STRONG_BOUNDARY`
- `ERR_ENTRYPOINT_MISSING_FOLLOWER_OR_VCAM`
- `ERR_NIGHT_WAKE_CHANNEL_NOT_CONFIGURED`
- `ERR_SERVICE_WINDOW_POLICY_INCOMPLETE`

### 运行时消费规则（Normative）

当某 EntryPoint 未通过本地校验时：

1) 事件仍可进入 AlarmSM 并执行本地输出（保障用户安全）；  
2) Edge 侧的 `dispatchReadinessLocal`（以及 effective 在无 Cloud 更新时的 `dispatchReadinessLevel`）最高 cap 到 **1**；  
3) Edge 侧 `dispatchRecommendation` 必须保持为 `"continue_verify"`（而非 `"none"`），并在 reason 中注明 `readiness_local_failed`；  
4) Cloud 仍可在获得协作证据后通过 EventUpdate **提升 effective 值**（见 §1.4.2 与 §11.0）。

## 6.8 撤回/取消编排：邻居检查“无事”如何生效（P0，Normative）

邻居/Keyholder 的 on-scene 结果可能降低确定性，但**不能直接等价为“误报”**。本节定义“撤回/取消”的可执行路径，避免系统被错误撤回，同时解决“协作端满足门槛即可立即升级/撤回”的闭环。

### 6.8.1 两类输入：观察结果 vs 授权动作

- **观察结果（Observation）**：`ON_SCENE_NO_SIGNS / ON_SCENE_SIGNS_PRESENT / ON_SCENE_UNSAFE`
  - 只影响 `dispatchRecommendation/dispatchReadinessLevel`（Cloud effective 值）
  - 不直接推进 AlarmSM，也不直接关闭输出设备

- **授权动作（Authorized Action）**：`CANCEL_ALARM` / `SILENCE_OUTPUTS` / `REMOTE_DISARM`
  - 必须由具备权限的主体发起（Primary/Keyholder，且满足认证）
  - 通过 Cloud→Edge 的 `EventUpdate(action)` 或 `disarm` 信号进入 Edge，引发 AlarmSM 的 `CANCELED`

### 6.8.2 撤回建议（Withdrawal Recommendation）

当 Cloud 收到 `ON_SCENE_NO_SIGNS` 且满足以下条件时，可生成“撤回建议”并提示 Primary/Keyholder 执行取消动作：

- `avs_final_level <= 2`（非高威胁）
- 在 `T_quiet_sec`（默认 90s）内无新增边界/室内 follower 证据
- 未出现破坏类（glass_break/forced_entry）

撤回建议不会自动取消；它会：
- 将 `dispatchRecommendation` 固定为 `continue_verify`（不建议对外处置）
- 向 Primary/Keyholder 推送“可安全取消”的提示按钮（带审计）

### 6.8.3 取消动作如何停止本地报警（与 AlarmSM 交互）

- 若事件处于 `PENDING` 或 `TRIGGERED`：
  - Primary/Keyholder 可通过 App 发起 `REMOTE_DISARM`（强认证）→ Edge 接收为 `disarm` 信号 → AlarmSM 进入 `CANCELED`
  - 或发起 `SILENCE_OUTPUTS`（仅静音，不改变布防状态；可选能力）

- 若 Edge 离线无法接收取消动作：
  - Cloud 仍可将 `dispatchRecommendation="none"` 并记录审计
  - 本地输出将按 `sirenTimeoutSec` 自然结束；恢复后 Edge 应拉取更新并在 UI 标记“协作已撤回/已取消（离线期间输出可能已响）”

### 6.8.4 审计要求（必须）

每一次撤回/取消必须记录：
- 发起人（memberId/role）
- 认证方式（PIN/biometric/session）
- 时间戳与原因（no_signs / mistaken_entry / contractor_window 等）
- 若为 keyholder：是否允许入户（默认禁止），以及是否选择 `ON_SCENE_UNSAFE`

# 第七部分：并发事件处理

```python
CONCURRENT_EVENT_POLICY = {
    "alarm_sm_granularity": "global",
    "session_window_sec": 120,
    "priority": {
        "life_safety": 1,
        "perimeter": 2,
        "entry_exit": 3,
        "interior": 4,
    },
}
```

---

# 第八部分：输出设备

```python
OUTPUT_DEVICE_CONFIG = {
    "siren": {"timeoutSec": 180, "minTimeoutSec": 60, "maxTimeoutSec": 300},
    "strobe": {"timeoutSec": 300},
}
```

撤防时立即停止所有输出和 verification。

---

# 第九部分：System Signals

## 9.1 枚举定义

```python
class SystemSignalType(Enum):
    NETWORK_DOWN = "network_down"
    NETWORK_UP = "network_up"
    ARM = "arm"
    DISARM = "disarm"
    MODE_CHANGE = "mode_change"
    PANIC = "panic"
    POWER_LOSS = "power_loss"
    POWER_RESTORE = "power_restore"
    TAMPER = "tamper"
    
    # Verification 结果
    VERIFICATION_CONFIRMED_TRUE = "verification_confirmed_true"
    VERIFICATION_CONFIRMED_FALSE = "verification_confirmed_false"
    VERIFICATION_UNCERTAIN = "verification_uncertain"
    VERIFICATION_NO_ANSWER = "verification_no_answer"
    VERIFICATION_EXHAUSTED = "verification_exhausted"
    VERIFICATION_ON_SCENE_UNSAFE = "verification_on_scene_unsafe"
    VERIFICATION_ON_SCENE_NO_SIGNS = "verification_on_scene_no_signs"
    VERIFICATION_ON_SCENE_SIGNS_PRESENT = "verification_on_scene_signs_present"

    # Session / workflow control
    SESSION_IDLE_TIMEOUT = "session_idle_timeout"
```
## 9.2 System Signals 与 Evidence 的关系

```
System signals 是控制信号，不是物理传感器证据:
- 不写入 EvidenceLedger
- 记录在 AuditLog (arm/disarm/mode_change)
- 记录在 VerificationAttemptLog (verification_*)
- 记录在 NetworkLog (network_down/up)

Drills 中 system sensor 的 sensorBindings 为 null 是正确的。
```

---

# 第十部分：Sensor Bindings

```json
{
  "sensorBindings": {
    "cam_frontyard": {"zoneId": "zone.front_yard", "zoneType": "EXTERIOR", "locationType": "OUTDOOR", "entryPointId": null},
    "cam_backyard": {"zoneId": "zone.back_yard", "zoneType": "EXTERIOR", "locationType": "OUTDOOR", "entryPointId": "ep.back_door"},
    "door_front": {"zoneId": "zone.entry", "zoneType": "ENTRY_EXIT", "locationType": "ENTRY", "entryPointId": "ep.front_door"},
    "door_back": {"zoneId": "zone.back", "zoneType": "PERIMETER", "locationType": "ENTRY", "entryPointId": "ep.back_door"},
    "motion_foyer": {"zoneId": "zone.foyer", "zoneType": "INTERIOR_FOLLOWER", "locationType": "INDOOR", "entryPointId": "ep.front_door"},
    "glass_front": {"zoneId": "zone.entry", "zoneType": "PERIMETER", "locationType": "ENTRY", "entryPointId": "ep.front_door"},
    "smoke_kitchen": {"zoneId": "zone.kitchen", "zoneType": "FIRE_24H", "locationType": "INDOOR", "entryPointId": null},
    "co_basement": {"zoneId": "zone.basement", "zoneType": "CO_24H", "locationType": "INDOOR", "entryPointId": null},
    "system": {"zoneId": null, "zoneType": null, "locationType": "SYSTEM", "entryPointId": null}
  }
}
```

---

# 第十一部分：Gateway Contract Stub（v0.1）与 Edge Output Bundle（edge-export-v1）（P0）

本部分用于确保“先做 Edge、后做 Cloud”不会造成语义漂移与接口退化。它是**最小但刚性的占位标准**：Edge 必须能导出/上报，Cloud 必须能存储/裁剪/分发。

## 11.0 协作更新（Cloud→Edge）与事件账本（P0，Normative）

为实现“协作证据满足门槛即可立即升级/撤回”，Gateway Contract Stub 必须支持 **EventUpdate（append-only）**，并允许 Cloud 写入协作结果。该机制不要求 Edge 必须在线；但当 Edge 在线时，应可拉取/订阅更新用于 UI 补全与本地取消动作。

- **Edge→Cloud**：`event.ingest`（create/upsert）与 `event.update`（state/timer/evidence append）
- **Cloud→Ledger**：`event.update`（verification/evidence append/recommendation override/withdrawal suggestion）
- **Cloud→Edge（可选）**：`event.update` 的推送/拉取（用于 UI 补全、远程 disarm/silence 指令）

EventUpdate 规范（最小字段）：
- `eventId`
- `revision`（单调递增）
- `source`：`edge | cloud`
- `updateType`：`verification_result | evidence_append | recommendation_override | withdrawal_suggestion | authorized_action`
- `payload`：类型化对象（见下）

## 11.1 Contract Stub 的目的与范围

- 目的：冻结 Edge→Cloud 的“事件事实”与“状态推进”语义，使 Cloud 无需推断即可实现互助分发、隐私裁剪与训练闭环。
- 范围：Device 身份、事件 ingest（create）、事件 update（revision）、幂等与错误码、必存字段集合、证据 manifest 引用、版本门控。

> 完整 Gateway Contract（v1.0）在 Cloud 实现阶段补齐 OpenAPI/JSON Schema；本 Stub 仍是 Normative。

## 11.2 Device Identity（最小）

- Edge 首次注册（Cloud 侧）：发放 `deviceKey` 与 `edgeDeviceId`
- Edge 调用 ingest/update 必须携带：`Authorization: Device <deviceKey>`
- Cloud 必须支持：禁用设备、轮换 deviceKey、设备能力声明（capabilityTier）

## 11.3 Event Ingest（Create/Upsert）与幂等

`POST /events/ingest`

- 语义：按 `idempotencyKey` 幂等 upsert（同 key 重试不得产生重复事件）
- 最小请求体字段：
  - `edge_schema_version`
  - `idempotencyKey`
  - `circleId`
  - `edgeDeviceId`
  - `event`（见 11.5 Mandatory Storage Set）
- Cloud 行为约束：若缺少 Mandatory 字段或 schema version 不被接受，必须拒绝并返回明确错误码。

## 11.4 Event Update（Revision Stream）

`POST /events/{eventId}/updates`

### 11.4.1 语义（Normative）

- **追加式更新（append-only）**：每条 update 是不可变日志记录；Cloud 不得“覆盖”历史 update，只能追加新的 revision。
- **单调递增**：`revision` 必须对同一 `eventId` 单调递增（从 1 开始或从 ingest 提供的 `event.revision`+1 开始，二者择一）。
- **幂等**：同 `(eventId, revision)` 重试必须返回相同结果（同一 update 被重复提交不会产生第二条日志）。
- **不等待原则**：Edge 的 AlarmSM 与本地输出不得等待 Cloud update；Cloud 的协作升级不得等待 Edge 追加本地证据。
- **冲突处理**：若提交 `revision <= lastAcceptedRevision` 且 payload 不同，Cloud 必须返回 `409 REVISION_CONFLICT` 并携带 `lastAcceptedRevision`。

### 11.4.2 Wire Format（冻结件，P0）

**请求体（EventUpdateEnvelope）**

```json
{
  "edge_schema_version": "7.4.2",
  "eventId": "uuid",
  "revision": 5,
  "source": "edge | cloud",
  "updateType": "alarm_state | verification | dispatch | evidence_append | access_policy | note",
  "occurredAt": "2025-12-16T10:15:30Z",
  "payload": { }
}
```

字段约束：
- `edge_schema_version`：发送方实现的 schema 版本（Edge/Cloud 均需填写），用于门控与排障。
- `source`：**事实来源**，必须为 `edge` 或 `cloud`；UI/审计必须展示来源。
- `occurredAt`：事件发生时间（而非接收时间），用于证据链顺序展示。
- `payload`：按 `updateType` 的最小结构（见 11.4.3）。允许扩展字段，但不得破坏既有字段语义。

### 11.4.3 UpdateType 最小载荷（Minimum Payload Shapes）

1) `alarm_state`（Edge→Cloud 为主）
```json
{
  "from": "PRE",
  "to": "PENDING",
  "reason": "entry_trip | follower_accelerated | timer_expired | remote_disarm | service_override",
  "timers": {
    "entryDelayRemainingSec": 18,
    "abortWindowRemainingSec": 30,
    "sirenRemainingSec": 180
  },
  "triggeredEntryPointId": "ep_front_door"
}
```

2) `verification`（Cloud 为主；可由 App/Neighbor 产生）
```json
{
  "result": "CONFIRMED_TRUE | CONFIRMED_FALSE | ON_SCENE_SIGNS_PRESENT | ON_SCENE_NO_SIGNS | ON_SCENE_UNSAFE | NO_ANSWER | EXHAUSTED",
  "actorType": "primary_user | keyholder | neighbor",
  "actorId": "uuid",
  "notes": "string (optional)",
  "evidenceRefs": ["evidence:uuid (optional)"]
}
```
约束：`ON_SCENE_*` 不等价于入户检查；不得引导进入屋内。

3) `dispatch`（Cloud→Edge，可提升或撤回建议）
```json
{
  "dispatchReadinessLocal": 1,
  "dispatchReadinessCollab": 2,
  "dispatchReadinessEffective": 2,
  "dispatchRecommendation": "none | continue_verify | recommend_call_for_service",
  "reason": "avs_ge_2_confirmed | on_scene_no_signs_reduced_certainty | verified_false_alarm | readiness_failed",
  "dispatchScriptLocal15s": "string (optional mirror)",
  "dispatchScriptCollab15s": "string (optional)"
}
```
约束：Cloud 可覆盖/提升 `dispatchRecommendation`；Edge 不得将 Cloud 的建议降级为更弱（除非本地已 `CANCELED` 并记录冲突）。

4) `evidence_append`（Cloud 为主）
```json
{
  "manifestRef": "evidence_manifest:uuid",
  "itemsAppended": 2,
  "sensitivity": "low | medium | high"
}
```

5) `access_policy`（Edge→Cloud；ServiceAccessWindow 触发）
```json
{
  "accessDecision": "AUTHORIZED | UNAUTHORIZED | OVERRIDDEN",
  "activeServiceWindowId": "sw_123 (optional)",
  "overrideReason": "forced_entry_override | restricted_zone_trip | after_hours"
}
```

6) `note`（任一端）
```json
{
  "text": "string",
  "tags": ["string"],
  "visibility": "private | circle"
}
```

### 11.4.4 错误码（最小）

- `400 INVALID_UPDATE`：字段缺失/类型错误
- `401 UNAUTHORIZED_DEVICE`：设备鉴权失败
- `403 SOURCE_NOT_ALLOWED`：source 与 token 类型不匹配（例如 Device token 不能写 cloud update）
- `409 REVISION_CONFLICT`：revision 冲突（返回 lastAcceptedRevision）
- `412 SCHEMA_NOT_ACCEPTED`：schema version 不被接受


### 11.4.5 EventUpdate 权限矩阵（Normative，冻结件）

本节定义 **谁可以提交什么类型的 EventUpdate**，以及 Cloud 必须执行的权限校验。违反权限矩阵的请求必须返回 `403 ACTOR_NOT_PERMITTED`。

#### 字段命名风格（Normative）

- **EventUpdate（Envelope + payload）字段名统一使用 `camelCase`**（与 JSON 常用约定一致），例如：`schemaVersion`, `idempotencyKey`, `updateType`, `actorRole`, `occurredAt`, `payload`。
- **Edge Output Bundle（edge-export-v1）保持既有 `snake_case`**（例如：`edge_schema_version`），两者使用不同 schema 校验。
- **枚举值风格**：
  - `updateType` / `operation` 等流程枚举：`lower_snake_case`（例如：`alarm_state`, `evidence_append`）
  - 动作/结果枚举：`UPPER_SNAKE_CASE`（例如：`REMOTE_DISARM`, `ON_SCENE_SIGNS_PRESENT`）

**约束（Cloud 必须执行）**：
- EventUpdate 请求若出现 `snake_case` 字段名（Envelope 或 payload 内）→ 必须返回 `400 INVALID_FIELD_NAME`。
- Edge export 不受该命名规则影响（使用独立的 edge-export schema 校验）。

#### 角色定义（ActorRole）

| 角色 | 说明 | 典型 Token 类型 |
|------|------|----------------|
| `edge_device` | Edge 硬件设备 | Device Token (mTLS/API Key) |
| `primary_user` | 屋主/同住人（Circle Owner/Admin） | User Token (OAuth) |
| `keyholder` | 授权持钥人（可远程撤防） | User Token + keyholder claim |
| `neighbor` | 互助邻居（opt-in，非同住） | User Token + neighbor claim |
| `cloud_system` | Cloud 后台系统（自动化/定时调度） | Service Token |

#### CircleMember.role → ActorRole 映射（Normative）

| CircleMember.role | ActorRole claim | 启用条件 |
|-------------------|-----------------|----------|
| `owner` | `primary_user` | 创建 Circle 时自动获得 |
| `admin` | `primary_user` | owner 授权 + 强认证绑定 |
| `household` | `primary_user` | owner/admin 邀请 + 接受 + 地址验证（可选） |
| `keyholder` | `keyholder` | owner/admin 邀请 + 接受 + **联系方式验证**（必须） + 强认证绑定 |
| `neighbor` | `neighbor` | owner/admin 邀请 + 接受 + **opt-in 协作协议**（必须）|
| `guest` | ❌ 无 claim | 仅可查看有限信息，不能提交 EventUpdate |

**keyholder 启用条件（必须全部满足）**：
1. 被 owner/admin 显式邀请并标记为 `keyholder`
2. 接受邀请并完成手机号/邮箱验证（用于验证梯队联系）
3. 完成强认证绑定（PIN 或 Biometric），用于 `REMOTE_DISARM` 等敏感操作
4. 签署"远程撤防责任声明"（可选，建议启用）

**neighbor 启用条件（必须全部满足）**：
1. 被 owner/admin 显式邀请
2. 接受邀请并同意"互助协作协议"（含：不入户、安全距离观察、隐私条款）
3. 地理位置验证（可选，建议启用：注册地址与 Circle 地址在合理距离内）

**约束**：
- Token 的 claim 必须与 CircleMember.role 映射结果一致
- claim 升级（如 neighbor → keyholder）需要重新验证并更新 Token
- 任何 CircleMember 被移除后，其 Token 的 claim 必须立即失效

**Token 失效机制（Normative，可验收 SLA）**：

成员移除后 Token 必须在 **≤60s** 内失效，实现必须采用以下机制之一：

| 机制 | 说明 | 最大传播延迟 |
|------|------|-------------|
| **短 TTL + Revocation List**（推荐） | Token TTL ≤15 分钟；敏感操作实时查询 revocation list | ≤15 分钟（普通）/ 实时（敏感） |
| **Token Introspection** | 所有 EventUpdate 操作必须走 token introspection 实时校验 member 状态 | 实时 |
| **Hybrid**（建议） | 短 TTL（5-15 分钟）+ 敏感操作（authorized_action/access_policy）强制 introspection | ≤60s |

**敏感操作定义**：`authorized_action`, `access_policy` 的 `create/update/revoke` 必须实时校验成员状态，不得仅依赖 Token claim。

#### UpdateType × ActorRole 权限矩阵

| updateType | edge_device | primary_user | keyholder | neighbor | cloud_system |
|------------|:-----------:|:------------:|:---------:|:--------:|:------------:|
| `alarm_state` | ✅ | ❌¹ | ❌¹ | ❌ | ❌² |
| `verification` | ❌ | ✅ | ✅ | ✅³ | ✅³ᶜ |
| `dispatch` | ✅⁴ᵃ | ❌ | ❌ | ❌ | ✅⁴ᵇ |
| `evidence_append` | ✅ | ✅ | ✅ | ✅⁵ | ✅ |
| `access_policy` | ✅⁷ᵃ | ✅⁷ᵇ | ❌ | ❌ | ✅⁷ᶜ |
| `note` | ✅⁸ᵃ | ✅⁸ᵇ | ✅⁸ᵇ | ✅⁸ᵇ | ✅⁸ᵃ |
| `authorized_action` | ❌ | ✅ | ✅⁶ | ❌ | ❌ |
| `authorized_action_result` | ✅⁹ᵃ | ❌ | ❌ | ❌ | ✅⁹ᵇ |

**注释**：

1. **alarm_state 仅由 Edge 产生**：用户/keyholder 的远程撤防必须通过 `authorized_action` 下发到 Edge，由 Edge 执行状态转换后上报 `alarm_state` update。禁止绕过 Edge 直接写 alarm_state。

2. **cloud_system 不得写 alarm_state**：避免 Cloud 故障/攻击导致本地报警被静默。

3. **neighbor 的 verification 结果受限**：
   - ✅ 允许：`ON_SCENE_NO_SIGNS`, `ON_SCENE_SIGNS_PRESENT`, `ON_SCENE_UNSAFE`
   - ❌ 禁止：`CONFIRMED_TRUE`, `CONFIRMED_FALSE`（需要入户确认，邻居不得入户）
   - **ON_SCENE_SIGNS_PRESENT 升级约束**（见 §11.4.6）

   **3c) cloud_system 的 verification 结果受限**（避免"云端伪确认"）：
   - ✅ 允许：`NO_ANSWER`, `EXHAUSTED`, `PENDING`（过程性/聚合结果）
   - ✅ 允许：`attempt_log` 类 payload（记录尝试联系日志，见下方结构化定义）
   - ❌ 禁止：`CONFIRMED_TRUE`, `CONFIRMED_FALSE`, `ON_SCENE_*`（人类确认结果必须由人提交）

   **cloud_system attempt_log 结构化定义（Normative）**：
   ```json
   {
     "updateType": "verification",
     "payload": {
       "result": "NO_ANSWER",  // 或 EXHAUSTED / PENDING
       "attemptLog": [
         {
           "attemptNo": 1,
           "recipientType": "primary_user",
           "recipientId": "uuid",
           "channel": "push | sms | call",
           "startedAt": "ISO-8601",
           "endedAt": "ISO-8601",
           "durationSec": 45,
           "result": "no_answer | declined | timeout | delivered | answered",
           "failureReason": "string (optional)"
         }
       ],
       "summary": {
         "totalAttempts": 4,
         "distinctContacts": 2,
         "distinctChannels": 3,
         "lastAttemptAt": "ISO-8601"
       }
     }
   }
   ```
   - `attemptLog[]` 为必填数组（至少 1 条记录）
   - Cloud 必须按此 schema 校验，拒绝自由格式文本

4. **dispatch 字段子集约束（硬约束，schema 级别）**：
   - **4a) edge_device 只能写**：`dispatchReadinessLocal`, `dispatchRecommendationLocal`, `localReason`, `dispatchScriptLocal15s`
   - **4b) cloud_system 只能写**：`dispatchReadinessCollab`, `dispatchReadinessEffective`, `dispatchRecommendationEffective`, `collabReason`, `dispatchScriptCollab15s`
   - Cloud 必须在 schema 校验层拒绝越界字段（而非仅忽略）
   - **计算归属（Normative）**：`dispatchReadinessEffective` 与 `dispatchRecommendationEffective` **只能由 Cloud 计算**，且必须记录 `collabReason`；Edge 只能提供 `local` 估计，不得自行计算或覆盖 `effective` 值

5. **neighbor 的 evidence_append 受限**：
   - **sensitivity 限制**：仅允许 `sensitivity=low|medium`；`sensitivity=high`（室内媒体/敏感信息）需 primary/keyholder 授权
   - **媒体类型限制**：
     - ✅ 允许：外部照片（JPEG/PNG，≤10MB）、短视频（≤15s，≤50MB）、文字备注（≤1000字符）
     - ❌ 禁止：音频录音、长视频（>15s）、室内媒体
   - **sensitivity 定义**：
     - `low`：不含可识别人脸/车牌的外部环境照片
     - `medium`：含可识别人脸/车牌的外部照片/视频（需脱敏处理后方可分发给非 primary 成员）
     - `high`：室内媒体、含敏感个人信息的内容（neighbor 禁止提交）

   **medium 脱敏与降级规则（Normative）**：
   - `sensitivity=medium` 的证据在分发给非 primary 成员前，必须经过脱敏管线（人脸/车牌模糊）
   - **若脱敏管线不可用或处理失败**：默认降级为 **仅 primary 可见**（`visibility=primary_only`），并在 `evidence_append` 响应中注明 `redactionStatus=fallback_primary_only`
   - 禁止在脱敏不可用时将 `medium` 内容分发给 neighbor/keyholder（法律/信任风险）
   - 脱敏完成后的证据可标记 `redactionStatus=redacted`，允许分发

6. **keyholder 的 authorized_action 受限**：
   - ✅ 允许：`REMOTE_DISARM`, `SILENCE_OUTPUTS`
   - ❌ 禁止：`MODE_CHANGE`（仅 primary 可更改布防模式）

7. **access_policy 权限分层**（支持远程 Service Window 配置）：
   - **7a) edge_device**：回报"已应用/版本号/应用失败原因"，或本地配置变更同步；`operation` 限 `applied | sync | failed`
   - **7b) primary_user**：创建/修改/撤销 ServiceAccessWindow、restricted zones 等；`operation` 允许 `create | update | revoke`
   - **7c) cloud_system**：仅用于"定时自动生效/失效"的系统调度；`operation` 限 `schedule_activate | schedule_deactivate`；**不得创建新权限内容，只能执行已存在 policy 的 schedule**

8. **note 类型分层**：
   - **8a) edge_device / cloud_system**：`noteType` 必须为 `system_note`（系统自动注释）
   - **8b) primary_user / keyholder / neighbor**：`noteType` 必须为 `human_note`（人工备注）
   - UI 必须区分展示，避免系统注释被误当人类证词

9. **authorized_action_result 权限分层**：
   - **9a) edge_device**：上报 `status=received | executed | failed`（实际执行结果）
   - **9b) cloud_system**：**仅**允许上报 `status=timeout`（Edge 不可达超时），且 `audit.actorRole` 必须为 `cloud_system`，`failureReason` 必须为 `edge_unreachable_timeout`
   - 用于闭环"授权动作执行审计"（见 §11.4.7）

#### authorized_action 子类型权限

| action | primary_user | keyholder | neighbor | 强认证要求 |
|--------|:------------:|:---------:|:--------:|:----------:|
| `REMOTE_DISARM` | ✅ | ✅ | ❌ | PIN/Biometric |
| `SILENCE_OUTPUTS` | ✅ | ✅ | ❌ | Session |
| `MODE_CHANGE` | ✅ | ❌ | ❌ | PIN/Biometric |
| `CANCEL_VERIFICATION` | ✅ | ✅ | ❌ | Session |
| `EXTEND_ENTRY_DELAY` | ✅ | ✅ | ❌ | Session |

#### 错误码扩展（完整清单）

在 §11.4.4 错误码中追加（**必须全部实现，Contract Tests 依赖**）：

**权限类（403）**：
- `403 ACTOR_NOT_PERMITTED`：actorRole 无权限提交该 updateType
- `403 VERIFICATION_RESULT_NOT_ALLOWED`：该 actorRole 不允许提交该 verification result（如 neighbor 提交 CONFIRMED_TRUE，或 cloud_system 提交 ON_SCENE_*）
- `403 ACTION_NOT_ALLOWED`：该 actorRole 不允许执行该 authorized_action（如 neighbor 提交 REMOTE_DISARM，或 keyholder 提交 MODE_CHANGE）
- `403 SENSITIVITY_NOT_ALLOWED`：该 actorRole 不允许提交该 sensitivity 级别的证据（如 neighbor 提交 sensitivity=high）
- `403 OPERATION_NOT_ALLOWED`：该 actorRole 不允许执行该 access_policy operation（如 cloud_system 提交 create）
- `403 FIELD_NOT_ALLOWED`：该 actorRole 不允许写入该字段（如 edge_device 写 dispatchReadinessEffective）
- `403 STATUS_NOT_ALLOWED`：该 actorRole 不允许上报该状态值（如 edge_device 上报 authorized_action_result.status=timeout）
- `403 NOTE_TYPE_NOT_ALLOWED`：该 actorRole 不允许使用该 noteType（如 edge_device 用 human_note）
- `403 AUDIT_ROLE_MISMATCH`：payload 中的 audit.actorRole 与 Token claims 不一致

**认证类（401）**：
- `401 STRONG_AUTH_REQUIRED`：该动作需要强认证（PIN/Biometric），当前 session 不满足

**请求类（400）**：
- `400 INVALID_UPDATE`：字段缺失/类型错误（含审计字段缺失）
- `400 INVALID_ACTION_ID`：authorized_action_result 的 actionId 不存在或已过期
- `400 INVALID_POLICY_VERSION`：access_policy 的 policyVersion 不合法
- `400 EVIDENCE_EXCEEDS_LIMIT`：evidence_append 超出限制（判定字段：`durationSec` 视频时长 >15s，`bytes` 文件大小超限，`mimeType` 不允许的媒体类型）
- `400 INVALID_FIELD_NAME`：字段命名风格不符合规范（如 payload 内使用 snake_case）
- `400 INVALID_ATTEMPT_LOG`：cloud_system verification 的 attemptLog 结构不符合 schema

**资源类（404）**：
- `404 SERVICE_WINDOW_NOT_FOUND`：schedule_activate/deactivate 引用的 serviceWindowId 不存在

**冲突类（409）**：
- `409 REVISION_CONFLICT`：revision 冲突（返回 lastAcceptedRevision）
- `409 POLICY_VERSION_CONFLICT`：access_policy 版本冲突（返回 currentPolicyVersion）
- `409 ACTION_ALREADY_TERMINAL`：authorized_action_result 已存在终态（executed/failed），拒绝追加新的 result
- `409 ACTION_ALREADY_PROCESSED`：同一 actionId 的 authorized_action_result 已存在

### 11.4.6 neighbor ON_SCENE_SIGNS_PRESENT 升级约束（Normative）

当 `neighbor` 提交 `ON_SCENE_SIGNS_PRESENT` 且该结果用于提升 `dispatchReadinessEffective >= 2` 时，**默认启用以下约束**（可通过 Circle 配置禁用，但需审计记录）：

1. **证据要求（至少满足其一）**：
   - 同一 `eventId` 存在 neighbor 提交的 `evidence_append`（外部照片/短视频，`sensitivity=low|medium`）
   - `verification.payload` 包含 `confidence >= 0.7`

2. **可选地理/到场证明（弱约束，建议启用）**：
   - `verification.payload.location` 与 Circle 地址距离 ≤ 500m
   - 或 `verification.payload.arrivedAt` 时间戳在合理范围内

3. **若不满足约束**：
   - Cloud 仍接受 `ON_SCENE_SIGNS_PRESENT`，但 `dispatchReadinessCollab` 最高 cap 到 **1**
   - `collabReason` 注明 `neighbor_signs_insufficient_evidence`
   - UI 提示 primary_user "邻居观察到异常迹象，但未提供照片/证据，建议确认"

### 11.4.7 authorized_action_result（新增 updateType）

用于闭环"授权动作执行审计"，确保 `authorized_action` 从发起到执行的完整追溯。

**权限（与 §11.4.5 矩阵一致）**：
- `edge_device` ✅：上报 `status=received | executed | failed`（实际执行结果）
- `cloud_system` ✅：**仅**允许上报 `status=timeout`（Edge 不可达超时标记；不得伪造 executed/failed）

#### 11.4.7.1 actionId 生成与幂等规则（Normative，冻结件）

**actionId 由 Cloud 服务端分配并写入账本**，客户端使用 `idempotencyKey` 实现重试去重：

```json
// 客户端提交 authorized_action
POST /events/{eventId}/updates
{
  "updateType": "authorized_action",
  "idempotencyKey": "client-generated-uuid",  // 客户端生成，用于重试去重
  "payload": { "action": "REMOTE_DISARM", ... }
}

// Cloud 响应（分配 actionId）
{
  "revision": 5,
  "actionId": "cloud-assigned-uuid",  // Cloud 分配，全局唯一
  "status": "pending_edge_execution"
}
```

**actionId 账本写入规则（Normative）**：
- Cloud 分配 `actionId` 后，**必须立即将其写入同一条 `authorized_action` 记录的 `payload.actionId` 字段**
- 账本中的 `authorized_action` 记录必须包含 `payload.actionId`，用于后续 `authorized_action_result` 的强一致关联
- 查询 API 必须支持按 `actionId` 检索完整审计链：`authorized_action` → `authorized_action_result` → `alarm_state`

**Wire Format（authorized_action，账本存储格式）**：
```json
{
  "updateType": "authorized_action",
  "revision": 5,
  "payload": {
    "actionId": "cloud-assigned-uuid",  // Cloud 填充，必填
    "action": "REMOTE_DISARM",
    "idempotencyKey": "client-generated-uuid",
    "requestedAt": "ISO-8601",
    "requestedBy": { "actorId": "uuid", "actorRole": "primary_user" }
  }
}
```

**约束**：
- `actionId` 必须由 Cloud 生成并写入账本（服务端分配），禁止客户端自行指定
- 同一 `idempotencyKey` 重试必须返回相同 `actionId`（幂等）
- `actionId` 格式建议：`aa_{eventId}_{revision}` 或 UUID v7（有序）
- `authorized_action_result` 的 `actionId` 必须在账本中存在对应的 `authorized_action` 记录，否则返回 `400 INVALID_ACTION_ID`

#### 11.4.7.2 离线/超时语义（Normative，冻结件）

当 Edge 离线或不可达时：

| 场景 | 谁上报 result | status | Cloud 行为 | UI 显示 | alarm_state 变化 |
|------|--------------|--------|-----------|---------|-----------------|
| Edge 在线，执行成功 | edge_device | `executed` | 记录成功 | "已撤防" | Edge 上报 CANCELED |
| Edge 在线，执行失败 | edge_device | `failed` | 记录失败 | "撤防失败：{reason}" | 无变化 |
| Edge 离线/超时（默认 30s） | **cloud_system** | `timeout` | 记录超时 | "撤防请求未执行（设备离线）" | **无变化** |
| Edge 后续上线补报 | edge_device | `executed/failed` | 更新状态 | 更新显示 | 按实际结果 |

**timeout 上报规则**：
- **由 cloud_system 上报**（而非 edge_device），因为 Edge 不可达时无法自行上报
- `authorized_action_result` 的 `audit.actorRole` 必须为 `cloud_system`
- `failureReason` 必须为 `edge_unreachable_timeout`
- Cloud 必须在超时后立即写入账本，确保 append-only 审计一致性

**硬约束**：
1. **timeout 不改变 alarm_state**：Cloud 不得因超时而假装撤防成功；仅可改变"协作建议/验证流程状态"
2. **真正撤防完成的判定**：必须收到 `authorized_action_result.status=executed`（由 edge_device 上报）**且** 随后收到对应的 `alarm_state` update（`to=CANCELED`）
3. **UI 必须诚实显示状态**：
   - 若仅收到 `authorized_action` 但无 result → "撤防请求已发送，等待设备执行"
   - 若收到 `timeout`（由 cloud_system 上报）→ "撤防请求未执行（设备离线），本地报警可能仍在响"
   - 若收到 `failed` → "撤防失败：{failureReason}"
4. **Cloud 可同时更新协作建议**：即使撤防未执行，Cloud 仍可将 `dispatchRecommendation=none` 并记录审计（表示"协作侧已决定不建议派警"），但必须注明 `reason=timeout_local_alarm_may_continue`

**Wire Format（authorized_action_result）**：

```json
{
  "updateType": "authorized_action_result",
  "payload": {
    "actionId": "cloud-assigned-uuid (必须与 authorized_action.payload.actionId 一致)",
    "action": "REMOTE_DISARM | SILENCE_OUTPUTS | MODE_CHANGE | ...",
    "status": "received | executed | failed | timeout",
    "executedAt": "ISO-8601 (若 executed)",
    "failureReason": "string (若 failed 或 timeout)",
    "resultingAlarmState": "CANCELED | ... (若 executed 且 action 影响 AlarmSM)",
    "executedByAuthMethod": "pin | biometric | session (从 authorized_action 继承，仅 executed 时)"
  }
}
```

**status × actorRole 权限**：

| status | edge_device | cloud_system |
|--------|:-----------:|:------------:|
| `received` | ✅ | ❌ |
| `executed` | ✅ | ❌ |
| `failed` | ✅ | ❌ |
| `timeout` | ❌ | ✅ |

**约束**：
- 每个 `authorized_action` 必须有对应的 `authorized_action_result`
- Edge 超时未响应时，由 Cloud 标记 `timeout`（而非等待）
- `actionId` 必须与账本中已存在的 `authorized_action.payload.actionId` 匹配，否则返回 `400 INVALID_ACTION_ID`
- 审计链路：`authorized_action`（含 actionId）→ `authorized_action_result`（引用 actionId）→ `alarm_state`（最终状态）

#### 11.4.7.3 result 唯一性与终态规则（Normative，冻结件）

为避免 “Cloud 先 timeout，Edge 后续补报 executed/failed” 导致歧义，本节冻结 `authorized_action_result` 的序列规则：

- `status=timeout`：**非终态（non-terminal）**。允许后续追加一条 `executed` 或 `failed`（由 Edge 上报）。
- `status=executed | failed`：**终态（terminal）**。一旦某 `actionId` 出现终态结果：
  - 后续任何 `authorized_action_result`（无论来自 Edge 或 Cloud）都必须返回 `409 ACTION_ALREADY_TERMINAL`。
  - Cloud 必须保留最早到达的终态记录为权威结果（append-only 账本），不得覆盖历史。
- `status=received`：可选的中间态，仅用于“Edge 已收到请求”的审计；不影响终态规则。

**强一致关联**：
- Cloud 必须校验 `authorized_action_result.payload.actionId` 在账本中已存在对应 `authorized_action.payload.actionId`，否则返回 `400 INVALID_ACTION_ID`。

### 11.4.8 access_policy 操作类型约束（Normative）

| operation | primary_user | cloud_system | edge_device |
|-----------|:------------:|:------------:|:-----------:|
| `create` | ✅ | ❌ | ❌ |
| `update` | ✅ | ❌ | ❌ |
| `revoke` | ✅ | ❌ | ❌ |
| `schedule_activate` | ❌ | ✅¹ | ❌ |
| `schedule_deactivate` | ❌ | ✅¹ | ❌ |
| `applied` | ❌ | ❌ | ✅ |
| `sync` | ❌ | ❌ | ✅ |
| `failed` | ❌ | ❌ | ✅ |

**注释**：
1. `cloud_system` 的 `schedule_*` 操作**必须引用已存在的 `serviceWindowId`**，且该 window 的 schedule 已被 `primary_user` 预先配置。Cloud 不得凭空创建新的授权窗口。

#### policyVersion 并发控制（Normative）

`policyVersion` 用于 access_policy 的乐观并发控制：

**规则**：
- `policyVersion` 必须单调递增（从 1 开始）
- 任何 `update/revoke` 操作必须携带 `expectedPolicyVersion`，与当前版本一致才能执行
- 若版本不一致，返回 `409 POLICY_VERSION_CONFLICT`，携带 `currentPolicyVersion`

**schedule_activate/deactivate 的版本绑定**：
- `schedule_*` 操作必须绑定 `targetPolicyVersion`（调度创建时的版本）
- 若执行时 `currentPolicyVersion > targetPolicyVersion`（policy 已被修改/撤销），调度自动失效，不执行
- Cloud 必须记录"调度跳过"审计日志，原因为 `policy_version_outdated`

**冲突场景处理**：
| 场景 | 行为 |
|------|------|
| primary update vs edge sync | primary 优先；edge sync 若版本落后则被拒绝，Edge 需拉取最新版本 |
| primary update vs cloud schedule | primary 优先；schedule 执行时检测版本，过期则跳过 |
| 两个 primary 同时 update | 先到先得（乐观锁），后者收到 409 需重试 |

**Wire Format（access_policy）**：

```json
{
  "updateType": "access_policy",
  "payload": {
    "operation": "create | update | revoke | schedule_activate | schedule_deactivate | applied | sync | failed",
    "serviceWindowId": "uuid",
    "policyVersion": "number (单调递增，当前版本)",
    "expectedPolicyVersion": "number (仅 update/revoke 时，用于乐观锁)",
    "targetPolicyVersion": "number (仅 schedule_* 时，绑定的目标版本)",
    "changes": { ... },  // 仅 create/update 时
    "failureReason": "string (仅 failed 时)",
    "appliedAt": "ISO-8601 (仅 applied 时)"
  }
}
```

### 11.4.9 note 类型分层（Normative）

```json
{
  "updateType": "note",
  "payload": {
    "noteType": "system_note | human_note",
    "text": "string",
    "tags": ["string"],
    "visibility": "private | circle"
  }
}
```

**约束**：
- `edge_device` / `cloud_system` 必须使用 `noteType=system_note`
- `primary_user` / `keyholder` / `neighbor` 必须使用 `noteType=human_note`
- UI 必须视觉区分两类 note（例如 system_note 用灰色/斜体，human_note 用正常样式）
- 审计/训练标注时，`system_note` 不应被当作人类证词
```

---

## 更新 §11.6 Redaction（隐私裁剪）

在现有内容后追加：

```markdown
### 11.6.1 EventUpdate 审计字段（Mandatory）

每条 EventUpdate 必须携带以下审计字段（Cloud 必须无损存储）：

```json
{
  "audit": {
    "actorId": "uuid",
    "actorRole": "primary_user | keyholder | neighbor | edge_device | cloud_system",
    "authMethod": "pin | biometric | session | device_cert | api_key",
    "clientIp": "1.2.3.4 (optional, for user tokens)",
    "clientDeviceId": "uuid (optional)",
    "submittedAt": "ISO-8601"
  }
}
```

约束：
- `actorId` + `actorRole` 必须与 Token claims 一致；Cloud 必须校验，不得信任 payload 自报。
- `authMethod` 用于审计追溯；`authorized_action` 类 update 必须记录强认证方式。
- 审计字段不可被后续 update 覆盖或删除（append-only）。

### 11.6.2 权限校验失败的审计

当 Cloud 拒绝一条 EventUpdate 时，必须：
1. 返回明确错误码（见 §11.4.5）
2. 记录失败审计日志（含 actorId、attemptedUpdateType、reason）
3. 若连续失败 ≥3 次，触发安全告警（可选）
```

---

## 更新 §6.8.1 两类输入

将现有内容更新为：

```markdown
### 6.8.1 两类输入：观察结果 vs 授权动作

- **观察结果（Observation）**：`ON_SCENE_NO_SIGNS / ON_SCENE_SIGNS_PRESENT / ON_SCENE_UNSAFE`
  - 通过 `updateType=verification` 提交
  - 只影响 `dispatchRecommendation/dispatchReadinessLevel`（Cloud effective 值）
  - 不直接推进 AlarmSM，也不直接关闭输出设备
  - **权限**：primary_user / keyholder / neighbor 均可提交（neighbor 受限，见 §11.4.5）

- **授权动作（Authorized Action）**：`REMOTE_DISARM / SILENCE_OUTPUTS / MODE_CHANGE` 等
  - 通过 `updateType=authorized_action` 提交
  - 必须由具备权限的主体发起（见 §11.4.5 权限矩阵）
  - 需要强认证（PIN/Biometric）的动作必须在 payload 中携带认证凭据
  - Cloud 下发到 Edge（通过 WebSocket/Push），由 Edge 执行 AlarmSM 状态变更
  - **权限**：
    - `REMOTE_DISARM / SILENCE_OUTPUTS`：primary_user / keyholder
    - `MODE_CHANGE`：仅 primary_user
    - neighbor **不得执行任何 authorized_action**

重要约束：
- **邻居只能观察，不能撤防**：neighbor 角色只能提交 `ON_SCENE_*` 观察结果，不能直接取消报警或撤防。
- **撤防必须经过 Edge**：即使 Cloud 收到合法的 `REMOTE_DISARM`，也必须下发到 Edge 执行；Cloud 不得直接将 alarm_state 写为 CANCELED。
```

---

## 新增 Contract Tests（§11.7.1 追加）

```markdown
### 权限矩阵测试（必须）

- **CT-PERMISSION-001 Neighbor Cannot Disarm**  
  neighbor token 提交 `updateType=authorized_action, action=REMOTE_DISARM`：必须返回 `403 ACTION_NOT_ALLOWED`。

- **CT-PERMISSION-002 Neighbor Cannot Confirm True**  
  neighbor token 提交 `updateType=verification, result=CONFIRMED_TRUE`：必须返回 `403 VERIFICATION_RESULT_NOT_ALLOWED`。

- **CT-PERMISSION-003 Keyholder Cannot Change Mode**  
  keyholder token 提交 `updateType=authorized_action, action=MODE_CHANGE`：必须返回 `403 ACTION_NOT_ALLOWED`。

- **CT-PERMISSION-004 Cloud Cannot Write AlarmState**  
  cloud_system token 提交 `updateType=alarm_state`：必须返回 `403 ACTOR_NOT_PERMITTED`。

- **CT-PERMISSION-005 Edge Cannot Write Effective Dispatch**  
  edge_device token 提交 `updateType=dispatch` 包含 `dispatchReadinessEffective` 字段：必须返回 `403 FIELD_NOT_ALLOWED`。

- **CT-PERMISSION-006 Cloud Cannot Create AccessPolicy**  
  cloud_system token 提交 `updateType=access_policy, operation=create`：必须返回 `403 OPERATION_NOT_ALLOWED`。

- **CT-PERMISSION-007 Primary Can Create AccessPolicy**  
  primary_user token 提交 `updateType=access_policy, operation=create`：必须成功（200/201）。

- **CT-PERMISSION-008 Cloud Can Schedule Existing Window**  
  已存在 serviceWindowId=X，cloud_system token 提交 `updateType=access_policy, operation=schedule_activate, serviceWindowId=X`：必须成功。

- **CT-PERMISSION-009 Cloud Cannot Schedule Nonexistent Window**  
  cloud_system token 提交 `updateType=access_policy, operation=schedule_activate, serviceWindowId=不存在的ID`：必须返回 `404 SERVICE_WINDOW_NOT_FOUND`。

- **CT-PERMISSION-010 Cloud Cannot Submit ON_SCENE Results**  
  cloud_system token 提交 `updateType=verification, result=ON_SCENE_SIGNS_PRESENT`：必须返回 `403 VERIFICATION_RESULT_NOT_ALLOWED`。

- **CT-PERMISSION-011 Cloud Cannot Submit CONFIRMED Results**  
  cloud_system token 提交 `updateType=verification, result=CONFIRMED_TRUE`：必须返回 `403 VERIFICATION_RESULT_NOT_ALLOWED`。

- **CT-PERMISSION-012 Cloud Can Submit Process Results**  
  cloud_system token 提交 `updateType=verification, result=NO_ANSWER`：必须成功。
  cloud_system token 提交 `updateType=verification, result=EXHAUSTED`：必须成功。

### authorized_action 幂等与审计链测试（必须）

- **CT-ACTION-001 ActionId Server Assigned**  
  primary_user 提交 `authorized_action` 不含 actionId：Cloud 必须在响应中返回 `actionId`。

- **CT-ACTION-002 Idempotency Key Dedup**  
  primary_user 用相同 `idempotencyKey` 重试提交 `authorized_action` 3 次：必须返回相同 `actionId`，只创建 1 条记录。

- **CT-ACTION-003 Action Result Roundtrip**  
  primary_user 提交 `authorized_action`（返回 actionId=A）→ edge_device 提交 `authorized_action_result`（actionId=A, status=executed）：两者必须可关联查询。

- **CT-ACTION-004 Action Result Invalid ActionId**  
  edge_device 提交 `authorized_action_result`（actionId=不存在的ID）：必须返回 `400 INVALID_ACTION_ID`。

- **CT-ACTION-005 Non-Edge Cannot Submit Action Result**  
  primary_user token 提交 `updateType=authorized_action_result`：必须返回 `403 ACTOR_NOT_PERMITTED`。

- **CT-ACTION-006 Timeout Does Not Change AlarmState**  
  提交 `authorized_action` 后 30s 无 Edge 响应：Cloud 标记 `status=timeout`（由 cloud_system 上报），查询 alarm_state 必须无变化。

- **CT-ACTION-007 Executed Requires AlarmState Update**  
  收到 `authorized_action_result.status=executed` 但无后续 `alarm_state` update：UI 查询状态必须显示"执行中/待确认"而非"已撤防"。

- **CT-ACTION-008 Timeout Must Be Submitted By Cloud**  
  edge_device token 提交 `authorized_action_result` with `status=timeout`：必须返回 `403 STATUS_NOT_ALLOWED`。

- **CT-ACTION-009 ActionId Must Be In Ledger**  
  查询 `authorized_action` by `actionId`：必须返回完整记录，且 `payload.actionId` 字段存在。

### note 类型测试（必须）

- **CT-NOTE-001 Edge Must Use SystemNote**  
  edge_device token 提交 `updateType=note, noteType=human_note`：必须返回 `403 NOTE_TYPE_NOT_ALLOWED`。

- **CT-NOTE-002 Neighbor Must Use HumanNote**  
  neighbor token 提交 `updateType=note, noteType=system_note`：必须返回 `403 NOTE_TYPE_NOT_ALLOWED`。

### access_policy 版本控制测试（必须）

- **CT-POLICY-001 Version Conflict**  
  policyVersion=1 时，两个 primary_user 同时提交 `update` with `expectedPolicyVersion=1`：一个成功，另一个返回 `409 POLICY_VERSION_CONFLICT`。

- **CT-POLICY-002 Schedule Skips Outdated Version**  
  创建 schedule（targetPolicyVersion=1）→ primary_user update 到 version=2 → schedule 执行时：必须跳过，记录 `policy_version_outdated`。

- **CT-POLICY-003 Edge Sync Version Behind**  
  edge sync 提交 policyVersion=1 但 Cloud 已有 version=2：返回 `409 POLICY_VERSION_CONFLICT`，携带 currentPolicyVersion=2。

### neighbor evidence 限制测试（必须）

- **CT-EVIDENCE-001 Neighbor Cannot Submit High Sensitivity**  
  neighbor token 提交 `evidence_append` with `sensitivity=high`：必须返回 `403 SENSITIVITY_NOT_ALLOWED`。

- **CT-EVIDENCE-002 Neighbor Video Duration Limit**  
  neighbor token 提交视频 `evidence_append` with duration > 15s：必须返回 `400 EVIDENCE_EXCEEDS_LIMIT`。

### neighbor ON_SCENE_SIGNS 升级约束测试（建议）

- **CT-NEIGHBOR-SIGNS-001 Signs Without Evidence Caps Readiness**  
  neighbor 提交 `ON_SCENE_SIGNS_PRESENT` 但无 `evidence_append`：`dispatchReadinessCollab` 最高为 1。

- **CT-NEIGHBOR-SIGNS-002 Signs With Evidence Allows Upgrade**  
  neighbor 先提交 `evidence_append`（照片），再提交 `ON_SCENE_SIGNS_PRESENT`：`dispatchReadinessCollab` 可升至 2+。

### 审计字段测试（必须）

- **CT-AUDIT-001 Audit Fields Mandatory**  
  提交 EventUpdate 缺少 `audit.actorId` 或 `audit.actorRole`：必须返回 `400 INVALID_UPDATE`。

- **CT-AUDIT-002 Audit ActorRole Must Match Token**  
  primary_user token 提交 EventUpdate 但 `audit.actorRole=neighbor`：必须返回 `403 AUDIT_ROLE_MISMATCH`。

### 字段命名风格测试（必须）

- **CT-FIELD-001 Payload Must Use CamelCase**  
  提交 EventUpdate payload 含 `dispatch_readiness_local`（snake_case）：必须返回 `400 INVALID_FIELD_NAME`。

- **CT-FIELD-002 Top Level Must Use SnakeCase**  
  提交 EventUpdate 顶层含 `edgeSchemaVersion`（camelCase）：必须返回 `400 INVALID_FIELD_NAME`。

### cloud_system attempt_log 测试（必须）

- **CT-ATTEMPT-LOG-001 AttemptLog Must Be Structured**  
  cloud_system 提交 verification with freeform text `attemptLog: "called twice"`：必须返回 `400 INVALID_ATTEMPT_LOG`。

- **CT-ATTEMPT-LOG-002 AttemptLog Schema Validation**  
  cloud_system 提交 verification with `attemptLog[]` missing required field `channel`：必须返回 `400 INVALID_ATTEMPT_LOG`。

### Token 失效测试（建议）

- **CT-TOKEN-001 Removed Member Cannot Submit**  
  移除 CircleMember 后 ≤60s，该成员 token 提交 EventUpdate：必须返回 `401 UNAUTHORIZED` 或 `403 MEMBER_REMOVED`。
```

---

## 版本历史追加

```markdown
| **v7.4.2** | 2025-12-17 | Security：EventUpdate 权限矩阵（§11.4.5）、字段命名风格规范、cloud_system verification 结果限制与 attemptLog 结构化、dispatch 字段子集约束与计算归属、authorized_action actionId 账本写入与幂等规则、离线/超时语义（timeout 由 cloud_system 上报）（§11.4.7）、access_policy 操作分层与 policyVersion 并发控制（§11.4.8）、note 类型分层（§11.4.9）、neighbor evidence 可实现边界与 medium 脱敏降级、neighbor ON_SCENE_SIGNS 升级约束（§11.4.6）、CircleMember→ActorRole 映射与 Token 失效 SLA、完整错误码清单（16 个）、审计字段（§11.6.1）、31 个 Contract Tests |
```

---

## 更新清单

| 位置 | 变更类型 | 内容 |
|------|----------|------|
| 版本历史 | 新增行 | v7.4.2 说明 |
| §6.8.1 | 更新 | 明确 neighbor 权限限制 |
| §11.4.4 | 追加错误码 | 16 个新错误码（完整清单） |
| §11.4.5 | **新增** | 字段命名风格规范 + EventUpdate 权限矩阵（核心，含 9 个注释 + CircleMember 映射 + Token 失效 SLA） |
| §11.4.5 注释 3c | **新增** | cloud_system attemptLog 结构化定义 |
| §11.4.6 | **新增** | neighbor ON_SCENE_SIGNS_PRESENT 升级约束 |
| §11.4.7 | **新增** | authorized_action_result + actionId 账本写入 + 幂等规则 + 离线/超时语义（timeout 归属） |
| §11.4.8 | **新增** | access_policy 操作类型约束 + policyVersion 并发控制 |
| §11.4.9 | **新增** | note 类型分层 |
| §11.6.1 | **新增** | 审计字段规范 |
| §11.6.2 | **新增** | 权限校验失败审计 |
| §11.7.1 | 追加 | 31 个 Contract Tests（26 必须 + 5 建议） |

---

## 实现检查清单

实现时必须验证：

### 字段命名风格
- [ ] 顶层元数据使用 snake_case
- [ ] EventUpdate payload 内部使用 camelCase
- [ ] schema 校验拒绝命名风格不一致的字段

### 权限矩阵
- [ ] Cloud API 校验 actorRole 与 Token claims 一致
- [ ] Cloud API 按权限矩阵拒绝越权请求
- [ ] neighbor 不能提交 CONFIRMED_TRUE/FALSE
- [ ] neighbor 不能提交 authorized_action
- [ ] keyholder 不能提交 MODE_CHANGE
- [ ] alarm_state 仅接受 edge_device source
- [ ] cloud_system 不能写 alarm_state
- [ ] cloud_system verification 仅允许 NO_ANSWER/EXHAUSTED/PENDING，禁止 CONFIRMED_*/ON_SCENE_*
- [ ] cloud_system attemptLog 必须按结构化 schema 校验

### dispatch 字段子集
- [ ] edge_device 的 dispatch 只能包含 Local 字段
- [ ] cloud_system 的 dispatch 只能包含 Effective/Collab 字段
- [ ] 越界字段在 schema 层被拒绝（403 FIELD_NOT_ALLOWED）
- [ ] dispatchReadinessEffective 只由 Cloud 计算，Edge 不得覆盖

### access_policy 分层与版本控制
- [ ] primary_user 可 create/update/revoke
- [ ] cloud_system 只能 schedule_activate/deactivate 已存在的 window
- [ ] edge_device 只能 applied/sync/failed
- [ ] keyholder/neighbor 不能操作 access_policy
- [ ] policyVersion 并发控制（409 POLICY_VERSION_CONFLICT）
- [ ] schedule 执行时检查 targetPolicyVersion，过期则跳过

### authorized_action 幂等与审计链
- [ ] actionId 由 Cloud 服务端分配
- [ ] actionId 写入账本（authorized_action.payload.actionId）
- [ ] idempotencyKey 去重正确
- [ ] edge_device 可提交 status=received/executed/failed
- [ ] cloud_system 只能提交 status=timeout
- [ ] actionId 必须与账本中已存在的 authorized_action 匹配
- [ ] 审计链路完整：authorized_action → authorized_action_result → alarm_state

### 离线/超时语义
- [ ] timeout 由 cloud_system 上报（非 edge_device）
- [ ] timeout 不改变 alarm_state
- [ ] UI 诚实显示"撤防请求未执行"
- [ ] 只有 executed + alarm_state 才算真正撤防完成

### note 类型
- [ ] edge_device/cloud_system 必须用 system_note
- [ ] user/keyholder/neighbor 必须用 human_note
- [ ] UI 区分展示两类 note

### neighbor evidence 限制
- [ ] sensitivity=high 被拒绝
- [ ] 视频时长 >15s 被拒绝
- [ ] 媒体大小限制检查
- [ ] medium 脱敏不可用时降级为 primary_only

### neighbor ON_SCENE_SIGNS 约束
- [ ] 无证据时 dispatchReadinessCollab cap 到 1
- [ ] 有证据时允许升级
- [ ] collabReason 正确标注

### CircleMember 角色映射与 Token 失效
- [ ] keyholder 需联系方式验证 + 强认证绑定
- [ ] neighbor 需 opt-in 协作协议
- [ ] claim 与 CircleMember.role 一致
- [ ] 成员移除后 Token ≤60s 内失效
- [ ] 敏感操作（authorized_action/access_policy）实时校验成员状态

### 审计
- [ ] 每条 EventUpdate 携带完整审计字段
- [ ] actorRole 与 Token 一致性校验
- [ ] 权限校验失败被记录到审计日志
- [ ] Contract Tests 全部通过（26 个必须 + 5 个建议）



## 11.5 Cloud 必存字段最小集合（Mandatory Storage Set）

Cloud 必须无损保存并可读回（round-trip）至少以下字段（用于互助分发与隐私裁剪）：

- `workflowClass`
- `eventType`（例如 intrusion / authorized_access_session / package_*）
- `userAlertLevel` + `dispatchReadinessLevel`
- `accessDecision`（若由 ServiceAccessWindow 产生）+ `activeServiceWindowId`（可选）
- `alarm_state`
- `timers`（entryDelay/abort/siren 及 remaining）
- `event_disposition`
- `avs_assessment`（至少 peak/final + summary）
- `verification_summary`（含 ON_SCENE_* / NO_ANSWER / EXHAUSTED）
- `dispatch_recommendation` + reason
- `dispatch_script_15s`（可选，但建议存）
- `evidence_refs[]` 或 `evidence_manifest_ref`
- `capabilityTier`
- `edge_schema_version`

若 Cloud schema 无法存储新增字段，必须拒绝 ingest/update（避免字段丢失导致协作误判）。


### 11.5.1 `dispatch_script_15s` 生成规范（Edge 端，Normative）

`dispatch_script_15s` 是“面向普通用户可复述”的 15 秒脚本，目的不是向 911 传输证据，而是让用户/协作者在电话中**更接近专业报警话术**（减少信息缺失与混乱）。

约束（硬约束）：
- 目标时长：≤ 15 秒（建议 ≤ 60 个中文字符或 ≤ 60 英文单词的同等信息量）
- 必须可在离线状态生成（不依赖 Cloud）
- SECURITY_HEAVY 且 `dispatchReadinessLevel>=2` **必须生成**；LIFE_SAFETY **必须生成**
- 每次 readiness/verification/disposition 关键变更必须更新脚本并产生 revision（用于审计）

必填信息块（按优先级裁剪，信息不足则用占位）：
1) **地点**：`homeLabel + city`（若用户配置了地址，可追加，但不得强制要求）
2) **事件类型**：Attempted Break-in / Confirmed Intrusion / Smoke / CO / Fire
3) **关键证据**（最多 2 条）：例如 “前门被打开/疑似破坏”、“室内玄关触发运动”
4) **证人/确认源**（最多 1 条）：W1/W2/ON_SCENE_UNSAFE 等
5) **请求**：是否建议请求服务（与 dispatchRecommendation 一致）

模板（示例，Edge 用模板 + 填充生成）：

- Attempted Break-in（无入内证据）  
  “我家（{city}）前门疑似被撬开/打开。我不在家（或正在睡觉），有视频/传感器异常。请记录并请求巡逻协助。”

- Confirmed Intrusion（有入内证据）  
  “我家（{city}）发生入侵：前门打开后室内玄关触发运动。我们无法确认嫌疑人是否仍在屋内，请求警方到场。”

- ON_SCENE_UNSAFE（邻居无法靠近）  
  “邻居已到现场但不安全无法接近，仍有异常迹象。请请求警方协助。”

- Smoke/CO  
  “我家（{city}）触发烟雾/一氧化碳报警，无法确认是否有人受困，请求消防/急救协助。”

Edge 端必须同时输出 `dispatch_script_fields`（结构化字段）以便 Cloud 做本地化/翻译/展示，但 Cloud 不得重写脚本语义：
```json
{
  "scriptVersion": "1",
  "eventLabel": "confirmed_intrusion",
  "locationLabel": "My Home",
  "city": "Calgary",
  "evidenceBullets": ["front_door_open", "foyer_motion"],
  "witnessBullets": ["w1_primary_no_answer", "w2_on_scene_unsafe"],
  "requestLabel": "recommend_call_for_service"
}
```


## 11.6 Redaction（隐私裁剪）最小规则（Normative）

- 通知 payload 以 `eventId` 为主；敏感媒体不直接下发。
- Cloud 在事件详情接口中必须按成员权限裁剪：
  - 默认可见：event meta、explainSummary、时间线摘要
  - 条件可见：trackSummary、verification summary
  - 授权可见：evidence manifest / 媒体访问令牌


## 11.7 Contract Tests（P0，必须纳入 CI）

为避免“先做 Edge 导致网关语义退化”，仓库必须包含最小合同测试（contract tests），用以验证 Edge↔Cloud 的 ingest/update 语义与 round-trip。

### 11.7.1 最小测试集（必须）

- **CT-INGEST-001 Idempotent Upsert**  
  同 `idempotencyKey` 重试 3 次：Cloud 只能创建 1 个事件，eventId 恒定。

- **CT-INGEST-002 Mandatory Set Gate**  
  缺少任一 Mandatory Storage 字段：Cloud 必须拒绝（`412/400`），并给出缺失字段列表。

- **CT-UPDATE-001 Monotonic Revision**  
  `revision=1..N` 顺序提交：Cloud 必须按 revision 追加；读回 ledger 的 lastRevision=N。

- **CT-UPDATE-002 Update Idempotency**  
  同 `(eventId, revision)` 重试：Cloud 必须返回相同结果，不得追加第二条日志。

- **CT-UPDATE-003 Revision Conflict**  
  提交 `revision <= lastAcceptedRevision` 且 payload 不同：必须返回 `409 REVISION_CONFLICT`。

- **CT-ROUNDTRIP-001 Mandatory Round-trip**  
  ingest 后读回事件详情：Mandatory Storage Set 字段值必须与写入一致（含 `alarm_state/timers/dispatchReadiness*` 等）。

### 11.7.2 建议测试（非阻断）

- CT-REDACTION-001：不同成员权限读回同一事件，裁剪结果符合 11.6。
- CT-OFFLINE-EXPORT-001：Edge export bundle 通过 schema 校验，且可被 Cloud 批量 ingest 回放。


## 11.8 Edge Output Bundle（edge-export-v1）

Edge 必须支持导出标准事件包（用于离线回放、合同测试、Cloud 批量补传）：

```json
{
  "format": "edge-export-v1",
  "edge_schema_version": "7.4.2",
  "exportedAt": "ISO-8601",
  "device": { "edgeDeviceId": "uuid", "capabilityTier": "V|E|N" },
  "events": [
    {
      "eventId": "uuid",
      "idempotencyKey": "string",
      "circleId": "uuid",
      "workflowClass": "security_heavy|suspicion_light|life_safety|logistics",
      "occurredAt": "ISO-8601",
      "alarm": { "state": "PENDING|TRIGGERED|...", "timers": {...} },
      "disposition": "...",
      "avs": {...},
      "verification": {...},
      "dispatch": { "recommendation": "...", "script15s": "..." },
      "evidenceRefs": ["..."]
    }
  ],
  "updates": [
    { "eventId": "uuid", "revision": 1, "patch": {...}, "at": "ISO-8601" }
  ]
}
```

合同测试（最低要求）：
- Edge 输出必须通过 JSON Schema 校验；
- Cloud ingest 后读回必须 round-trip；
- Cloud 不支持 schema version 必须拒绝（版本门控）。

---



# 附录 A：Drill Schema v2.3.4（对齐 v7.4.1）

## A.1 Wire Format 规范

```
枚举值 Wire Format:
- JSON/Drills 使用 UPPERCASE: "CONFIRMED_TRUE", "TRIGGERED", "EXHAUSTED"
- 内部代码使用 lowercase enum values
- Runner 负责在读取 Drills 时进行大小写转换

示例:
  Drills JSON:    {"expectedResult": "CONFIRMED_TRUE"}
  Runner 读取后:  verification_result = VerificationResult.CONFIRMED_TRUE
  内部值:         "confirmed_true"
```

## A.2 必填字段

Drill Schema v2.3.4 对 v7.4.1 的新增断言字段如下（**当 `expected.shouldCreateEvent=true` 时必须提供**）：

- `expected.workflowClass`
- `expected.userAlertLevel`
- `expected.dispatchReadinessLevel`

基础必填（所有 case）：
- `caseId`
- `title`
- `mode`
- `signals`
- `expected.shouldCreateEvent`

可选字段（用于覆盖特殊场景）：
- `activeServiceWindowId`（启用临时授权窗口，用于施工/维护场景；参见 §1.3.1）

全局假设（suite-level，可选）：
- `assumptions.serviceAccessWindows`：可被 `activeServiceWindowId` 引用的窗口配置集合。

```typescript
interface DrillCase {
  caseId: string;
  title: string;
  mode: "disarmed" | "home" | "away" | "night";
  // Optional: activates a ServiceAccessWindow for this case (see §1.3.1)
  activeServiceWindowId?: string;
  signals: Signal[];

// Optional: cloud/collaboration updates applied after ingest (see §11.0)
updates?: EventUpdate[];

  expected: {
    shouldCreateEvent: boolean;

    // Required when shouldCreateEvent=true
    workflowClass?: "security_heavy" | "suspicion_light" | "life_safety" | "logistics";
    userAlertLevel?: 0 | 1 | 2 | 3;
    dispatchReadinessLevel?: 0 | 1 | 2 | 3;

    // ... other assertions
  };
}
```

```ts
type EventUpdate = {
  t: number; // seconds from T=0
  source: "cloud" | "edge";
  updateType:
    | "verification_result"
    | "evidence_append"
    | "recommendation_override"
    | "withdrawal_suggestion"
    | "authorized_action";
  payload?: Record<string, any>;
};
```


说明：
- 对于 `shouldCreateEvent=false`，上述三个字段可省略或写为 `0/none`（Runner 允许两种写法）。
- 本 PRD 建议 Runner 同时支持 `expected.userAlert` / `expected.dispatchReadiness` 的更细粒度断言（peak/final），但不作为 v2.3.4 的硬必填。



## A.3 断言字段完整定义

```typescript
interface Expected {
  shouldCreateEvent: boolean;
  
  alarmSM?: {
    expectedTransitions?: Array<{
      state: "QUIET" | "PRE" | "PENDING" | "TRIGGERED" | "CANCELED" | "RESOLVED";
      atOrBeforeSec: number;
      reason?: string;
    }>;
    mustNotReach?: string[];
    minStateReached?: string;
    allowedEscalation?: string[];
  };
  
  eventDisposition?: {
    expected: "active" | "resolved_timeout" | "canceled_before_trigger" | 
              "canceled_after_trigger" | "canceled_after_abort" | 
              "verified_false" | "verified_true";
  };
  
  avsAssessment?: {
    peakLevel?: number;
    finalLevel?: number;
    minFinalLevel?: number;
    expectedPresenceTier?: number;
    expectedThreatTier?: number;
    mustNotReach?: number[];
  };
  
  verification?: {
    expectedResult?: "PENDING" | "CONFIRMED_TRUE" | "CONFIRMED_FALSE" | 
                     "UNCERTAIN" | "NO_ANSWER" | "EXHAUSTED";
    expectedToRun?: boolean;
    expectedDistinctContacts?: number;
    stoppedByCancel?: boolean;
    attemptLogAssertions?: {
      minAttempts?: number;
      expectedSequence?: Array<{
        recipientType: string;
        channel: string;
        status: string;
        response?: string;
      }>;
      stopReason?: string;
      resultSource?: string;
    };
  };
  
  dispatchRecommendation?: {
    shouldRecommendCallForService: boolean | "conditional";
    condition?: string;
    expectedReason?: string;
  };
  
  concurrentBehavior?: {
    eventsCreated?: number;
    mergeStrategy?: "merge" | "separate";
    zonesInvolved?: string[];
    primaryEntryPoint?: string;
    primaryZoneType?: string;
  };
  
  outputDevices?: {
    siren?: {
      activatedAtSec?: number;
      stoppedAtSec?: number;
      stopReason?: "timeout" | "user_cancel" | "resolved";
    };
  };
  
  offlineBehavior?: {
    localAlarmActivated?: boolean;
    eventQueuedForIngest?: boolean;
    ingestIsIdempotent?: boolean;
  };
  
  audit?: {
    outputStopRecorded?: boolean;
    verificationStopRecorded?: boolean;
    cancelReasonRecorded?: boolean;
  };
}
```

## A.4 State Enums (Wire Format)

| Enum | JSON Wire Format | Internal Value |
|------|------------------|----------------|
| AlarmState | `"TRIGGERED"` | `triggered` |
| EventDisposition | `"canceled_after_trigger"` | `canceled_after_trigger` |
| VerificationResult | `"CONFIRMED_TRUE"` | `confirmed_true` |
| ZoneType | `"ENTRY_EXIT"` | `ENTRY_EXIT` |

## A.5 Deprecated 字段

- `requireECV`：兼容别名，等价 `requireDCV`（DCV）。
- `ecvMinAttempts`：兼容别名，等价 `dcvMinAttempts`。


- `networkState` → 使用 `system: network_down/up` signals
- `reconnectAtSec` → 使用 `system: network_up` signal

---

# 附录 B：CP-01 约束

```python
CP01_COMBINED_MAX_SEC = 60

def validate_cp01(entry_delay, abort_window):
    if entry_delay + abort_window > CP01_COMBINED_MAX_SEC:
        raise ConfigValidationError("CP-01 violation")
```

---

# 附录 C：AVS Cancellation 语义速查

| Disposition | avs_final | Dispatch | UI Display |
|-------------|-----------|----------|------------|
| `canceled_before_trigger` | **0** | none | "Event Canceled" |
| `canceled_after_trigger` | **= peak** | none | "Event Canceled" |
| `canceled_after_abort` | **= peak** | none | "Event Canceled" |
| `verified_false` | 0 | none | "Verified False Alarm" |
| `verified_true` | computed | recommend | "Verified Intrusion" |
| `active` | computed | varies | "Alarm (AVS X)" |

---

**文档结束**

*NG Edge PRD v7.4.2 Integrated - Single Source of Truth*
