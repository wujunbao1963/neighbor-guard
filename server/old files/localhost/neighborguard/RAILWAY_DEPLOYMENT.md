# NeighborGuard MVP - Railway 部署指南

## 项目结构
```
neighborguard-mvp/
├── backend/          # Express + Prisma API
├── frontend/         # React + Vite SPA
└── README.md
```

## 先决条件
- Railway 账户
- GitHub 账户 (已连接到 Railway)
- Railway PostgreSQL 数据库 (已创建)

## 部署步骤

### 1. GitHub 仓库设置
仓库已推送到: `https://github.com/wujunbao1963/neighborguard-mvp`

### 2. 部署后端到 Railway

#### 步骤 2.1: 创建后端服务
1. 登录 Railway Dashboard
2. 选择你的项目 (包含 PostgreSQL 的项目)
3. 点击 "New Service" → "GitHub Repo"
4. 选择 `wujunbao1963/neighborguard-mvp` 仓库
5. 服务名称: `neighborguard-backend`

#### 步骤 2.2: 配置后端
在 Railway 后端服务设置中:

**Variables (环境变量):**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
PORT=3001
JWT_SECRET=<生成一个安全的密钥>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
DEV_SKIP_EMAIL=true
AUTH_TEST_MODE=true
AUTH_TEST_CODE=587585
AUTH_CODE_EXPIRES_MINUTES=10
AUTH_CODE_MAX_ATTEMPTS=5
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
FRONTEND_URL=${{neighborguard-frontend.RAILWAY_PUBLIC_DOMAIN}}
```

**Settings:**
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Watch Paths: `backend/**`

**生成 JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 部署前端到 Railway

#### 步骤 3.1: 创建前端服务
1. 在同一个 Railway 项目中
2. 点击 "New Service" → "GitHub Repo"
3. 选择 `wujunbao1963/neighborguard-mvp` 仓库
4. 服务名称: `neighborguard-frontend`

#### 步骤 3.2: 配置前端
在 Railway 前端服务设置中:

**Variables (环境变量):**
```
VITE_API_URL=https://${{neighborguard-backend.RAILWAY_PUBLIC_DOMAIN}}
```

**Settings:**
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Start Command: `npm run preview`
- Watch Paths: `frontend/**`

### 4. 数据库初始化

后端首次部署后，会自动运行:
1. `prisma generate` - 生成 Prisma Client
2. `prisma db push` - 推送数据库架构
3. `node prisma/seed.js` - 初始化种子数据

检查后端日志确认数据库初始化成功。

### 5. 验证部署

#### 检查后端
访问: `https://your-backend-url.railway.app/api/config/zones?houseType=DETACHED`
应该返回 JSON 数据

#### 检查前端
访问: `https://your-frontend-url.railway.app`
应该显示登录页面

#### 测试登录
1. 使用白名单中的邮箱 (查看 seed.js)
2. 验证码: `587585` (测试模式固定码)

## 环境变量参考

### 后端必需变量
| 变量 | 说明 | 示例 |
|------|------|------|
| DATABASE_URL | PostgreSQL 连接字符串 | 自动从 Railway Postgres |
| JWT_SECRET | JWT 签名密钥 | 32+ 字符随机字符串 |
| NODE_ENV | 运行环境 | production |
| FRONTEND_URL | 前端 URL (CORS) | Railway 前端域名 |

### 前端必需变量
| 变量 | 说明 | 示例 |
|------|------|------|
| VITE_API_URL | 后端 API URL | Railway 后端域名 |

## 故障排除

### 后端无法连接数据库
- 检查 DATABASE_URL 是否正确引用了 Postgres 服务
- 确保 `?sslmode=require` 在连接字符串末尾

### 前端无法连接后端
- 检查 VITE_API_URL 是否正确
- 检查后端 FRONTEND_URL CORS 配置
- 查看浏览器控制台的网络请求

### 数据库未初始化
- 查看后端部署日志
- 手动运行: Railway CLI 或在 Railway 控制台执行 `npm run railway:deploy`

## 更新部署

### 更新代码
```bash
git add .
git commit -m "your message"
git push origin main
```

Railway 会自动检测更改并重新部署相应服务。

### 更新数据库架构
修改 `backend/prisma/schema.prisma` 后:
1. 推送代码到 GitHub
2. Railway 会自动运行 `prisma db push`
3. 或手动在 Railway 控制台运行: `npm run db:push`

## 监控

### Railway Dashboard
- 查看部署日志
- 监控资源使用
- 查看环境变量

### 应用日志
- 后端: 在 Railway 控制台查看实时日志
- 前端: 检查浏览器开发者工具

## 安全注意事项

1. **JWT_SECRET**: 使用强随机密钥
2. **数据库**: 使用 Railway 提供的内部 URL
3. **CORS**: 确保 FRONTEND_URL 正确配置
4. **测试模式**: 生产环境建议关闭 AUTH_TEST_MODE

## 支持

如遇问题:
1. 检查 Railway 服务日志
2. 验证环境变量配置
3. 确认服务间网络连接
4. 查看浏览器控制台错误
