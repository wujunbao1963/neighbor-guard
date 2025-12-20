# NG Edge v7.4.2 合并包审计记录

**Generated:** 2025-12-17T03:10:03

## 本次合并内容
- 将 *v7.4.2-permission-matrix-patch (3).md* 直接修订为最终稿（命名风格一致、权限说明对齐、补齐错误码与终态规则）。
- 将修订后的 §11.4.5–§11.4.8（权限矩阵 + 授权动作审计闭环 + 错误码 + 合同测试清单）插入 PRD 的 **§11.4.4 之后**。
- PRD 版本号/历史/edge_schema_version 同步更新到 **v7.4.2**。
- Drills 套件元数据升级到 **v7.4.2**（case 内容不变）。

## 交叉检验结果
- Drills 基本字段校验：PASS（每个 case 均包含 caseId/title/mode/signals/expected/shouldCreateEvent）
- PRD 包含新增错误码：PASS（STATUS_NOT_ALLOWED / ACTION_ALREADY_TERMINAL / INVALID_FIELD_NAME）
- PRD 插入位置：PASS（插入点位于 11.4.4 与 11.5 之间）
