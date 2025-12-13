# NeighborGuard 完整系统文档
## 社区安防协作平台 - Phase 1 + Phase 2

---

# 第一部分：产品概述

## 1.1 产品愿景

NeighborGuard 是一个智能社区安防协作平台，旨在：

1. **智能化安防监控**：通过多传感器融合技术，将各种 IoT 设备（门窗传感器、摄像头、烟雾探测器等）的信号智能组合，生成高准确率的安全事件
2. **社区协作互助**：通过 Circle（信任圈）机制，让家庭成员和可信邻居能够共同监控和响应安全事件
3. **隐私优先设计**：基于区域隐私级别的智能通知策略，确保在提供安全保护的同时尊重隐私

## 1.2 目标用户

- **主要用户**：拥有智能家居设备的独栋住宅业主
- **次要用户**：家庭成员、信任的邻居、亲友

## 1.3 核心功能

| 功能模块 | Phase 1 | Phase 2 |
|---------|---------|---------|
| 用户认证 | ✅ 邮箱 OTP 登录 | - |
| Circle 社区圈子 | ✅ 创建、加入、成员管理 | - |
| 成员角色权限 | ✅ 5种角色等级 | - |
| 事件管理 | ✅ 手动创建/查看 | ✅ 自动融合生成 |
| 区域管理 | ✅ Zone 配置 | ✅ 隐私级别 |
| 传感器集成 | ✅ Home Assistant | ✅ 21种传感器类型 |
| House Mode | ✅ 4种模式 | ✅ 模式感知规则 |
| 通知系统 | ✅ 推送通知 | ✅ 智能通知策略 |
| 融合引擎 | - | ✅ 16条融合规则 |
| ML 反馈 | - | ✅ 反馈收集系统 |

---

# 第二部分：Circle 社区互助系统 (Phase 1)

## 2.1 Circle 概念

Circle（信任圈）是 NeighborGuard 的核心社交单元，代表一个安全监控群组。

```
┌─────────────────────────────────────────────────────────────┐
│                         Circle                               │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │  OWNER  │   │HOUSEHOLD│   │NEIGHBOR │   │RELATIVE │     │
│  │  业主   │   │家庭成员 │   │ 邻居    │   │ 亲友    │     │
│  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘     │
│       │             │             │             │           │
│       └─────────────┴─────────────┴─────────────┘           │
│                          │                                   │
│                    ┌─────┴─────┐                            │
│                    │   Home    │                            │
│                    │  房屋配置  │                            │
│                    └───────────┘                            │
│                          │                                   │
│          ┌───────────────┼───────────────┐                  │
│          │               │               │                  │
│    ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐            │
│    │   Zone    │  │   Zone    │  │   Zone    │            │
│    │  前门     │  │  后院     │  │  客厅     │            │
│    └───────────┘  └───────────┘  └───────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## 2.2 成员角色体系

### 角色定义

| 角色 | 代码 | 描述 | 典型用户 |
|------|------|------|----------|
| **OWNER** | 业主 | Circle 创建者，拥有最高权限 | 房屋业主 |
| **HOUSEHOLD** | 家庭成员 | 完全访问权限，可管理大部分设置 | 配偶、成年子女 |
| **NEIGHBOR** | 邻居 | 可查看事件并协助响应 | 信任的邻居 |
| **RELATIVE** | 亲友 | 可查看事件和接收通知 | 远程亲属、朋友 |
| **OBSERVER** | 观察者 | 仅可查看低敏感度信息 | 临时访客 |

### 权限矩阵

| 权限 | OWNER | HOUSEHOLD | NEIGHBOR | RELATIVE | OBSERVER |
|------|-------|-----------|----------|----------|----------|
| 创建事件 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 查看所有事件 | ✅ | ✅ | ✅ | ✅ | 部分 |
| 查看事件媒体 | ✅ | ✅ | ✅ | 可配置 | ❌ |
| 解决事件 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 管理 Zone | ✅ | ✅ | ❌ | ❌ | ❌ |
| 管理传感器 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 邀请成员 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 移除成员 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 修改 House Mode | ✅ | ✅ | ❌ | ❌ | ❌ |
| 删除 Circle | ✅ | ❌ | ❌ | ❌ | ❌ |

### 通知偏好设置

每个成员可独立配置通知接收偏好：

```javascript
CircleMember {
  notifyOnHighSeverity: Boolean   // 接收高严重度事件通知
  notifyOnMediumSeverity: Boolean // 接收中等严重度事件通知
  notifyOnLowSeverity: Boolean    // 接收低严重度事件通知
  canViewAllEventMedia: Boolean   // 是否可查看事件媒体
}
```

## 2.3 Circle 工作流程

### 创建 Circle

```
用户注册 → 创建 Circle → 配置 Home → 添加 Zone → 集成传感器 → 邀请成员
```

### 邀请成员加入

```
OWNER/HOUSEHOLD 发送邀请 → 被邀请者收到邮件 → 点击链接注册/登录 → 自动加入 Circle
```

### 事件协作流程

```
传感器触发 → 生成事件 → 通知所有成员 → 成员查看/评论 → OWNER/HOUSEHOLD 解决
     │                        │
     │                        ├── NEIGHBOR 可添加评论/照片
     │                        └── RELATIVE 可查看状态
     │
     └── 基于角色和通知偏好过滤通知接收者
```

## 2.4 数据模型

### Circle 表

```prisma
model Circle {
  id          String    @id @default(uuid())
  ownerId     String    // 创建者用户ID
  displayName String    // Circle 名称
  createdAt   DateTime
  deletedAt   DateTime? // 软删除

  owner        User           @relation("CircleOwner")
  members      CircleMember[]
  home         Home?
  zones        Zone[]
  events       Event[]
  integrations Integration[]
  sensors      Sensor[]
}
```

### CircleMember 表

```prisma
model CircleMember {
  id                     String     @id @default(uuid())
  circleId               String
  userId                 String
  role                   MemberRole // OWNER, HOUSEHOLD, NEIGHBOR, RELATIVE, OBSERVER
  displayName            String?    // 在此 Circle 中显示的名称
  notifyOnHighSeverity   Boolean    @default(true)
  notifyOnMediumSeverity Boolean    @default(true)
  notifyOnLowSeverity    Boolean    @default(false)
  canViewAllEventMedia   Boolean    @default(true)
  joinedAt               DateTime
  leftAt                 DateTime?  // 离开时间

  @@unique([circleId, userId])  // 一个用户在一个 Circle 只能有一个成员身份
}
```

## 2.5 API 端点

### Circle 管理

| 端点 | 方法 | 描述 | 所需角色 |
|------|------|------|----------|
| /api/circles | GET | 获取用户所有 Circles | 任意成员 |
| /api/circles | POST | 创建新 Circle | 已认证用户 |
| /api/circles/:id | GET | 获取 Circle 详情 | Circle 成员 |
| /api/circles/:id | PUT | 更新 Circle 信息 | OWNER |
| /api/circles/:id | DELETE | 删除 Circle | OWNER |

### 成员管理

| 端点 | 方法 | 描述 | 所需角色 |
|------|------|------|----------|
| /api/circles/:id/members | GET | 获取成员列表 | Circle 成员 |
| /api/circles/:id/members/invite | POST | 邀请新成员 | OWNER, HOUSEHOLD |
| /api/circles/:id/members/:memberId | PUT | 更新成员角色 | OWNER |
| /api/circles/:id/members/:memberId | DELETE | 移除成员 | OWNER |
| /api/circles/:id/leave | POST | 主动离开 | 非 OWNER 成员 |

---

# 第三部分：Home 与 Zone 配置

## 3.1 Home 配置

每个 Circle 有且只有一个 Home（房屋配置）：

```prisma
model Home {
  id               String
  circleId         String     @unique
  displayName      String
  
  // 地址信息
  country          String     @default("CA")
  region           String     // 省/州
  city             String
  postalCode       String
  addressLine1     String?
  
  // 房屋特征
  houseType        HouseType  // DETACHED, SEMI, ROW, APARTMENT
  hasDriveway      Boolean    @default(true)
  hasBackYard      Boolean    @default(true)
  hasBackAlley     Boolean    @default(false)
  
  // House Mode 设置
  houseMode        HouseMode  @default(DISARMED)
  nightModeAuto    Boolean    @default(false)
  nightModeStart   String     @default("22:00")
  nightModeEnd     String     @default("06:00")
  nightModeHighOnly Boolean   @default(false)
}
```

## 3.2 House Mode（房屋模式）

| 模式 | 图标 | 描述 | 安全级别 |
|------|------|------|----------|
| **DISARMED** | 🔓 | 完全解除警戒 | 最低 - 仅安全事件 |
| **HOME** | 🏠 | 在家模式 | 中等 - 周边监控 |
| **AWAY** | 🛡️ | 离家模式 | 高 - 全面监控 |
| **NIGHT** | 🌙 | 夜间模式 | 最高 - 增强敏感度 |

## 3.3 Zone（监控区域）

### Zone 类型

```
入口点 (Entry Points)
├── FRONT_DOOR      前门
├── BACK_DOOR       后门
├── SIDE_DOOR       侧门
└── GARAGE_ENTRANCE 车库入口

户外区域 (Outdoor)
├── FRONT_YARD      前院
├── BACK_YARD       后院
├── SIDE_YARD       侧院
├── DRIVEWAY        车道
├── PORCH           门廊
└── PATIO           露台

边界区域 (Boundary)
├── STREET_FRONT    街道前方
├── ALLEY_BEHIND    后巷
├── SIDE_ALLEY      侧道
└── FENCE_LINE      围栏

室内区域 (Interior)
├── LIVING_ROOM     客厅
├── HALLWAY         走廊
├── STAIRS          楼梯
├── GARAGE_INTERIOR 车库内部
└── BASEMENT        地下室
```

### 隐私级别 (Phase 2)

| 级别 | 描述 | 示例区域 | 可疑判定阈值 |
|------|------|----------|--------------|
| **PUBLIC** | 公共可见 | 街道、人行道 | 不判定为可疑 |
| **SEMI_PRIVATE** | 半私密 | 前院、车道 | 较高容忍度 |
| **PRIVATE** | 私密 | 后院、侧院 | 20秒停留=可疑 |
| **RESTRICTED** | 限制区域 | 室内、入口 | 立即警报 |

---

# 第四部分：传感器集成 (Phase 1B + Phase 2)

## 4.1 支持的传感器类型

### Phase 1B 基础传感器

| 类型 | 代码 | 描述 |
|------|------|------|
| 门窗传感器 | DOOR_CONTACT | 门窗开合状态 |
| PIR 运动 | PIR | 被动红外运动探测 |
| 玻璃破碎 | GLASS_BREAK | 玻璃破碎声音/振动 |
| 振动传感器 | VIBRATION | 物理振动检测 |
| 烟雾探测 | SMOKE | 烟雾报警 |
| 水浸传感器 | WATER_LEAK | 漏水检测 |

### Phase 2 扩展传感器

| 类型 | 代码 | 描述 |
|------|------|------|
| 窗户传感器 | WINDOW_CONTACT | 窗户专用传感器 |
| 智能锁 | LOCK | 智能门锁状态 |
| CO 探测器 | CO_DETECTOR | 一氧化碳检测 |
| 摄像头运动 | CAMERA_MOTION | 摄像头基础运动 |
| 摄像头人形 | CAMERA_PERSON | AI 人形识别 |
| 摄像头车辆 | CAMERA_VEHICLE | AI 车辆识别 |
| 摄像头包裹 | CAMERA_PACKAGE | AI 包裹识别 |
| 摄像头动物 | CAMERA_ANIMAL | AI 动物识别 |
| 异常声音 | MIC_UNUSUAL_NOISE | 音频异常检测 |
| 婴儿哭声 | MIC_BABY_CRY | 婴儿哭声检测 |
| 音频玻碎 | MIC_GLASS_BREAK | 音频玻璃破碎检测 |

## 4.2 Home Assistant 集成

### Webhook 配置

```yaml
# Home Assistant automation.yaml
automation:
  - alias: "NeighborGuard - Door Sensor"
    trigger:
      - platform: state
        entity_id: binary_sensor.front_door
    action:
      - service: rest_command.neighborguard_webhook
        data:
          entity_id: "{{ trigger.entity_id }}"
          state: "{{ trigger.to_state.state }}"
          friendly_name: "{{ trigger.to_state.attributes.friendly_name }}"

rest_command:
  neighborguard_webhook:
    url: "https://your-domain.com/api/webhooks/ha/{webhook_token}"
    method: POST
    content_type: "application/json"
    payload: >
      {
        "entity_id": "{{ entity_id }}",
        "state": "{{ state }}",
        "attributes": {
          "friendly_name": "{{ friendly_name }}"
        }
      }
```

### Webhook 数据格式

```json
{
  "entity_id": "binary_sensor.front_door",
  "state": "on",
  "attributes": {
    "device_class": "door",
    "friendly_name": "Front Door"
  },
  "context": {
    "id": "unique_context_id",
    "timestamp": "2025-12-12T10:30:00Z"
  },
  // Phase 2: 可选 AI 标志
  "flags": ["person", "loitering", "intrusion"]
}
```

---

# 第五部分：融合引擎 (Phase 2)

## 5.1 概述

FusionEngine 是 Phase 2 的核心，负责：
1. 接收原始传感器事件
2. 创建/更新行为轨迹 (Track)
3. 根据规则评估生成安全事件
4. 应用通知策略

## 5.2 处理流程

```
传感器触发
    │
    ▼
┌─────────────────┐
│  Webhook 接收   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 创建 SensorEvent │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Track 管理     │────▶│ 计算停留时间    │
│ (查找/创建轨迹)  │     │ (各隐私级别)    │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  规则评估       │  ◀── 按优先级顺序评估
│ (16条融合规则)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  生成 Event     │
│ (类型+严重度)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  通知策略       │  ◀── 基于 House Mode
│ (决定通知级别)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  发送推送通知   │
└─────────────────┘
```

## 5.3 Track（行为轨迹）

Track 用于关联来自同一移动对象的多个传感器事件：

```prisma
model Track {
  id                  String
  circleId            String
  homeId              String
  objectType          ObjectType    // PERSON, VEHICLE, ANIMAL, PACKAGE, UNKNOWN
  isActive            Boolean       // 轨迹是否仍在进行
  firstSeenAt         DateTime      // 首次检测时间
  lastSeenAt          DateTime      // 最后活动时间
  
  // 各隐私级别停留时间（秒）
  dwellSecondsPublic      Int @default(0)
  dwellSecondsSemiPrivate Int @default(0)
  dwellSecondsPrivate     Int @default(0)
  dwellSecondsRestricted  Int @default(0)
  
  zonesVisited        String[]      // 访问过的区域列表
  maxPrivacyLevel     PrivacyLevel  // 到达的最高隐私级别
  
  sensorEvents        SensorEvent[]
  events              Event[]
}
```

### Track 配置参数

```javascript
TRACK_WINDOW_SECONDS = 120    // 轨迹时间窗口（2分钟）
TRACK_GAP_SECONDS = 60        // 间隔超过此值创建新轨迹
```

## 5.4 融合规则概览

### 规则优先级

| 优先级 | 规则ID | 事件类型 | 触发条件 |
|--------|--------|----------|----------|
| 1 | R14 | fire_detected | 烟雾传感器触发 |
| 2 | R15 | co_detected | CO探测器触发 |
| 3 | R16 | water_leak_detected | 水浸传感器触发 |
| 4-6 | R1-R3 | break_in_attempt | 门+室内运动 / 玻碎+人形 / 入侵标志 |
| 7-8 | R4-R5 | perimeter_damage | 仅玻碎 / 强振动 |
| 9-11 | R6-R8 | suspicious_person | 停留20秒+ / 徘徊标志 / 后院检测 |
| 12-14 | R9-R10B | suspicious_vehicle | 车辆停留2分钟+ / 重复出现 |
| 15-16 | R12-R13 | package_* | 包裹出现/移除 |
| 17 | R99 | motion_detected | 兜底运动检测 |

### 规则示例：入侵检测

```javascript
R1_BREAKIN_DOOR_PIR: {
  id: 'R1_BREAKIN_DOOR_PIR',
  name: 'Break-in: Door/Window + Indoor Motion',
  eventType: 'break_in_attempt',
  severity: 'HIGH',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    // 必须有门窗传感器触发
    const hasDoorSensor = events.some(e => 
      ['DOOR_CONTACT', 'WINDOW_CONTACT', 'LOCK'].includes(e.sensor?.sensorType)
    );
    // 必须有室内运动检测
    const hasIndoorMotion = events.some(e => 
      ['PIR', 'CAMERA_MOTION'].includes(e.sensor?.sensorType) &&
      ['PRIVATE', 'RESTRICTED'].includes(e.zone?.privacyLevel)
    );
    // 门窗必须在入口区域
    const isEntryZone = events.some(e => e.zone?.isEntryPoint);
    
    return hasDoorSensor && hasIndoorMotion && isEntryZone;
  }
}
```

## 5.5 停留时间阈值

| 对象类型 | 阈值 | 严重度 | 描述 |
|----------|------|--------|------|
| 人 | 20秒 | MEDIUM | 私密区域可疑人员 |
| 人 (夜间/离家) | 20秒 | HIGH | 升级严重度 |
| 车辆 | 120秒 | MEDIUM | 车辆徘徊 |
| 车辆 | 300秒 | HIGH | 严重车辆徘徊 |

## 5.6 通知策略矩阵

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

### 通知级别行为

| 级别 | 行为 | 用例 |
|------|------|------|
| HIGH | 推送 + 声音 + 振动 | 入侵、火灾、CO |
| NORMAL | 普通推送 | 可疑活动、包裹 |
| NONE | 静默/不通知 | 解除警戒模式下的低优先级事件 |

---

# 第六部分：ML 反馈系统 (Phase 2)

## 6.1 目的

收集用户对事件的反馈，为未来的机器学习模型训练准备数据。

## 6.2 反馈收集

### 反馈标签

| 标签 | 含义 |
|------|------|
| FALSE_ALARM | 误报 - 用户标记为非真实威胁 |
| USEFUL | 有用 - 用户确认为有价值的通知 |

### 反馈 API

```http
POST /api/circles/:circleId/events/:eventId/feedback
Content-Type: application/json

{
  "label": "FALSE_ALARM",
  "note": "只是快递员送货"
}
```

## 6.3 特征存储

为每个事件预计算 ML 特征：

```prisma
model EventMLFeature {
  eventId             String   @unique
  
  // 事件属性
  eventType           String
  severity            String
  
  // 上下文
  houseMode           String
  hourBucket          Int      // 0-23
  weekday             Int      // 0-6
  
  // 传感器组合标志
  hasDoorContact      Boolean
  hasInsideMotion     Boolean
  hasCameraPerson     Boolean
  hasGlassBreak       Boolean
  sensorCount         Int
  
  // 轨迹特征
  hasPrivateZone      Boolean
  dwellPrivateSec     Int
  dwellTotalSec       Int
  
  // 历史统计（定期更新）
  histFalseRateType   Float?   // 该事件类型的历史误报率
  histFalseRateSensor Float?   // 相关传感器的历史误报率
  histFalseRateHour   Float?   // 该时段的历史误报率
}
```

---

# 第七部分：API 参考

## 7.1 认证

### 请求验证码
```http
POST /api/auth/request-code
{ "email": "user@example.com" }
```

### 登录
```http
POST /api/auth/login
{ "email": "user@example.com", "code": "587585" }
```

## 7.2 Circle 管理

### 获取用户的所有 Circles
```http
GET /api/circles
Authorization: Bearer <token>
```

### 创建 Circle
```http
POST /api/circles
Authorization: Bearer <token>
{
  "displayName": "我的家",
  "home": {
    "displayName": "XXX路XXX号",
    "houseType": "DETACHED",
    "city": "Calgary"
  }
}
```

### 邀请成员
```http
POST /api/circles/:circleId/members/invite
Authorization: Bearer <token>
{
  "email": "neighbor@example.com",
  "role": "NEIGHBOR"
}
```

## 7.3 事件管理

### 获取事件列表
```http
GET /api/circles/:circleId/events?page=1&pageSize=20&status=OPEN
Authorization: Bearer <token>
X-Circle-Id: <circleId>
```

### 获取事件详情（含轨迹）
```http
GET /api/circles/:circleId/events/:eventId
Authorization: Bearer <token>
```

响应包含完整的 Track 和 SensorEvent 数据。

### 提交反馈
```http
POST /api/circles/:circleId/events/:eventId/feedback
Authorization: Bearer <token>
{
  "label": "USEFUL",
  "note": "确实有人在门口徘徊"
}
```

## 7.4 House Mode

### 设置 House Mode
```http
PUT /api/circles/:circleId/home/mode
Authorization: Bearer <token>
{ "mode": "AWAY" }
```

---

# 第八部分：部署指南

## 8.1 环境变量

```env
# 数据库
DATABASE_URL="postgresql://user:pass@host:5432/neighborguard"

# JWT 认证
JWT_SECRET="your-secure-secret-key"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# 认证码
AUTH_CODE_EXPIRES_MINUTES=10
AUTH_TEST_MODE=false

# 推送通知
APNS_KEY_ID="your-apns-key"
APNS_TEAM_ID="your-team-id"
APNS_BUNDLE_ID="com.company.neighborguard"

# 服务器
PORT=5000
NODE_ENV=production
```

## 8.2 部署步骤

1. 配置 PostgreSQL 数据库
2. 设置环境变量
3. 运行数据库迁移：`npx prisma migrate deploy`
4. 构建前端：`cd frontend && npm run build`
5. 启动服务器：`node backend/server.js`

## 8.3 Home Assistant 集成配置

1. 在 NeighborGuard 中：设置 → 集成 → 添加 Home Assistant
2. 复制生成的 Webhook URL
3. 在 Home Assistant 中创建自动化，将传感器事件发送到此 URL
4. 在 NeighborGuard 中将传感器分配到对应的 Zone

---

# 第九部分：未来路线图

## Phase 2.5: ML 集成
- 基于收集的反馈数据训练 ML 模型
- 用 ML 预测替换启发式评分器
- 个性化通知阈值

## Phase 3: 多家庭与社区
- 支持用户拥有多个家庭
- 社区级别的警报共享（可选参与）
- 跨家庭可疑活动关联

## Phase 4: 高级功能
- 原生 iOS/Android 应用
- Apple HomeKit / Google Home 集成
- 人脸识别（已知人员）
- 车牌识别
- 双向音频集成

---

# 附录 A: 完整 Prisma Schema

完整 schema 请参考：`backend/prisma/schema.prisma`

# 附录 B: 融合规则完整列表

完整规则定义请参考：`docs/FUSION_RULES_REFERENCE.md`

# 附录 C: API 完整参考

完整 API 文档请参考：`docs/API_REFERENCE.md`
