# PRD增补章节：Entry Point 证据累积引擎与置信度体系（改进篇章）
**适用版本：** NeighborGuard PRD v6.0（2025.12-v6.0-Complete）  
**章节性质：** v6.0 增补/替换“事件检测参数（第7章）”中与 Candidate→Confirmed、Path/Chain 规则、Signal Min、评分权重相关的底层算法描述；并补齐可解释性与自学习闭环。  
**目标：** 在不牺牲工程可控性的前提下，实现“链条很长但可早预警、较确定时再报警”的专业安防体验，降低误报、提升响应速度，并提供可审计解释。

---

## 7.x Entry Point Hypothesis Engine（EPHE）：在线证据累积与双阈值触发

### 7.x.1 背景与问题
现有“Path/Chain + Candidate/Confirmed 规则”在以下场景会出现体验缺口：
- **链条较长**（Outdoor → Entry → Indoor），若等待链条完成再触发会导致报警滞后；
- **传感器质量差异大**（不同房屋/安装位/品牌），固定权重容易产生“过敏/迟钝”；
- **模式改变行为分布**（HOME/AWAY/NIGHT/DISARM），单一规则难以覆盖，边界条件多；
- **解释性与可迭代冲突**：提升效果往往引入概率与学习，但需要保留“为什么触发”的可审计解释。

---

### 7.x.2 核心设计：以 Entry Point 为单位的“入侵假设”在线判定
**定义：EntryPointHypothesis（EPH）**  
每个 Entry Point（例如 Front Door / Back Door / Garage / Basement Window）维护一份在线状态与累积证据，用于持续估计“该入口正发生入侵”的置信度。

- **输入：** NGSignal（归一化信号）  
- **归因：** 优先 `entryPointId`；否则按 `zoneId` → EntryPoint Mapping 归入候选入口（详见 3.6 Topology Builder）
- **输出：** Candidate/Confirmed（对应 Pre-intrusion / Alarm State Machine 的触发条件），以及可解释的证据账本

---

### 7.x.3 EPH 状态机（不等待链结束）
EPH 内部状态（每个 Entry Point 独立运行）：
- `IDLE`：无有效证据
- `WATCH`：出现轻度可疑信号，开始累积与衰减
- `PREALERT`：达到预警阈值（软提醒、强化采样、标记录像）
- `ALARM`：达到报警阈值（进入 PENDING/TRIGGERED 流程，见第15章）
- `RESOLVED`：事件结束（归档与学习）

**触发原则：双阈值 + 滞回（Hysteresis）**
- `posterior >= T_pre(mode, entryPoint)` → `WATCH → PREALERT`
- `posterior >= T_alarm(mode, entryPoint)` → `PREALERT → ALARM`
- `posterior <= T_clear` 且 `idleTimeout` → 回到 `IDLE/RESOLVED`

> 说明：这实现“到阈值即可预警、较确定时再报警”，无需等待完整链条结束。

---

## 7.y 证据分数模型：衰减累积（默认）与 SPRT 兼容

### 7.y.1 默认算法：衰减加权证据分数（Deterministic, Tunable）
EPH 维护一个连续 `score`（可为实数），并在时间上指数衰减：
- **衰减：** `score = score * exp(-(now-lastUpdate)/tau)`  
- **累积：** `score += Σ contribution(signal_i)`

映射到 [0,1] 的置信度（便于阈值与 UI 展示）：
- `posterior = sigmoid(score) = 1/(1+exp(-score))`

#### 单条信号贡献：Contribution 的可解释分解
```
contribution =
  baseWeight(sensorType, eventType)
  × effectiveConfidence(signal, sensor)
  × modeMultiplier(mode, eventType)
  × chainBonus(entryPointChainState)
  × contextMultiplier(timeOfDay, occupancy, weatherOptional)
  - negativeEvidencePenalty(optional)
```

**关键点：**
- `baseWeight` 是“事件语义强度”（如玻璃破碎 > 门磁 > 室内动 > 户外动）
- `effectiveConfidence` 由“单次信号置信度 × 设备长期可靠度”构成（见 7.z）
- `chainBonus` 用于体现链条顺序/时间窗匹配，但不作为硬门槛（缺失不会阻断，只是少加成）
- `negativeEvidencePenalty` 用于引入“反证/上下文抑制”（如合法开门、presence、服务模式）

---

### 7.y.2 可选升级：SPRT（序贯概率比检验）兼容层
为未来统计化改进预留：将 `score` 解释为对数似然比（LLR）累积：
- `score = Σ log( P(obs|intrusion) / P(obs|normal) )`  
并使用上下阈值快速做出“继续观察/报警/清除”决策。

**本版本要求：**
- 默认仍采用 7.y.1 的确定性打分；  
- 参数结构需兼容 SPRT：允许为 sensorType 或 signalType 配置 `p1/p0`（见 7.z.6）。

---

## 7.z 传感器与信号置信度体系（可控自学习 + 可解释）

### 7.z.1 两层置信度拆分（必须）
为兼顾效果与解释性，将“置信度”拆成两层并明确来源：

1) **SignalConfidence（单次触发置信度）** `c_signal ∈ [0,1]`  
- 来自摄像头 AI、声学模型等可输出概率的源；  
- 二值传感器（门磁/PIR）默认 `c_signal = 1.0`（不做伪概率）。

2) **SensorReliability（设备长期可靠度）** `r_sensor ∈ [0,1]`  
- 表示该设备在本家庭、该安装位下的长期可信程度；  
- 可由先验 + 健康度修正 + 用户反馈学习得到。

最终用于引擎的：
- `effectiveConfidence = c_signal × r_sensor × healthMultiplier × contextMultiplier`

---

### 7.z.2 Bootstrap 先验（默认值可配置）
系统需提供每类传感器的默认先验区间（工程建议初值）：
- Door Contact：0.90–0.99  
- Glass Break（Acoustic）：0.70–0.90  
- Indoor PIR：0.60–0.85  
- Outdoor PIR：0.40–0.70  
- Vibration/Shock：0.50–0.80  
- Camera AI（person/vehicle）：0.50–0.90（随光照/夜视/逆光动态修正）

> UI：Devices Tab 展示 `reliabilityBase` 与 `reliabilityCurrent`，并提供“恢复默认/锁定不学习”。

---

### 7.z.3 健康度修正（客观、可解释）
对 `r_sensor` 叠加健康度因子（乘法模型），例如：
- `batteryLowPenalty`：电量过低 → 下调
- `connectivityPenalty`：掉线频繁 / RSSI/LQI 差 → 下调
- `tamperPenalty`：防拆触发、遮挡检测 → 下调或提升告警（按策略）
- `environmentPenalty`（可选）：风雪/强光/雨等导致特定传感器误报上升 → 下调

系统需记录每次修正原因，供解释与故障排查（附录E）。

---

### 7.z.4 自学习更新（仅针对 SensorReliability，慢变、可回滚）
数据来源：Feedback 闭环（第13章）与事件最终状态（TP/FP/MISS）。

**推荐更新方式：Beta-Bernoulli（稳定、抗小样本波动）**
- 对每个 sensor 维护 `tpCount / fpCount`（以“参与过的 confirmed alarm 事件”为粒度）
- `reliabilityCurrent = (α + tp) / (α + β + tp + fp)`

默认先验建议：`α=8, β=2`（初始约 0.8，且前期不易被少数样本拉爆）

**约束（Guardrails，必须）：**
- `minSamplesToLearn`（如 10）之前不更新或轻微更新
- `reliabilityClamp`（如 [0.40, 0.95]）防止极端漂移
- `maxDeltaPerWeek`（如 0.05）限制变化速率
- 支持“冻结学习”（锁定某设备）

---

### 7.z.5 置信度校准（仅对概率型来源）
摄像头/声学模型输出的 `confidence` 往往未校准（0.8 不等于 80%）。
要求：
- 在 Edge 侧支持 **简单校准层**（如分段/Platt/温度缩放中的任一轻量实现）
- 校准曲线由本地统计 + 反馈数据更新
- UI 提供“校准状态：未校准/正在校准/已校准”提示

> 备注：该校准不改变 NGSignal ABI 的兼容性，仅影响内部 `c_signal` 的解释与阈值稳定性。

---

### 7.z.6 SPRT 兼容参数（可选字段）
为未来切换到 LLR/SPRT 预留以下可选配置（默认可空）：
- `p1 = P(trigger | intrusion)`  
- `p0 = P(trigger | normal)`  
当存在时，可将 `contribution` 替换为 `log(p1/p0)`（并叠加模式倍率对 `p0` 的修正）。

---

## 7.w Chain/Path 加成规则（Topology 驱动，但不硬门槛）

### 7.w.1 Chain 命中定义
EntryPoint Chain 由 Topology Builder 编排（3.6），每条边包含：
- `fromNode → toNode`
- `expectedSignals[]`（可匹配的 sensorType/signalType）
- `timeWindowSec`（期望到达时窗）
- `bonusWeight`（命中加成）
- `decayPolicy`（命中后加成持续多久）

### 7.w.2 加成原则（必须）
- 命中顺序与时窗 → 加成更高（加速进入 PREALERT/ALARM）
- 缺失某环节不阻断（只是不加成）
- 多条链可并行（例如 Front Door 与 Side Door 同 zone），但每个 EPH 独立判定

---

## 7.v 可解释性（必须交付）：Evidence Ledger + “为什么触发”
为解决“算法升级导致解释性下降”的风险，要求每个 PREALERT/ALARM 事件都可给出审计解释。

### 7.v.1 Evidence Ledger（事件证据账本）
在事件生命周期内记录：
- Top contributors（默认前 5 条证据）
- 每条证据的分解：`baseWeight / c_signal / r_sensor / modeMultiplier / chainBonus / timeDelta`
- 触发时刻的 `posterior`、阈值 `T_pre/T_alarm`、衰减参数 `tau`
- 负证据/抑制原因（如合法开门、用户在家、服务模式）

### 7.v.2 UI 展示要求（Edge Console）
- Events → Event Detail：显示“为什么预警/为什么报警”的自然语言摘要 + 可展开的贡献明细
- Signals ↔ Event ↔ Device：支持跳转查看“该设备近期可靠度变化”和“该信号贡献”
- Devices Tab：展示 reliability 趋势与“最近一次下调原因”（掉线/电量/误报反馈等）

---

## 7.u 参数与配置（新增/更新项清单）
在第7章“事件检测参数”与附录B JSON 模板中新增/扩展以下配置：

### 7.u.1 全局参数
- `ephe.tauSec`：证据衰减时间常数（默认 90–180s）
- `ephe.idleTimeoutSec`：无证据回收时间（默认 5–10min）
- `ephe.minSamplesToLearn`、`reliabilityClamp`、`maxDeltaPerWeek`
- `ephe.enableSprtMode`（默认 false）

### 7.u.2 按模式阈值（必须）
- `thresholds[mode].T_pre`
- `thresholds[mode].T_alarm`
- `thresholds[mode].T_clear`

### 7.u.3 按传感器类型权重
- `baseWeight[sensorType][eventType]`
- `modeMultiplier[mode][eventType]`

### 7.u.4 Chain 加成配置
- `chain.edges[].timeWindowSec`
- `chain.edges[].bonusWeight`

### 7.u.5 置信度与可靠度字段（设备级）
- `device.reliabilityBase`
- `device.reliabilityCurrent`
- `device.learningLocked`

---

## 7.t 测试与评估（Drills 扩展）
在第12章 Drills & Tests 中新增覆盖项（至少 8 条）：
1) 长链条：Outdoor → Entry → Indoor，验证 PREALERT 早于 ALARM，且无需链完成  
2) 误报抑制：Home 模式下门磁+室内动不应进入 ALARM  
3) Away/Night 加敏：同信号序列在 Away/Night 更快进入 PREALERT/ALARM  
4) 可靠度学习：同一 PIR 连续被标注 FP 后，触发贡献降低  
5) 健康度修正：掉线频繁导致贡献降低（但仍记录信号）  
6) Chain 加成：命中时窗顺序加成生效；错序/超窗加成降低  
7) 滞回：posterior 在阈值附近波动不应反复通知  
8) Evidence Ledger：触发事件必须生成可解释贡献列表

评估指标（Edge 本地统计 + 可上传云端汇总，可选）：
- 每户每周误报次数（nuisance rate）
- 报警 Precision（用户确认 TP 比例）
- 预警提前量（prealert lead time）
- 强组合触发覆盖率（漏报代理）

---

## 7.s 兼容性与迁移
- 不改变 NGSignal/NGEvent 的既有必填字段；新增字段均为可选扩展（向后兼容）
- 未配置的家庭：系统使用默认先验与阈值（等价于“非学习版”）
- 允许一键“重置学习状态”（清空 tp/fp 统计并恢复 reliabilityBase）

---

## 7.r 非目标（明确 Out of Scope）
- 不引入端侧大模型/黑箱深度学习作为 P0 依赖
- 不在 v6.0 强制要求用户标注大量数据；学习以“自然反馈”为主
- 不以“预测身份/人脸”作为必要输入（仅作为未来扩展）

---
