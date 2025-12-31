# NeighborGuard Phase 2 综合测试计划

## 1. 测试环境：您的家庭传感器布局

### 1.1 传感器清单

| 区域 | 传感器 | SensorType | Zone | PrivacyLevel |
|------|--------|------------|------|--------------|
| **前门区域** |||||
| 门铃 | 门铃摄像头 | CAMERA_PERSON | FRONT_DOOR | SEMI_PRIVATE |
| 前门外 | 前门摄像头 | CAMERA_PERSON, CAMERA_PACKAGE | PORCH | SEMI_PRIVATE |
| 前门内 | PIR传感器 | PIR | HALLWAY | RESTRICTED |
| 前门 | 门磁开关 | DOOR_CONTACT | FRONT_DOOR | RESTRICTED |
| 前窗 | 玻璃破碎/振动 | GLASS_BREAK | FRONT_YARD | SEMI_PRIVATE |
| **后院区域** |||||
| 后院上方 | 后院摄像头 | CAMERA_PERSON | BACK_YARD | PRIVATE |
| 后院中间 | 院中摄像头 | CAMERA_PERSON | BACK_YARD | PRIVATE |
| 后门内 | PIR传感器 | PIR | HALLWAY | RESTRICTED |
| 后门 | 门磁开关 | DOOR_CONTACT | BACK_DOOR | RESTRICTED |
| 后窗 | 玻璃破碎/振动 | GLASS_BREAK | BACK_YARD | PRIVATE |
| **车道区域** |||||
| 车道 | 车道摄像头 | CAMERA_PERSON, CAMERA_VEHICLE | DRIVEWAY | SEMI_PRIVATE |

### 1.2 Zone 配置

| Zone ID | ZoneType | PrivacyLevel | isEntryPoint | zoneGroup |
|---------|----------|--------------|--------------|-----------|
| zone_front_door | FRONT_DOOR | RESTRICTED | true | front |
| zone_porch | PORCH | SEMI_PRIVATE | false | front |
| zone_hallway_front | HALLWAY | RESTRICTED | false | interior |
| zone_front_yard | FRONT_YARD | SEMI_PRIVATE | false | front |
| zone_back_door | BACK_DOOR | RESTRICTED | true | back |
| zone_back_yard | BACK_YARD | PRIVATE | false | back |
| zone_hallway_back | HALLWAY | RESTRICTED | false | interior |
| zone_driveway | DRIVEWAY | SEMI_PRIVATE | false | front |

---

## 2. 测试场景矩阵

### 2.1 Break-in Attempt（入侵企图）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期EventType | 预期Severity | 预期NotificationLevel |
|--------|----------|------|----------------|---------------|--------------|----------------------|
| B1 | 前门夜间入侵 | NIGHT | 前门CAMERA_PERSON → 前门DOOR_CONTACT → 前门PIR | break_in_attempt | HIGH | HIGH |
| B2 | 后门离家入侵 | AWAY | 后院CAMERA_PERSON → 后门DOOR_CONTACT → 后门PIR | break_in_attempt | HIGH | HIGH |
| B3 | 前窗玻璃破碎入侵 | NIGHT | 前窗GLASS_BREAK → 前门CAMERA_PERSON | break_in_attempt | HIGH | HIGH |
| B4 | 后窗玻璃破碎入侵 | AWAY | 后窗GLASS_BREAK → 后院CAMERA_PERSON | break_in_attempt | HIGH | HIGH |
| B5 | 侧窗入侵（无摄像头） | NIGHT | GLASS_BREAK → 前门PIR (30秒内) | break_in_attempt | HIGH | HIGH |
| B6 | 在家模式门磁+PIR | HOME | 后门DOOR_CONTACT → 后门PIR | motion_detected | LOW | NONE (suppressed) |

### 2.2 Perimeter Damage（周界破坏）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期EventType | 预期Severity | 预期NotificationLevel |
|--------|----------|------|----------------|---------------|--------------|----------------------|
| P1 | 前窗玻璃破碎（无人） | NIGHT | 前窗GLASS_BREAK (无CAMERA_PERSON) | perimeter_damage | HIGH | NORMAL |
| P2 | 后窗玻璃破碎（无人） | AWAY | 后窗GLASS_BREAK (无CAMERA_PERSON) | perimeter_damage | HIGH | NORMAL |
| P3 | 玻璃破碎（在家） | HOME | 前窗GLASS_BREAK | perimeter_damage | MEDIUM | NORMAL |

### 2.3 Suspicious Person（可疑人员）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期Track | 预期EventType | 预期Severity |
|--------|----------|------|----------------|-----------|---------------|--------------|
| S1 | 后院徘徊 | AWAY | 后院CAMERA_PERSON (loitering_flag, 30秒) | BACK_YARD, dwell=30s | suspicious_person | HIGH |
| S2 | 后院夜间徘徊 | NIGHT | 后院CAMERA_PERSON → 后院中间CAMERA_PERSON (45秒) | BACK_YARD, dwell=45s | suspicious_person | HIGH |
| S3 | 前门窥探 | AWAY | 门铃CAMERA_PERSON → 前门CAMERA_PERSON (25秒, 未开门) | FRONT_DOOR→PORCH | suspicious_person | MEDIUM |
| S4 | 车道到后院 | NIGHT | 车道CAMERA_PERSON → 后院CAMERA_PERSON | DRIVEWAY→BACK_YARD | suspicious_person | HIGH |
| S5 | 前院短暂经过 | HOME | 前门CAMERA_PERSON (5秒) | PORCH, dwell=5s | motion_detected | LOW |

### 2.4 Suspicious Vehicle（可疑车辆）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期Track | 预期EventType | 预期Severity |
|--------|----------|------|----------------|-----------|---------------|--------------|
| V1 | 车道长时间停留 | NIGHT | 车道CAMERA_VEHICLE (停留3分钟) | DRIVEWAY, dwell=180s | suspicious_vehicle | HIGH |
| V2 | 车道短暂停留 | HOME | 车道CAMERA_VEHICLE (停留30秒) | DRIVEWAY, dwell=30s | motion_detected | LOW |
| V3 | 多次经过 | AWAY | 车道CAMERA_VEHICLE (repeated flag) | DRIVEWAY | suspicious_vehicle | MEDIUM |

### 2.5 Package Event（包裹事件）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期EventType | 预期Severity |
|--------|----------|------|----------------|---------------|--------------|
| K1 | 包裹投递 | HOME | 前门CAMERA_PERSON → 前门CAMERA_PACKAGE (item_forgotten) | package_delivered | LOW |
| K2 | 正常取件 | HOME | 前门CAMERA_PERSON → 前门CAMERA_PACKAGE (item_taken) | package_taken | LOW |
| K3 | 可疑取件 | AWAY | 前门CAMERA_PERSON → 前门CAMERA_PACKAGE (item_taken, 夜间) | package_taken | MEDIUM |

### 2.6 Unusual Noise（异常声音）测试

| 场景ID | 场景名称 | Mode | 传感器触发序列 | 预期EventType | 预期Severity |
|--------|----------|------|----------------|---------------|--------------|
| N1 | 夜间异常声音 | NIGHT | 后院CAMERA MIC_UNUSUAL_NOISE | unusual_noise | MEDIUM |
| N2 | 在家异常声音 | HOME | 前门CAMERA MIC_UNUSUAL_NOISE | unusual_noise | LOW |

### 2.7 Track 合并测试

| 场景ID | 场景名称 | 传感器触发序列 | 预期Track合并 |
|--------|----------|----------------|--------------|
| T1 | 单人多摄像头追踪 | 车道CAMERA → 前门CAMERA → 门铃CAMERA (60秒内) | 合并为1个Track |
| T2 | 同一人绕房 | 前门CAMERA → 后院CAMERA → 后院中CAMERA (90秒内) | 合并为1个Track, path=PORCH→BACK_YARD |
| T3 | 两人分别触发 | 前门CAMERA_person1 + 后院CAMERA_person2 (同时) | 2个独立Track |
| T4 | 间隔过长分离 | 前门CAMERA → (等待120秒) → 后院CAMERA | 2个独立Track |

### 2.8 House Mode 影响测试

| 场景ID | Mode | 相同传感器触发 | 预期差异 |
|--------|------|----------------|----------|
| M1 | DISARMED | 后院CAMERA_PERSON (loitering 30秒) | 不触发event / 仅记录 |
| M2 | HOME | 后院CAMERA_PERSON (loitering 30秒) | suspicious_person, MEDIUM, 可能NORMAL通知 |
| M3 | AWAY | 后院CAMERA_PERSON (loitering 30秒) | suspicious_person, HIGH, HIGH通知 |
| M4 | NIGHT | 后院CAMERA_PERSON (loitering 30秒) | suspicious_person, HIGH, HIGH通知 |

### 2.9 Privacy Level 影响测试

| 场景ID | Zone | PrivacyLevel | 相同行为 | 预期分数差异 |
|--------|------|--------------|----------|-------------|
| L1 | DRIVEWAY | SEMI_PRIVATE | Person dwell 20s | Score ~0.55 |
| L2 | BACK_YARD | PRIVATE | Person dwell 20s | Score ~0.70 |
| L3 | HALLWAY | RESTRICTED | Person dwell 20s | Score ~0.85 |

### 2.10 边界条件测试

| 场景ID | 场景名称 | 条件 | 预期结果 |
|--------|----------|------|----------|
| E1 | 门磁频繁开关 | DOOR_CONTACT 5次/10秒 | 不重复创建event |
| E2 | Dwell时间刚好达标 | Person dwell=20秒(阈值) | 触发suspicious_person |
| E3 | Dwell时间未达标 | Person dwell=19秒 | 不触发 |
| E4 | Mode切换中 | 触发时正在从HOME→AWAY | 使用新Mode判断 |

---

## 3. 端到端测试流程

```
                    ┌─────────────────┐
                    │   HA Webhook    │
                    │  (传感器事件)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  SensorEvent    │
                    │   创建/存储      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Track 管理      │
                    │ - 查找/创建     │
                    │ - 合并 segments │
                    │ - 计算 dwell    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  FusionEngine   │
                    │ - 规则匹配      │
                    │ - 事件类型判定   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ NotificationScorer │
                    │ - 计算 ML Score │
                    │ - 考虑 Privacy  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ NotificationPolicy │
                    │ - 安全地板检查   │
                    │ - 最终通知级别   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Event 创建     │
                    │ + 通知发送      │
                    └─────────────────┘
```

---

## 4. 预期验证点

### 4.1 SensorEvent 验证
- [ ] 每个传感器触发都创建 SensorEvent
- [ ] rawPayload 正确保存 flags/classificationHints
- [ ] zoneId 正确关联
- [ ] occurredAt 时间准确

### 4.2 Track 验证
- [ ] 同一行为轨迹正确合并
- [ ] segments 按时间顺序记录
- [ ] pathSummary 正确生成
- [ ] maxPrivacyLevel 取最高
- [ ] dwellSecondsPrivate 准确计算
- [ ] 超时后创建新 Track

### 4.3 Event 验证
- [ ] eventType 正确判定
- [ ] severity 正确设置
- [ ] 安全事件不被抑制
- [ ] 低优先级事件正确抑制
- [ ] mlScore 正确记录
- [ ] fusionRule 正确记录

### 4.4 Notification 验证
- [ ] HIGH 级别立即通知
- [ ] NORMAL 级别正常通知
- [ ] NONE 级别不通知但记录
- [ ] Mode 影响通知决策

---

## 5. 测试执行命令

```bash
# 运行完整端到端测试
node test-home-e2e.js

# 运行特定场景
node test-home-e2e.js --scenario B1

# 运行所有入侵场景
node test-home-e2e.js --category break-in

# 生成测试报告
node test-home-e2e.js --report
```
