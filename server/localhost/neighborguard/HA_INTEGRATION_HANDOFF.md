# NeighborGuard - Home Assistant 深度集成 Handoff

## 1. 项目概述

NeighborGuard 是一个智能社区安防协作平台，已完成 Phase 1 + Phase 2 开发：

| Phase | 功能 | 状态 |
|-------|------|------|
| Phase 1 | Circle 社区互助、成员角色、事件管理、基础通知 | ✅ 完成 |
| Phase 1B | Home Assistant Webhook 基础集成、传感器管理 | ✅ 完成 |
| Phase 2 | 多传感器融合引擎、16条规则、ML反馈系统 | ✅ 完成 |

## 2. 当前 Home Assistant 集成状态

### 已实现功能

1. **Webhook 接收** - `POST /api/webhooks/ha/:token`
   - 接收 HA 传感器状态变化
   - 自动创建/更新传感器记录
   - 触发融合引擎处理

2. **支持的传感器类型** (21种)
   ```
   物理传感器: DOOR_CONTACT, WINDOW_CONTACT, LOCK, PIR, GLASS_BREAK, 
              VIBRATION, SMOKE, CO_DETECTOR, WATER_LEAK
   
   摄像头 AI:  CAMERA_MOTION, CAMERA_PERSON, CAMERA_VEHICLE, 
              CAMERA_PACKAGE, CAMERA_ANIMAL
   
   音频检测:   MIC_UNUSUAL_NOISE, MIC_BABY_CRY, MIC_GLASS_BREAK
   ```

3. **AI 标志支持** (在 webhook payload 的 flags 字段)
   ```
   person, vehicle, animal, package, face, 
   loitering, intrusion, line_cross, zone_enter
   ```

### 当前 Webhook 数据格式

```json
{
  "entity_id": "binary_sensor.front_door",
  "state": "on",
  "oldState": "off",
  "attributes": {
    "device_class": "door",
    "friendly_name": "Front Door"
  },
  "flags": ["person", "loitering"],
  "occurredAt": "2025-12-12T10:30:00Z"
}
```

### 当前 HA 自动化示例

```yaml
automation:
  - alias: "NeighborGuard - Send Sensor Event"
    trigger:
      - platform: state
        entity_id: binary_sensor.front_door
    action:
      - service: rest_command.neighborguard_webhook
        data:
          entity_id: "{{ trigger.entity_id }}"
          state: "{{ trigger.to_state.state }}"

rest_command:
  neighborguard_webhook:
    url: "https://your-domain.com/api/webhooks/ha/{webhook_token}"
    method: POST
    content_type: "application/json"
    payload: >
      {
        "entity_id": "{{ entity_id }}",
        "state": "{{ state }}"
      }
```

## 3. 关键代码文件

### 后端结构
```
backend/src/
├── routes/
│   ├── webhooks.js          # HA webhook 处理入口
│   ├── integrations.js      # 集成管理 API
│   └── sensors.js           # 传感器 CRUD
├── services/
│   └── fusion/
│       ├── index.js         # 融合引擎主入口
│       ├── fusionEngine.js  # 核心融合逻辑
│       ├── trackManager.js  # 轨迹管理
│       ├── ruleEvaluator.js # 规则评估
│       └── rules/           # 16条融合规则
├── constants/
│   ├── sensorTypes.js       # 传感器类型定义
│   ├── eventTypes.js        # 事件类型定义
│   └── fusionConfig.js      # 融合配置参数
└── prisma/schema.prisma     # 数据模型
```

### 数据模型（与 HA 相关）

```prisma
model Integration {
  id            String          @id
  circleId      String
  name          String          // "My Home Assistant"
  type          IntegrationType // HOME_ASSISTANT
  webhookToken  String          @unique
  baseUrl       String?         // HA URL (用于双向通信)
  accessToken   String?         // HA Long-lived token
  isActive      Boolean
  deviceCount   Int
  lastSyncAt    DateTime?
  
  sensors       Sensor[]
}

model Sensor {
  id            String
  integrationId String
  zoneId        String?
  externalId    String         // HA entity_id
  name          String
  sensorType    SensorType
  isEnabled     Boolean
  lastState     String?
  lastStateAt   DateTime?
  
  sensorEvents  SensorEvent[]
}
```

## 4. 待实现的 HA 深度集成功能

### 优先级 1：设备自动发现
- 调用 HA REST API 获取设备列表
- 自动匹配传感器类型
- 批量导入到 NeighborGuard

### 优先级 2：双向通信
- NG → HA：控制设备（开关灯、锁门等）
- 事件响应自动化（检测到入侵 → 开灯、播放警报）

### 优先级 3：增强摄像头集成
- Frigate NVR 集成
- 获取事件快照/视频片段
- 支持更多 AI 检测结果

### 优先级 4：HA 仪表盘集成
- 自定义 Lovelace 卡片
- 显示 NG 事件状态
- 快速操作按钮

## 5. 技术栈

- **后端**: Node.js + Express + Prisma ORM
- **数据库**: PostgreSQL
- **前端**: React + Vite + TailwindCSS
- **部署**: Railway (或任何 Node.js 托管平台)

## 6. 环境信息（请补充你的实际配置）

```
HA 版本: _______________
HA 访问方式: □ 本地 □ Nabu Casa □ 自建反代
已安装集成: 
  □ Frigate
  □ Double Take (人脸识别)
  □ HACS
  □ 其他: _______________

摄像头品牌: _______________
传感器品牌: _______________
```

## 7. 快速开始

1. 解压 `neighborguard-ha-integration.zip`
2. 安装依赖: `cd backend && npm install`
3. 配置环境变量 (复制 .env.example)
4. 启动开发服务器: `npm run dev`

## 8. 参考文档

- `docs/COMPLETE_SYSTEM_DOCUMENTATION.md` - 完整系统文档
- `docs/API_REFERENCE.md` - API 完整参考
- `docs/FUSION_RULES_REFERENCE.md` - 融合规则详解
- `docs/DATABASE_SCHEMA.md` - 数据库 Schema

---

**目标**: 在新对话中，基于此 Handoff 文档，实现 NeighborGuard 与 Home Assistant 的深度集成。
