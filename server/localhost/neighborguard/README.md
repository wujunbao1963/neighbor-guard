# NeighborGuard MVP - Complete (Phase 1-5)

## 🎯 完成的阶段
- ✅ **Phase 1**: PostgreSQL Schema + 种子数据 + 配置API
- ✅ **Phase 2**: 认证系统 (邮箱验证码登录)
- ✅ **Phase 3**: Circle/Home/Zone 管理API
- ✅ **Phase 4**: Event事件系统 + 文件上传
- ✅ **Phase 5**: React前端应用

---

## 🚀 快速启动

### 1. 启动数据库
```bash
docker-compose up -d
```

### 2. 启动后端
```bash
cd backend
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

### 3. 启动前端 (新终端)
```bash
cd frontend
npm install
npm run dev
```

### 4. 访问应用
打开浏览器访问 **http://localhost:3000**

测试账号: `wujunbao@test.com` (验证码在后端控制台)

---

## 📱 前端功能

### 登录页面
- 邮箱输入
- 验证码输入
- 60秒重发倒计时

### 首页 (事件列表)
- 切换圈子
- 事件筛选 (进行中/全部/已解决)
- 事件卡片显示 (类型、状态、严重性、区域、时间)
- 下拉刷新

### 事件详情页
- 完整事件信息
- 图片/视频附件
- 动态时间线
- 添加评论
- 更新状态
- 删除事件

### 创建事件页
- 选择事件类型 (动态图标)
- 选择区域 (基于事件类型白名单过滤)
- 设置严重性
- 上传图片/视频

### 设置页
- 个人信息编辑
- 房屋信息编辑
- 防区开关控制
- 成员列表查看

---

## 🧪 测试 Phase 4 - Event API

### 前置：登录获取Token
```bash
# 请求验证码
curl -X POST http://localhost:3001/api/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"email": "wujunbao@test.com"}'

# 登录 (用控制台显示的验证码)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "wujunbao@test.com", "code": "CODE_FROM_CONSOLE"}'

# 保存 accessToken 和一个 circleId
```

### Event API

```bash
# 获取圈子的所有事件
curl "http://localhost:3001/api/events/CIRCLE_ID" \
  -H "Authorization: Bearer TOKEN"

# 获取活跃事件
curl "http://localhost:3001/api/events/CIRCLE_ID?status=active" \
  -H "Authorization: Bearer TOKEN"

# 获取高风险事件
curl "http://localhost:3001/api/events/CIRCLE_ID?severity=HIGH" \
  -H "Authorization: Bearer TOKEN"

# 获取我创建的事件
curl "http://localhost:3001/api/events/CIRCLE_ID?createdBy=me" \
  -H "Authorization: Bearer TOKEN"

# 创建新事件 (需要先获取zoneId)
curl -X POST "http://localhost:3001/api/events/CIRCLE_ID" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "suspicious_person",
    "zoneId": "ZONE_ID",
    "title": "可疑人员在前门徘徊",
    "description": "下午3点左右看到一个戴帽子的人在门口走来走去",
    "severity": "MEDIUM"
  }'

# 获取事件详情
curl "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID" \
  -H "Authorization: Bearer TOKEN"

# 更新事件
curl -X PUT "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的标题",
    "description": "补充描述"
  }'

# 更新事件状态
curl -X PUT "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID/status" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "WATCHING"}'

# 标记已报警
curl -X PUT "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID/police" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policeReported": true,
    "policeReportNumber": "CPS-2024-12345"
  }'

# 删除事件
curl -X DELETE "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID" \
  -H "Authorization: Bearer TOKEN"
```

### Event Notes (评论/反馈)

```bash
# 添加评论
curl -X POST "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID/notes" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "noteType": "COMMENT",
    "body": "我刚从那边经过，没看到人了"
  }'

# 添加反馈 (会自动更新状态)
curl -X POST "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID/notes" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "noteType": "REACTION",
    "reactionCode": "WATCHING_SAFE_DISTANCE",
    "body": "我会在安全距离观察"
  }'

# 获取所有评论
curl "http://localhost:3001/api/events/CIRCLE_ID/EVENT_ID/notes" \
  -H "Authorization: Bearer TOKEN"
```

### File Upload (文件上传)

```bash
# 上传图片/视频到事件
curl -X POST "http://localhost:3001/api/uploads/CIRCLE_ID/EVENT_ID" \
  -H "Authorization: Bearer TOKEN" \
  -F "files=@/path/to/photo.jpg" \
  -F "files=@/path/to/video.mp4" \
  -F "sourceType=CAMERA_EXPORT"

# 获取事件的所有媒体文件
curl "http://localhost:3001/api/uploads/CIRCLE_ID/EVENT_ID" \
  -H "Authorization: Bearer TOKEN"

# 删除媒体文件
curl -X DELETE "http://localhost:3001/api/uploads/CIRCLE_ID/MEDIA_ID" \
  -H "Authorization: Bearer TOKEN"
```

---

## 📋 Event Zone 白名单

事件类型和防区有对应关系，创建事件时会自动验证：

| 事件类型 | 允许的防区 |
|----------|-----------|
| break_in_attempt | 前门、侧门、后门、车库门、地下室、阳台、楼宇大门、单元门 |
| perimeter_damage | 同上 + 后院 |
| suspicious_person | 几乎所有室外区域 |
| suspicious_vehicle | 门前街道、后街、车道、停车区 |
| unusual_noise | 几乎所有区域 |
| package_event | 前门、前院、楼宇大门、单元门、车库门、其他 |
| custom | 所有区域 |

---

## 📋 Reaction Codes (反馈码)

反馈会自动更新事件状态：

| 反馈码 | 说明 | 目标状态 |
|--------|------|----------|
| ESCALATE_RECOMMEND_CALL_POLICE | 建议报警 | ESCALATED |
| ESCALATE_CALLED_POLICE | 已帮忙报警 | ESCALATED |
| WATCHING_SAFE_DISTANCE | 安全距离观察 | WATCHING |
| NORMAL_OK | 看过觉得正常 | ACKED |
| SUSPICIOUS | 看过有点可疑 | ACKED |
| PACKAGE_TAKEN_BY_MEMBER | 已帮代取 | RESOLVED_OK |
| PACKAGE_MISSING | 包裹不见了 | RESOLVED_WARNING |

---

## 📊 测试数据

### 用户 (5人)
| 姓名 | 邮箱 |
|------|------|
| 吴军保 | wujunbao@test.com |
| 张豪 | zhanghao@test.com |
| 崔雪薇 | cuixuewei@test.com |
| 吴革会 | wugehui@test.com |
| 王桂芳 | wangguifang@test.com |

### Circle (3个)

**圈子 323 (吴军保家)**
- 吴军保: OWNER (屋主)
- 张豪: HOUSEHOLD (同住人)
- 崔雪薇: NEIGHBOR (邻居)
- 吴革会: NEIGHBOR (邻居)
- 王桂芳: NEIGHBOR (邻居)

**圈子 509 (崔雪薇家)**
- 崔雪薇: OWNER (屋主)
- 吴革会: HOUSEHOLD (同住人)
- 吴军保: NEIGHBOR (邻居)
- 张豪: NEIGHBOR (邻居)
- 王桂芳: NEIGHBOR (邻居)

**圈子 313 (王桂芳家)**
- 王桂芳: OWNER (屋主)
- 吴军保: NEIGHBOR (邻居)
- 张豪: NEIGHBOR (邻居)
- 崔雪薇: NEIGHBOR (邻居)
- 吴革会: NEIGHBOR (邻居)

---

## 📁 项目结构

```
neighborguard-mvp/
├── docker-compose.yml          # PostgreSQL容器配置
├── backend/
│   ├── package.json
│   ├── .env                    # 环境变量
│   ├── prisma/
│   │   ├── schema.prisma       # 数据库Schema
│   │   └── seed.js             # 种子数据
│   └── src/
│       ├── index.js            # Express入口
│       ├── config/
│       │   └── database.js     # Prisma客户端
│       ├── middleware/
│       │   └── errorHandler.js
│       └── routes/
│           └── config.js       # 配置API
```

---

## 🔧 常用命令

```bash
# 查看数据库 (Prisma Studio)
npm run db:studio

# 重置数据库（清空并重新seed）
npm run db:reset
npm run db:seed

# 查看数据库日志
docker logs neighborguard-db
```

---

## ✅ MVP 完成！

可以进一步增强的功能:
- 推送通知
- 实时更新 (WebSocket)
- 图片缩略图生成
- 邮件发送 (生产环境)
- 更多快捷反馈选项

