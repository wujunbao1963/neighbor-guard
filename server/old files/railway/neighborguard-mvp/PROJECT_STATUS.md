# NeighborGuard MVP - 项目状态文档

版本：v1.0  
更新日期：2025-12-11  
目的：为后续开发阶段提供完整的项目上下文

---

## 1. 项目概述

NeighborGuard 是一个**邻里联防安全协作系统**，允许屋主与可信的邻居、家人、朋友共享安全事件，实现社区级别的安防协作。

### 1.1 长期愿景
> "多摄像头 + 多传感器 + 多住户联防"的 **Neighborhood Security Brain**

### 1.2 当前状态
- ✅ Web MVP 已完成
- ✅ 已部署到 Railway（生产环境）
- 🔄 准备进入 Phase 1B（外部集成）

---

## 2. 技术栈

### 2.1 后端
- **运行时**: Node.js 20+
- **框架**: Express.js 4.x
- **ORM**: Prisma 5.x
- **数据库**: PostgreSQL
- **认证**: JWT (Access + Refresh Token)
- **文件上传**: Multer
- **打包**: Archiver (ZIP 报告)

### 2.2 前端
- **框架**: React 18 + Vite 5
- **样式**: Tailwind CSS 3.x
- **HTTP**: Axios
- **状态管理**: React Context

### 2.3 部署
- **平台**: Railway
- **后端 URL**: https://[your-backend].up.railway.app
- **前端 URL**: https://[your-frontend].up.railway.app

---

## 3. 已实现功能

### 3.1 认证系统
| 功能 | 状态 | 说明 |
|------|------|------|
| 邮箱验证码登录 | ✅ | 无密码，6位验证码 |
| JWT Token | ✅ | Access (15min) + Refresh (7d) |
| 超级管理员 | ✅ | admin@neighborguard.app |
| 测试模式 | ✅ | 固定验证码 587585 |

### 3.2 用户角色
| 角色 | 权限 | 状态 |
|------|------|------|
| Super Admin | 管理所有用户，提升屋主 | ✅ |
| Owner (屋主) | 完全控制，添加/删除成员 | ✅ |
| Household (同住人) | 管理事件和设置 | ✅ |
| Neighbor (邻居) | 查看和响应事件 | ✅ |
| Relative (亲友) | 查看和响应事件 | ✅ |

### 3.3 房屋与圈子
| 功能 | 状态 | 说明 |
|------|------|------|
| Circle (圈子) | ✅ | 每个屋主一个圈子 |
| Home (房屋) | ✅ | 名称、地址、房型 |
| 成员邀请 | ✅ | 邮箱邀请（需先注册） |
| 成员管理 | ✅ | 添加/删除/角色分配 |

### 3.4 Zone (监控区域)
| 功能 | 状态 | 说明 |
|------|------|------|
| 18种区域类型 | ✅ | 代码配置 |
| 按房型筛选 | ✅ | DETACHED/SEMI/ROW/APARTMENT |
| 启用/禁用 | ✅ | 用户可配置 |
| 自动初始化 | ✅ | 创建屋主时自动生成 |

**Zone 类型列表：**
```
前门(FRONT_DOOR), 侧门(SIDE_DOOR), 后门(BACK_DOOR), 车库门(GARAGE_DOOR)
车道(DRIVEWAY), 前院(FRONT_YARD), 后院(BACK_YARD), 侧院(SIDE_YARD)
信箱(MAILBOX), 门廊(PORCH), 阳台(BALCONY), 地下室窗(BASEMENT_WINDOW)
停车场(PARKING_LOT), 走廊(HALLWAY), 大堂(LOBBY), 储物间(STORAGE_ROOM)
包裹区(PACKAGE_AREA), 垃圾区(GARBAGE_AREA)
```

### 3.5 事件系统
| 功能 | 状态 | 说明 |
|------|------|------|
| 7种事件类型 | ✅ | 代码配置 |
| 严重程度 | ✅ | HIGH/MEDIUM/LOW |
| 事件状态 | ✅ | OPEN → RESOLVED/FALSE_ALARM |
| 时间线 | ✅ | 所有操作记录 |
| 媒体上传 | ✅ | 图片/视频 |
| 邻里反馈 | ✅ | 预设选项 |
| 报警记录 | ✅ | 标记已报警 |
| 事件报告 | ✅ | ZIP下载（HTML+TXT+媒体） |

**事件类型列表：**
```
suspicious_person (可疑人员) - MEDIUM
suspicious_vehicle (可疑车辆) - MEDIUM
break_in_attempt (试图入室) - HIGH
package_event (包裹事件) - LOW
perimeter_damage (边界破坏) - MEDIUM
unusual_noise (异常声音) - LOW
custom_alert (自定义警报) - 可变
```

### 3.6 管理后台
| 功能 | 状态 | 说明 |
|------|------|------|
| 用户列表 | ✅ | 查看所有用户 |
| 提升屋主 | ✅ | 普通用户→屋主 |
| 删除用户 | ✅ | 移除用户 |
| 初始化管理员 | ✅ | API 端点 |

---

## 4. 数据库 Schema

### 4.1 核心实体关系
```
User (用户)
  ├── Circle (圈子) [1:N as owner]
  └── CircleMember (成员身份) [1:N]

Circle (圈子)
  ├── Home (房屋) [1:1]
  ├── CircleMember (成员) [1:N]
  ├── Zone (区域) [1:N]
  └── Event (事件) [1:N]

Event (事件)
  ├── EventNote (备注/反馈) [1:N]
  └── EventMedia (媒体文件) [1:N]
```

### 4.2 主要表
| 表名 | 用途 |
|------|------|
| users | 用户账户 |
| auth_codes | 验证码 |
| refresh_tokens | 刷新令牌 |
| circles | 联防圈子 |
| circle_members | 圈子成员 |
| homes | 房屋信息 |
| zones | 监控区域 |
| events | 安全事件 |
| event_notes | 事件备注 |
| event_media | 事件媒体 |
| email_whitelist | 邮箱白名单（可选） |

---

## 5. API 端点清单

### 5.1 认证 `/api/auth`
```
POST /send-code          - 发送验证码
POST /login              - 验证码登录
POST /refresh            - 刷新令牌
POST /logout             - 登出
GET  /me                 - 获取当前用户信息
PUT  /profile            - 更新个人资料
POST /admin/init-super-admin  - 初始化超级管理员
POST /admin/make-homeowner    - 提升为屋主
GET  /admin/users             - 用户列表
DELETE /admin/users/:id       - 删除用户
```

### 5.2 圈子 `/api/circles`
```
GET  /                   - 我的圈子列表
GET  /:id                - 圈子详情
PUT  /:id                - 更新圈子
POST /:id/members        - 添加成员
DELETE /:id/members/:mid - 移除成员
```

### 5.3 房屋 `/api/homes`
```
GET  /:circleId          - 房屋信息
PUT  /:circleId          - 更新房屋
```

### 5.4 区域 `/api/zones`
```
GET  /:circleId          - 区域列表
PUT  /:circleId/:zoneId  - 更新区域
POST /:circleId/reset-defaults - 重置默认
POST /:circleId/init     - 初始化区域
```

### 5.5 事件 `/api/events`
```
GET  /:circleId          - 事件列表
POST /:circleId          - 创建事件
GET  /:circleId/:eventId - 事件详情
PUT  /:circleId/:eventId - 更新事件
PUT  /:circleId/:eventId/status - 更新状态
PUT  /:circleId/:eventId/police - 更新报警状态
POST /:circleId/:eventId/notes  - 添加备注
DELETE /:circleId/:eventId      - 删除事件
```

### 5.6 上传 `/api/uploads`
```
POST /:circleId/:eventId         - 上传媒体
GET  /:circleId/:eventId         - 获取媒体列表
DELETE /:circleId/:mediaId       - 删除媒体
GET  /:circleId/:eventId/download - 下载事件报告(ZIP)
```

### 5.7 配置 `/api/config`
```
GET  /zones              - 区域类型配置
GET  /event-types        - 事件类型配置
GET  /house-types        - 房型配置
GET  /roles              - 角色配置
```

---

## 6. 前端页面结构

```
App.jsx
├── LoginPage           - 登录页（邮箱+验证码）
├── HomePage            - 首页（事件概览+快速创建）
├── TimelinePage        - 时间线（所有事件列表）
├── SettingsPage        - 设置（房屋/区域/成员管理）
└── AdminPage           - 管理后台（超级管理员专用）

组件:
├── EventCard           - 事件卡片
├── EventDetailModal    - 事件详情弹窗
├── CreateEventModal    - 创建事件弹窗
└── LoadingSpinner      - 加载动画
```

---

## 7. 配置文件位置

### 7.1 后端配置
| 文件 | 用途 |
|------|------|
| `/backend/.env` | 环境变量 |
| `/backend/src/config/constants.js` | Zone/Event类型定义 |
| `/backend/src/config/database.js` | Prisma 客户端 |
| `/backend/prisma/schema.prisma` | 数据库 Schema |

### 7.2 前端配置
| 文件 | 用途 |
|------|------|
| `/frontend/.env` | API URL 配置 |
| `/frontend/src/services/api.js` | API 客户端 |

### 7.3 环境变量
**后端 (.env):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
FRONTEND_URL=https://your-frontend.up.railway.app
TEST_MODE=true
TEST_CODE=587585
```

**前端 (.env):**
```
VITE_API_URL=https://your-backend.up.railway.app/api
```

---

## 8. 未实现功能（蓝图要求）

### 8.1 Phase 1B: 外部集成（下一阶段）
| 功能 | 优先级 | 说明 |
|------|--------|------|
| HA Webhook API | 🔴 高 | `POST /integrations/ha/events` |
| Sensor 实体 | 🔴 高 | 门磁/PIR/玻璃破碎传感器 |
| House Mode | 🔴 高 | Disarmed/Home/Away/Night |
| IntegrationEndpoint | 🟡 中 | 外部系统配置 |
| ExternalDeviceMapping | 🟡 中 | 设备映射 |

### 8.2 Phase 2: Track + 行为分析
| 功能 | 优先级 | 说明 |
|------|--------|------|
| Camera 实体 | 🔴 高 | RTSP/ONVIF 连接 |
| Track 实体 | 🔴 高 | 人/车轨迹 |
| Zone Graph | 🟡 中 | 区域拓扑 |
| 行为规则引擎 | 🟡 中 | 路径+停留+时段 |
| 多传感器融合 | 🟡 中 | 降噪策略 |

### 8.3 Phase 3: 联防增强
| 功能 | 优先级 | 说明 |
|------|--------|------|
| 推送通知 | 🔴 高 | APNs/FCM |
| 事件共享策略 | 🟡 中 | 按严重程度 |
| 事件合并 | 🟡 中 | 多户同时段 |
| 社区时间线 | 🟢 低 | 街区视图 |

### 8.4 Phase 4: iOS App
| 功能 | 优先级 | 说明 |
|------|--------|------|
| Swift/SwiftUI App | 🔴 高 | 原生 iOS |
| 推送集成 | 🔴 高 | APNs |
| 相机上传 | 🟡 中 | 快速拍照 |
| Face ID | 🟢 低 | 生物认证 |

---

## 9. 文件结构

```
neighborguard-mvp/
├── backend/
│   ├── src/
│   │   ├── index.js              # 入口文件
│   │   ├── config/
│   │   │   ├── constants.js      # Zone/Event类型定义
│   │   │   └── database.js       # Prisma客户端
│   │   ├── routes/
│   │   │   ├── auth.js           # 认证路由 (~1500行)
│   │   │   ├── circles.js        # 圈子路由
│   │   │   ├── events.js         # 事件路由
│   │   │   ├── homes.js          # 房屋路由
│   │   │   ├── zones.js          # 区域路由
│   │   │   ├── uploads.js        # 上传路由
│   │   │   └── config.js         # 配置路由
│   │   └── middleware/
│   │       ├── auth.js           # 认证中间件
│   │       └── errorHandler.js   # 错误处理
│   ├── prisma/
│   │   ├── schema.prisma         # 数据库Schema
│   │   ├── seed.js               # 种子数据
│   │   └── reset.js              # 重置脚本
│   ├── uploads/                  # 上传文件目录
│   ├── package.json
│   └── start.sh                  # Railway启动脚本
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # 主应用
│   │   ├── main.jsx              # 入口
│   │   ├── index.css             # 全局样式
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   # 认证状态
│   │   │   └── CircleContext.jsx # 圈子状态
│   │   ├── components/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── EventCard.jsx
│   │   │   ├── EventDetailModal.jsx
│   │   │   ├── CreateEventModal.jsx
│   │   │   └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── TimelinePage.jsx
│   │   │   ├── SettingsPage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── services/
│   │   │   └── api.js            # API客户端
│   │   └── utils/
│   │       └── helpers.js
│   ├── public/
│   │   └── favicon.svg
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── PROJECT_STATUS.md             # 本文档
├── README.md
├── DEPLOY_GUIDE.md
├── RAILWAY_DEPLOYMENT.md
└── docker-compose.yml
```

---

## 10. 测试凭据

| 用途 | 值 |
|------|-----|
| 超级管理员邮箱 | admin@neighborguard.app |
| 测试验证码 | 587585 |
| 初始化管理员 API | `POST /api/auth/admin/init-super-admin` |

---

## 11. 快速启动

### 本地开发
```bash
# 后端
cd backend
cp .env.example .env  # 配置环境变量
npm install
npx prisma generate
npx prisma db push
npm run dev

# 前端
cd frontend
cp .env.example .env  # 配置 VITE_API_URL
npm install
npm run dev
```

### Railway 部署
1. 创建 PostgreSQL 服务
2. 创建 Backend 服务 (Root: backend)
3. 创建 Frontend 服务 (Root: frontend)
4. 配置环境变量
5. 调用 `POST /api/auth/admin/init-super-admin`

---

## 12. 已知问题与限制

1. **无推送通知** - 用户需主动刷新查看新事件
2. **无实时更新** - 无 WebSocket，需手动刷新
3. **无摄像头集成** - 仅支持手动上传媒体
4. **无传感器支持** - 无门磁/PIR 等设备接入
5. **无 HA 集成** - 外部系统无法推送事件
6. **单语言** - 仅中文界面

---

## 13. 下一阶段建议

### Phase 1B 优先实现：
1. **House Mode API** - 模式管理（最简单）
2. **Sensor 实体** - 数据库 Schema 扩展
3. **HA Webhook** - `/integrations/ha/events`
4. **设备映射** - 外部设备 → 内部 Sensor/Zone

### 预计工作量：2-3 天

---

*文档结束 - 如有问题请参考蓝图文档或代码*
