# TopoMap（拓扑建图）与安装建议 PRD
版本：v2025.12  
日期：2025-12-13

---

## 1. 功能定位

TopoMap 不是“精确户型图”，而是用于安防语义的“拓扑结构”：
- Zone（区域节点）
- Adjacency（相邻/可达边）
- EntryPoints（门/窗/院门/车库门等周界开口点）

目标：
- 事件位置提示到 Zone/EntryPoint 级别（“后门”“侧门”“前廊”）
- 支撑安装建议（覆盖缺口、关键通道、交叉验证）
- 报告叙事增强（路径序列：FrontYard → SidePath → BackYard）

---

## 2. 分层交付：Standard vs Pro

### 2.1 Standard（默认）
- 模板化问卷生成 Topology（4–6 题）
- 不强制用户编辑示意图
- 输出：
  - 覆盖评分（Perimeter / Path / Evidence）
  - 缺口清单（缺门磁/缺关键相机覆盖）
  - 推荐组合（门磁 + 相机/运动 的交叉验证）

### 2.2 Pro（可选）
- 可视化拓扑编辑器（拖拽 Zone，连线，放置门窗点）
- Door/Window/Gate 点位层（支持“窗组”）
- 摄像头 ROI→Zone（可选增强）
- Walk Test 校准向导（2–3 分钟走一圈自动建议映射）

---

## 3. 模板库（北美典型）

- T1：郊区独栋（FrontYard + Driveway + 连体车库）
- T2：后巷 + 独立车库（Alley + DetachedGarage）
- T3：无 driveway（街边停车）+ 侧通道关键
- T4：Corner Lot（双朝向公共边界）
- T5：联排/半独立（前后小院）
- T6：大后院围栏（Gate 为关键入口）

---

## 4. 数据结构（概念）

### 4.1 Zone
- id, name, type（front_yard/porch/back_yard/…）
- privacyLevel（PUBLIC/SEMI_PRIVATE/PRIVATE/RESTRICTED）
- tags（package_dropoff, vehicle_asset, entry_area…）

### 4.2 Edge（连接边）
- fromZoneId, toZoneId
- passageType（open/door/gate/garage_door）
- riskWeight（用于建议引擎）

### 4.3 EntryPoint
- id, name, type（door/window/gate/garage_door）
- attachedTo（edgeId 或 zone boundary）
- sensorBinding（contact/glassbreak/camera_roi）
- zoneVisibilityPolicy（用于媒体分享控制）

---

## 5. 安装建议引擎（规则版 MVP）

输入：
- Topology（Zones/Edges/EntryPoints）
- 现有设备绑定（sensor/camera → zone/entryPoint）

输出：
- **Minimum Viable**：必须装哪些门磁/院门传感器
- **Coverage Gaps**：关键路径/高风险区域缺相机或运动
- **Cross-Validation**：建议形成“门磁 + 室外相机”组合
- **Privacy-aware**：RESTRICTED 室内优先门磁/存在，不默认建议常开摄像头

---

## 6. 验收标准（MVP）
- 用户 3 分钟内完成模板生成与关键入口点确认
- 系统能输出至少 3 条可执行安装建议（按优先级排序）
- 事件在 UI 中能显示 zoneId + entryPointId（如 Front Door）
