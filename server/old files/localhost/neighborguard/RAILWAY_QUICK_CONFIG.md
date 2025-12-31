# Railway 部署快速配置

## JWT Secret (已生成)
```
dde37c0a42fed0e8caa8c354dbc443e68745433e6903d41cd2afb882e831661a
```

## 后端环境变量 (复制到 Railway)
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
PORT=3001
JWT_SECRET=dde37c0a42fed0e8caa8c354dbc443e68745433e6903d41cd2afb882e831661a
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
DEV_SKIP_EMAIL=true
AUTH_TEST_MODE=true
AUTH_TEST_CODE=587585
AUTH_CODE_EXPIRES_MINUTES=10
AUTH_CODE_MAX_ATTEMPTS=5
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
FRONTEND_URL=https://${{neighborguard-frontend.RAILWAY_STATIC_URL}}
```

## 后端服务设置
- **Service Name:** neighborguard-backend
- **Root Directory:** backend
- **Build Command:** npm install && npm run build
- **Start Command:** npm start
- **Watch Paths:** backend/**

## 前端环境变量 (复制到 Railway)
```
VITE_API_URL=https://${{neighborguard-backend.RAILWAY_STATIC_URL}}
```

## 前端服务设置
- **Service Name:** neighborguard-frontend  
- **Root Directory:** frontend
- **Build Command:** npm install && npm run build
- **Start Command:** npm run preview
- **Watch Paths:** frontend/**

## 部署顺序
1. ✅ PostgreSQL 数据库 (已存在)
2. 🔹 后端服务 (backend)
3. 🔹 前端服务 (frontend)

## 测试账号
- 邮箱: 查看 backend/prisma/seed.js 中的白名单
- 验证码: 587585 (固定测试码)

## GitHub 仓库
推送到: https://github.com/wujunbao1963/neighborguard-mvp
