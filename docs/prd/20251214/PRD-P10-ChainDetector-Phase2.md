# PRD: Chain Detector Phase 2 - 证据累积与信号权重

**版本：** P10-Phase2  
**状态：** Draft  
**适用于：** NeighborGuard Edge v0.5.0+  
**基于：** NG-PRD-v6.0-Improvement-EventEngineConfidence.md (EPHE 规范)

---

## 1. 背景与目标

### 1.1 当前状态 (Phase 1)

当前 `ChainDetector` 实现了基本的链式检测：
- ✅ 以 Entry Point 为单位检测
- ✅ 链中传感器匹配计数
- ✅ Pre-Alert / Warning / Confirmed 三级警报
- ✅ 顺序检查 (is_in_order)
- ✅ 模式感知 (Disarmed/Home/Away/Night)

**问题：**
1. **所有信号等权** — 室外 PIR 误报 = 玻璃破碎，不合理
2. **无时间衰减** — 5分钟前的信号和刚发生的信号权重相同
3. **离散计数** — 只计算"匹配了几个传感器"，不考虑信号强度和密度

### 1.2 Phase 2 目标

实现 EPHE 规范中的核心功能，提升：
- **降噪**：低可靠度传感器的误报不会轻易触发警报
- **可靠性**：高权重信号（如玻璃破碎）得到应有的重视
- **及时性**：高密度真实入侵信号快速累积，更快触发

---

## 2. 核心设计

### 2.1 证据分数模型

每个 Entry Point 维护一个连续的 `score`（证据分数），而非离散的匹配计数。

#### 2.1.1 分数衰减

```python
# 每次更新时，先对现有分数进行指数衰减
score = score * exp(-(now - last_update) / tau)

# 默认 tau = 90 秒
# 含义：90秒后分数衰减到约 37% (1/e)
```

**参数：**
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `tau` | 90s | 衰减时间常数 |
| `idle_timeout` | 300s | 无新信号时重置为 IDLE |

#### 2.1.2 分数累积

```python
# 每收到一个信号，累加其贡献
score += contribution(signal)

# 贡献计算
contribution = base_weight[sensor_type] 
             × signal.confidence 
             × mode_multiplier[mode]
             × chain_position_bonus
```

#### 2.1.3 分数 → 置信度映射

```python
# 使用 sigmoid 将分数映射到 [0, 1]
posterior = 1 / (1 + exp(-score))

# 或简单线性映射（更直观）
posterior = min(score / score_max, 1.0)
```

### 2.2 信号类型权重 (baseWeight)

不同传感器类型的信号具有不同的"入侵证据强度"：

| 传感器类型 | 信号类型 | baseWeight | 理由 |
|------------|----------|------------|------|
| **glass_break** | glass_break | **2.5** | 几乎无误报，强入侵信号 |
| **door/window** | door_open | **1.8** | 明确事件，低误报 |
| **camera** | person | **1.2** | AI 检测，有一定误报 |
| **camera** | vehicle | **0.8** | 常见，不一定是威胁 |
| **motion (indoor)** | motion | **1.0** | 室内运动，中等可靠 |
| **motion (outdoor)** | motion | **0.6** | 室外 PIR，高误报率 |
| **vibration** | vibration | **1.5** | 较可靠 |
| **smoke** | smoke | **3.0** | 安全关键，最高权重 |

**配置格式：**
```python
BASE_WEIGHTS = {
    # (sensor_type, signal_type): weight
    ("camera", "person"): 1.2,
    ("camera", "vehicle"): 0.8,
    ("camera", "motion"): 0.6,
    ("door", "door_open"): 1.8,
    ("door", "door_close"): 0.3,
    ("window", "door_open"): 1.8,
    ("motion", "motion"): 1.0,  # 室内默认
    ("glass_break", "glass_break"): 2.5,
    ("smoke", "smoke"): 3.0,
}

# 室外 PIR 降权
OUTDOOR_MOTION_WEIGHT = 0.6
```

### 2.3 三区域类型 (Zone Location Type)

为了正确处理门磁等边界传感器，系统采用三区域类型：

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   OUTDOOR          ENTRY           INDOOR           │
│   (室外)           (边界)          (室内)            │
│                                                     │
│   - 室外摄像头      - 门磁          - 室内运动        │
│   - 车道PIR        - 窗磁          - 室内摄像头       │
│   - 围栏传感器      - 玻璃破碎       - 烟雾探测器      │
│   - 室外运动        - 门锁传感器                      │
│                                                     │
└─────────────────────────────────────────────────────┘
         ↓              ↓              ↓
      入侵接近        入侵进入        入侵确认
```

**区域类型定义：**

| 类型 | 英文 | 说明 | 典型传感器 |
|------|------|------|------------|
| 室外 | `outdoor` | 房屋外部区域 | 室外摄像头、车道PIR、围栏传感器 |
| 边界 | `entry` | 房屋入口边界 | 门磁、窗磁、玻璃破碎、智能门锁 |
| 室内 | `indoor` | 房屋内部区域 | 室内运动、室内摄像头、烟雾探测器 |

**为什么门磁不能算室内？**

```
场景: Home 模式下有人从前门闯入

如果门磁 = indoor (室内):
  outdoor_cam 检测人 → Pre-Alert
  door_sensor 开门 → 被忽略 (indoor multiplier=0) ❌
  结果: 永远卡在 Pre-Alert，无法确认入侵！

如果门磁 = entry (边界):
  outdoor_cam 检测人 → 贡献 1.0
  door_sensor 开门 → 贡献 1.2 ✅
  结果: 正确触发 Warning/Alarm
```

### 2.4 模式乘数 (modeMultiplier)

不同模式下，三种区域的信号权重不同：

| 模式 | outdoor | entry | indoor | 说明 |
|------|---------|-------|--------|------|
| **DISARMED** | 0.0 | 0.0 | 0.0 | 完全不监控 |
| **HOME** | 1.0 | 1.2 | 0.0 | 监控室外+边界，忽略室内 |
| **AWAY** | 1.2 | 1.5 | 1.5 | 全面监控，边界和室内加权 |
| **NIGHT** | 1.0 | 1.3 | 1.2 | 类似AWAY，稍低敏感度 |

**模式行为说明：**

| 模式 | 典型场景 | 监控逻辑 |
|------|----------|----------|
| **DISARMED** | 日常在家 | 不检测任何入侵 |
| **HOME** | 白天在家 | 检测外部接近+门窗打开，忽略室内走动 |
| **AWAY** | 外出/度假 | 全面高敏感度监控 |
| **NIGHT** | 夜间睡眠 | 全面监控，室内稍低（允许起夜） |

**Home 模式详细逻辑：**
- ✅ 室外摄像头检测到人 → 贡献计入
- ✅ 门磁/窗磁触发 → 贡献计入 (边界!)
- ✅ 玻璃破碎 → 贡献计入 (边界!)
- ❌ 室内运动 → 忽略 (家人走动)
- ❌ 室内摄像头 → 忽略

### 2.4 链位置加成 (chainPositionBonus)

信号在链中的位置影响其贡献：

```python
def chain_position_bonus(sensor_id, chain, triggered_history):
    """
    如果信号按链顺序触发，给予加成
    """
    position = chain.index(sensor_id)
    
    # 检查前序传感器是否已触发
    predecessors_triggered = all(
        pred in triggered_history 
        for pred in chain[:position]
    )
    
    if predecessors_triggered:
        return 1.3  # 顺序正确，30% 加成
    else:
        return 1.0  # 无加成
```

### 2.5 阈值与状态转换

#### 2.5.1 双阈值触发

```python
# 阈值定义 (可按模式配置)
THRESHOLDS = {
    "away": {
        "T_pre": 1.5,    # Pre-Alert 阈值
        "T_alarm": 3.5,  # Alarm 阈值
        "T_clear": 0.5,  # 清除阈值
    },
    "home": {
        "T_pre": 2.0,    # Home 模式更高阈值
        "T_alarm": 4.0,
        "T_clear": 0.5,
    },
    "night": {
        "T_pre": 1.5,
        "T_alarm": 3.5,
        "T_clear": 0.5,
    },
}
```

#### 2.5.2 状态机

```
IDLE ──(score >= T_pre)──→ PRE_ALERT ──(score >= T_alarm)──→ ALARM
  ↑                            │                               │
  │                            │                               │
  └──(score < T_clear)─────────┴───────(score < T_clear)───────┘
```

**状态定义：**
| 状态 | 条件 | 行为 |
|------|------|------|
| IDLE | score < T_pre | 无动作 |
| PRE_ALERT | T_pre ≤ score < T_alarm | 创建 Pre-Alert 事件，开始录像增强 |
| ALARM | score ≥ T_alarm | 创建 Confirmed 事件，触发警报流程 |

---

## 3. 数据结构

### 3.1 EntryPointState (新增)

每个 Entry Point 维护运行时状态：

```python
@dataclass
class EntryPointState:
    entry_point_id: str
    score: float = 0.0
    last_update: datetime = None
    state: EPState = EPState.IDLE  # IDLE, PRE_ALERT, ALARM
    triggered_sensors: list[str] = field(default_factory=list)
    evidence_ledger: list[EvidenceEntry] = field(default_factory=list)
```

### 3.2 EvidenceEntry (新增)

证据账本条目，用于可解释性：

```python
@dataclass
class EvidenceEntry:
    timestamp: datetime
    signal_id: str
    sensor_id: str
    sensor_type: str
    signal_type: str
    raw_confidence: float      # 原始信号置信度
    base_weight: float         # 基础权重
    mode_multiplier: float     # 模式乘数
    chain_bonus: float         # 链位置加成
    final_contribution: float  # 最终贡献 = 以上相乘
    score_before: float        # 累加前的分数
    score_after: float         # 累加后的分数
```

### 3.3 配置结构

```python
@dataclass
class ChainDetectorConfig:
    # 衰减参数
    tau_seconds: float = 90.0
    idle_timeout_seconds: float = 300.0
    
    # 阈值 (按模式)
    thresholds: dict[str, dict[str, float]] = field(default_factory=lambda: {
        "away": {"T_pre": 1.5, "T_alarm": 3.5, "T_clear": 0.5},
        "home": {"T_pre": 2.0, "T_alarm": 4.0, "T_clear": 0.5},
        "night": {"T_pre": 1.5, "T_alarm": 3.5, "T_clear": 0.5},
    })
    
    # 基础权重
    base_weights: dict[tuple[str, str], float] = field(default_factory=lambda: {
        ("camera", "person"): 1.2,
        ("camera", "vehicle"): 0.8,
        ("door", "door_open"): 1.8,
        ("window", "door_open"): 1.8,
        ("motion", "motion"): 1.0,
        ("glass_break", "glass_break"): 2.5,
    })
    
    # 模式乘数 (按区域类型)
    mode_multipliers: dict[str, dict[str, float]] = field(default_factory=lambda: {
        "disarmed": {"outdoor": 0.0, "entry": 0.0, "indoor": 0.0},
        "home": {"outdoor": 1.0, "entry": 1.2, "indoor": 0.0},
        "away": {"outdoor": 1.2, "entry": 1.5, "indoor": 1.5},
        "night": {"outdoor": 1.0, "entry": 1.3, "indoor": 1.2},
    })
    
    # 链位置加成
    chain_order_bonus: float = 1.3
```

---

## 4. 算法流程

### 4.1 信号处理流程

```
收到 NGSignal
    │
    ▼
确定归属的 Entry Point (通过 sensor → zone → entry_point 映射)
    │
    ▼
获取 EntryPointState (如果不存在则创建)
    │
    ▼
应用时间衰减: score *= exp(-(now - last_update) / tau)
    │
    ▼
计算信号贡献:
  contribution = base_weight × confidence × mode_mult × chain_bonus
    │
    ▼
累加分数: score += contribution
    │
    ▼
记录到 evidence_ledger
    │
    ▼
检查状态转换:
  - score >= T_alarm → ALARM (创建 Confirmed 事件)
  - score >= T_pre → PRE_ALERT (创建 Pre-Alert 事件)
  - score < T_clear → IDLE
    │
    ▼
更新 last_update = now
```

### 4.2 贡献计算详细步骤

```python
def calculate_contribution(
    signal: NGSignal,
    sensor: Sensor,
    entry_point: EntryPoint,
    state: EntryPointState,
    mode: SystemMode,
    config: ChainDetectorConfig
) -> tuple[float, EvidenceEntry]:
    
    # 1. 基础权重
    key = (sensor.sensor_type, signal.signal_type.value)
    base_weight = config.base_weights.get(key, 1.0)
    
    # 2. 信号置信度
    raw_confidence = signal.confidence
    
    # 3. 模式乘数 (需要知道传感器在链中的位置类型)
    zone_type = get_zone_type(sensor.zone_id)  # outdoor/entry/indoor
    mode_mult = config.mode_multipliers[mode.value].get(zone_type, 1.0)
    
    # 4. 链位置加成
    chain_bonus = 1.0
    if entry_point.sensor_chain:
        chain_ids = [n.sensor_id for n in entry_point.sensor_chain]
        if sensor.id in chain_ids:
            position = chain_ids.index(sensor.id)
            predecessors = chain_ids[:position]
            if all(p in state.triggered_sensors for p in predecessors):
                chain_bonus = config.chain_order_bonus
    
    # 5. 最终贡献
    contribution = base_weight * raw_confidence * mode_mult * chain_bonus
    
    # 6. 创建证据条目
    evidence = EvidenceEntry(
        timestamp=signal.timestamp,
        signal_id=signal.id,
        sensor_id=sensor.id,
        sensor_type=sensor.sensor_type,
        signal_type=signal.signal_type.value,
        raw_confidence=raw_confidence,
        base_weight=base_weight,
        mode_multiplier=mode_mult,
        chain_bonus=chain_bonus,
        final_contribution=contribution,
        score_before=state.score,
        score_after=state.score + contribution
    )
    
    return contribution, evidence
```

---

## 5. 示例场景

### 5.1 真实入侵 (Away 模式)

```
Entry Point: Front Door
Chain: [outdoor_cam, door_sensor, indoor_motion]
Mode: AWAY

T=0s:  outdoor_cam 检测到 person (confidence=0.85)
       base_weight=1.2, mode_mult=1.2, chain_bonus=1.0 (第一个)
       contribution = 1.2 × 0.85 × 1.2 × 1.0 = 1.22
       score: 0 → 1.22 (PRE_ALERT, score >= 1.5? No, still IDLE)

T=3s:  door_sensor 触发 door_open (confidence=1.0)
       衰减: 1.22 × exp(-3/90) = 1.18
       base_weight=1.8, mode_mult=1.5, chain_bonus=1.3 (顺序正确)
       contribution = 1.8 × 1.0 × 1.5 × 1.3 = 3.51
       score: 1.18 + 3.51 = 4.69 (ALARM! score >= 3.5)

结果: 仅 2 个信号，3秒内确认入侵
```

### 5.2 室外 PIR 误报 (Away 模式)

```
Entry Point: Back Yard
Chain: [outdoor_pir, back_door, living_room_motion]
Mode: AWAY

T=0s:  outdoor_pir 检测到 motion (confidence=0.7)
       base_weight=0.6 (室外PIR), mode_mult=1.2
       contribution = 0.6 × 0.7 × 1.2 × 1.0 = 0.50
       score: 0 → 0.50 (IDLE, < 1.5)

T=60s: (无新信号)
       衰减: 0.50 × exp(-60/90) = 0.26
       score: 0.26 (仍 IDLE)

T=120s: (无新信号)
       衰减: 0.26 × exp(-60/90) = 0.13
       score: 0.13 (仍 IDLE)

结果: 单次室外 PIR 触发不会产生任何警报
```

### 5.3 Home 模式下的检测

**场景 A: 室内运动（忽略）**
```
Entry Point: Front Door
Chain: [outdoor_cam (outdoor), door_sensor (entry), indoor_motion (indoor)]
Mode: HOME

T=0s:  indoor_motion 检测到 motion (confidence=0.9)
       base_weight=1.0, mode_mult=0.0 (HOME模式 indoor=0)
       contribution = 1.0 × 0.9 × 0.0 × 1.0 = 0
       score: 0 (无变化)

结果: Home 模式下室内运动被完全忽略 ✅
```

**场景 B: 门磁触发（有效）**
```
Entry Point: Front Door  
Chain: [outdoor_cam (outdoor), door_sensor (entry), indoor_motion (indoor)]
Mode: HOME

T=0s:  door_sensor 触发 door_open (confidence=1.0)
       base_weight=1.8, mode_mult=1.2 (HOME模式 entry=1.2)
       contribution = 1.8 × 1.0 × 1.2 × 1.0 = 2.16
       score: 0 → 2.16 (PRE_ALERT! score >= 1.5)

结果: Home 模式下门磁触发会预警 ✅
```

**场景 C: 完整入侵流程（Home模式）**
```
Entry Point: Front Door
Chain: [outdoor_cam (outdoor), door_sensor (entry), indoor_motion (indoor)]
Mode: HOME

T=0s:  outdoor_cam 检测到 person (confidence=0.85)
       base_weight=1.2, mode_mult=1.0 (HOME outdoor=1.0)
       contribution = 1.2 × 0.85 × 1.0 × 1.0 = 1.02
       score: 0 → 1.02 (IDLE, < 1.5)

T=5s:  door_sensor 触发 door_open (confidence=1.0)
       衰减: 1.02 × exp(-5/90) = 0.96
       base_weight=1.8, mode_mult=1.2 (HOME entry=1.2), chain_bonus=1.3
       contribution = 1.8 × 1.0 × 1.2 × 1.3 = 2.81
       score: 0.96 + 2.81 = 3.77 (ALARM! score >= 3.5)

T=8s:  indoor_motion 触发 (但被忽略，multiplier=0)

结果: outdoor + entry 两个信号即可触发 ALARM ✅
```

---

## 6. 与 Phase 1 的兼容性

### 6.1 保留的接口

- `ChainDetector.detect()` → `list[NGEvent]`
- `AlertLevel` 枚举 (NONE, PRE_ALERT, WARNING, CONFIRMED)
- `ChainMatch` 数据结构 (扩展字段)

### 6.2 新增/修改的接口

- `ChainDetectorConfig` 扩展配置字段
- `EntryPointState` 新增运行时状态
- `EvidenceEntry` 新增证据账本
- `ChainMatch.evidence_ledger` 新增字段

### 6.3 数据库变更

**Zone 表新增字段：**
```sql
ALTER TABLE zones ADD COLUMN location_type TEXT DEFAULT 'indoor';
-- 可选值: 'outdoor', 'entry', 'indoor'
```

**Sensor 表：**
- 传感器继承所属 Zone 的 `location_type`
- 或可在 sensor 级别覆盖 (可选)

**迁移策略：**
- 现有 Zone 默认为 `indoor`
- UI 提示用户检查并更新 Zone 类型
- 门/窗类型传感器自动建议 `entry` 类型

---

## 7. 测试用例

### 7.1 必须通过的测试

| ID | 场景 | 预期结果 |
|----|------|----------|
| T1 | 玻璃破碎单次触发 (Away) | 直接进入 PRE_ALERT 或 ALARM |
| T2 | 室外 PIR 单次触发 (Away) | 保持 IDLE |
| T3 | 顺序触发 outdoor→entry→indoor | 快速进入 ALARM |
| T4 | 乱序触发 indoor→entry | 较慢进入 ALARM (无 chain_bonus) |
| T5 | 信号间隔 >2 分钟 | 分数显著衰减 |
| T6 | Home 模式室内运动 | 无效果 (contribution=0) |
| T7 | **Home 模式门磁触发** | **有效果 (entry multiplier=1.2)** |
| T8 | **Home 模式: outdoor + entry** | **可以触发 Warning/Alarm** |
| T9 | 证据账本记录 | 事件包含完整贡献分解 |
| T10 | Zone location_type 继承 | 传感器正确继承 Zone 的区域类型 |

### 7.2 性能要求

- 单信号处理延迟 < 10ms
- 100 个 Entry Point 状态内存 < 1MB

---

## 8. 未来扩展 (Phase 3)

本 PRD 不实现，但架构需兼容：

1. **SensorReliability 自学习** — 基于用户反馈调整 `r_sensor`
2. **SPRT 兼容层** — 将 score 解释为对数似然比
3. **WATCH 状态** — 低阈值触发录像但不通知
4. **负证据** — 合法开门、用户在家等抑制因素

---

## 9. 实现计划

| 步骤 | 内容 | 预计工作量 |
|------|------|------------|
| 1 | Zone 表添加 `location_type` 字段 + 迁移 | 0.5h |
| 2 | 更新 Zone API 和 UI (选择区域类型) | 1h |
| 3 | 更新 `ChainDetectorConfig` 配置结构 | 0.5h |
| 4 | 实现 `EntryPointState` 状态管理 | 1h |
| 5 | 实现分数衰减逻辑 | 0.5h |
| 6 | 实现贡献计算 (baseWeight, modeMultiplier, chainBonus) | 1h |
| 7 | 实现状态转换 (阈值检查) | 0.5h |
| 8 | 实现 EvidenceEntry 记录 | 0.5h |
| 9 | 更新事件创建逻辑 | 0.5h |
| 10 | 编写测试用例 | 1h |
| 11 | 更新 UI (显示证据分解 + Zone类型) | 1h |
| **总计** | | **8h** |

---

## 10. 审批记录

| 日期 | 版本 | 变更 | 审批人 |
|------|------|------|--------|
| 2024-12-16 | Draft | 初稿 | - |
