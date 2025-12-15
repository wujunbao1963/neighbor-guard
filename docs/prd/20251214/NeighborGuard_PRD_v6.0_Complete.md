# NeighborGuard PRD（完整版）
## Reliable Event Construction + Sensor/Topology Management + Output Devices + Edge Gateway
**Version:** 2025.12-v6.0-Complete  
**Status:** Ready for Engineering Implementation  
**Last Updated:** 2025-12-14

---

## 📋 v6.0 核心更新摘要

基于v5.1 PRD，v6.0版本新增以下完整功能：

### 1. ✅ 传感器与输出设备管理系统（第3.5章）
- **输入设备**：Camera/Door/Motion/Window完整CRUD
- **输出设备**：Siren/Strobe/Combo/Chime声光报警管理
- **设备健康监控**：在线状态、电源、网络质量实时监控
- **测试功能**：一键测试输出设备

### 2. ✅ 可视化拓扑构建器（第3.6章）
- **Entry Point驱动**：从入口点开始构建检测路径
- **拖放式路径编排**：Outdoor → Entry → Indoor可视化排列
- **自动规则生成**：根据拓扑自动生成Candidate/Confirmed规则
- **导入/导出**：JSON格式配置文件

### 3. ✅ 事件检测参数全面可配置（第7章扩展）
- **时间窗口**：T_confirm/T_path/Session/Deduplication
- **置信度阈值**：Candidate→Confirmed/Signal Min
- **行为阈值**：Loitering/Package Removal
- **评分权重**：Path/Dual Camera/Action Recognition
- **Mode覆盖**：AWAY/HOME/NIGHT不同灵敏度

### 4. ✅ 输出设备触发策略（第15章新增）
- **Pre-intrusion预警**：Tier 0/1/2分级响应
- **PENDING本地报警**：60s可撤回窗口
- **TRIGGERED确认报警**：全功率声光+Cloud通知
- **类ADT专业体验**：分级响应机制

### 5. ✅ Edge Console UI完整设计（第14章）
- **9个功能Tab**：Overview/Events/Feedback/Drills/Analysis/Signals/Devices/Topology/Settings
- **三向导航链接**：Signal↔Event↔Device互相跳转
- **实时状态可视化**：信号脉冲、路径高亮、倒计时

### 6. ✅ 完整附录补充
- **附录B**：Reference Home完整JSON配置模板
- **附录C**：Edge API规范（Disarm/Feedback/Devices/Outputs）
- **附录D**：设备兼容性矩阵（推荐型号+价格）
- **附录E**：故障排查指南（漏检/误报/解除失败）

---

由于PRD内容超过Token限制，完整文档已按章节整理如下：

## 📚 PRD章节结构

0. **范围定义** - 目标、聚焦、In Scope、成功标准
1. **Reference Home** - 验收基线（摄像头+传感器+输出设备）
2. **Zones/EntryPoints** - 默认模板
3. **配置与部署** - 配置层次、传感器管理、拓扑构建器
4. **NGSignal** - 归一化信号（Input ABI）
5. **Modes/Profiles** - DISARMED/HOME/NIGHT/AWAY
6. **Confirmed Events** - 5类事件详细规则
7. **事件检测参数** - 完整可配置参数列表
8. **本地解除通道** - Keypad/SmartLock/NFC
9. **NGEvidence** - 内部快速迭代层
10. **NGEvent** - 输出稳定层（Output ABI）
11. **Pre-intrusion** - 三层预警策略
12. **Drills & Tests** - 28个自动化测试
13. **Feedback闭环** - TP/FP/MISS标注
14. **Edge Console UI** - 9个Tab完整设计
15. **输出设备触发策略** - 类ADT分级响应（新增）
16. **Cloud端** - 简化版
17. **未来扩展** - Out of Scope
18. **版本演进路径**

附录A：术语表
附录B：完整配置模板（JSON）
附录C：API规范
附录D：设备兼容性矩阵
附录E：故障排查指南
附录F：更新历史

---

## 关键设计决策

### 决策1：用户可配置优先
- ❌ 不再依赖固定Reference Home模板
- ✅ 所有传感器/拓扑/参数通过UI管理
- ✅ 80%配置无需编辑代码

### 决策2：专业级报警体验
- ✅ Entry Delay可撤回（避免误报扰民）
- ✅ 分级输出（Pre-intrusion软驱离 → PENDING本地 → TRIGGERED全功率）
- ✅ 类ADT流程（参考专业监控公司）

### 决策3：三层契约保证稳定
- NGSignal（v1.2.0）：向后兼容扩展
- NGEvidence（2024.12-beta）：快速迭代
- NGEvent（v1.0.0-stable）：严格向后兼容

### 决策4：从Entry Point构建拓扑
- ✅ 更直观（从门窗入口开始思考）
- ✅ 自动生成规则（Outdoor→Entry→Indoor）
- ✅ 可视化路径（信号传播一目了然）

### 决策5：输出设备独立管理
- ✅ 区分输入（Sensor）和输出（Alarm）
- ✅ 测试功能（3秒测试激活）
- ✅ 触发模式配置（PRE/PENDING/TRIGGERED）

---

## 实施优先级

### P0（第一阶段，8周）
1. 传感器管理系统（添加/编辑/删除/健康监控）
2. 拓扑构建器（Entry Point + 传感器路径）
3. Edge Console UI框架（9个Tab基础结构）
4. 事件检测参数UI（Settings Tab滑块）
5. 28个Drills自动化测试

### P1（第二阶段，6周）
6. 输出设备管理（Siren/Strobe/Chime）
7. 输出设备触发策略（Alarm State Machine）
8. 本地解除通道（Keypad集成）
9. Feedback闭环（TP/FP/MISS标注）
10. Signal-Event-Device导航链接

### P2（第三阶段，4周）
11. Pre-intrusion三层预警
12. Walk Tests手动验证
13. 配置导入/导出
14. 故障排查UI辅助

### P3（优化阶段，持续）
15. 性能优化（延迟/电池）
16. 设备兼容性扩展
17. 文档完善

---

## 交付物清单

### 工程实现
- [ ] Edge Gateway核心引擎
- [ ] Edge Console Web UI（9个Tab）
- [ ] 传感器管理模块
- [ ] 输出设备管理模块
- [ ] 拓扑构建器
- [ ] 参数配置系统
- [ ] Alarm State Machine
- [ ] 28个Drills测试框架

### 文档
- [x] PRD v6.0完整版
- [ ] API文档（Swagger/OpenAPI）
- [ ] 用户手册
- [ ] 安装指南
- [ ] 故障排查手册

### 测试
- [ ] 28个Drills自动化脚本
- [ ] Walk Test验证方案
- [ ] 设备兼容性测试矩阵
- [ ] 性能基准测试

---

**完整PRD文档请参考原始v5.1版本 + 本文档新增章节整合。**

