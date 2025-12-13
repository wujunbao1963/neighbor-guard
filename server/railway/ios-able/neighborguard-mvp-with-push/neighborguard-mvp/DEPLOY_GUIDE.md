# 🚀 NeighborGuard MVP - Railway 部署完整指南

## 📋 项目信息
- **GitHub 用户名**: wujunbao1963
- **仓库名称**: neighborguard-mvp
- **数据库**: Railway PostgreSQL (已配置)
- **DATABASE_URL**: postgresql://postgres:QXIPWSxZoNIWuUMEmhrrwLAOjcVZpwzU@postgres-wehg.railway.internal:5432/railway

## 🎯 部署步骤概览

### 第一步：推送代码到 GitHub ✅

仓库已准备就绪！所有文件已提交到本地 Git。

**你需要做的：**

1. **在 GitHub 上创建新仓库**
   - 访问: https://github.com/new
   - 仓库名: `neighborguard-mvp`
   - 可见性: Private 或 Public (推荐 Private)
   - **不要**添加 README、.gitignore 或 license (我们已有这些文件)

2. **推送代码**
   
   你可以使用以下两种方法之一：

   **方法 A - 使用我准备的脚本:**
   ```bash
   cd /home/claude/neighborguard-mvp
   ./deploy-to-github.sh
   ```

   **方法 B - 手动推送:**
   ```bash
   cd /home/claude/neighborguard-mvp
   git remote add origin https://github.com/wujunbao1963/neighborguard-mvp.git
   git push -u origin master
   ```

   💡 **如果遇到认证问题:**
   - 使用 Personal Access Token 而不是密码
   - 或配置 SSH key

---

### 第二步：在 Railway 部署后端 🔧

1. **登录 Railway**
   - 访问: https://railway.app
   - 选择包含 PostgreSQL 的项目

2. **创建后端服务**
   - 点击 **"+ New"** → **"GitHub Repo"**
   - 搜索并选择 `wujunbao1963/neighborguard-mvp`
   - Railway 会开始导入仓库

3. **配置后端服务**
   
   **A. 服务设置 (Settings)**
   - Service Name: `neighborguard-backend`
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Watch Paths: `backend/**`

   **B. 环境变量 (Variables)**
   
   点击 **Variables** 标签，添加以下变量：
   
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
   ```

   ⚠️ **重要**: `FRONTEND_URL` 需要在前端部署后添加

4. **等待部署完成**
   - 查看 **Deploy Logs** 确认部署成功
   - 确认看到 "Database seeded successfully!" 信息
   - 记下后端的 Public Domain (例如: `neighborguard-backend.up.railway.app`)

5. **测试后端**
   - 访问: `https://your-backend-url.railway.app/api/config/zones?houseType=DETACHED`
   - 应该返回 JSON 数据

---

### 第三步：在 Railway 部署前端 🎨

1. **创建前端服务**
   - 在同一个 Railway 项目中
   - 点击 **"+ New"** → **"GitHub Repo"**
   - 再次选择 `wujunbao1963/neighborguard-mvp` (同一个仓库)

2. **配置前端服务**
   
   **A. 服务设置 (Settings)**
   - Service Name: `neighborguard-frontend`
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run preview`
   - Watch Paths: `frontend/**`

   **B. 环境变量 (Variables)**
   
   ```
   VITE_API_URL=https://your-backend-url.railway.app
   ```
   
   ⚠️ 将 `your-backend-url.railway.app` 替换为第二步中记录的后端域名

3. **等待部署完成**
   - 查看 **Deploy Logs** 确认部署成功
   - 记下前端的 Public Domain (例如: `neighborguard-frontend.up.railway.app`)

---

### 第四步：更新后端 CORS 配置 🔄

回到后端服务的环境变量，添加：

```
FRONTEND_URL=https://your-frontend-url.railway.app
```

⚠️ 将 `your-frontend-url.railway.app` 替换为第三步中记录的前端域名

这将允许前端与后端进行 CORS 通信。

保存后，后端会自动重新部署。

---

### 第五步：测试应用 ✅

1. **访问前端**
   - 打开: `https://your-frontend-url.railway.app`
   - 应该看到登录页面

2. **测试登录**
   使用以下任一测试账号：
   - `wujunbao@test.com`
   - `zhanghao@test.com`
   - `cuixuewei@test.com`
   - `wugehui@test.com`
   - `wangguifang@test.com`
   
   验证码: `587585` (固定测试码)

3. **验证功能**
   - ✅ 登录成功
   - ✅ 查看 Circle 列表
   - ✅ 查看安全事件时间线
   - ✅ 创建新事件
   - ✅ 配置 Zone 设置

---

## 🔑 重要信息汇总

### JWT Secret (已生成)
```
dde37c0a42fed0e8caa8c354dbc443e68745433e6903d41cd2afb882e831661a
```

### 数据库连接
```
DATABASE_URL=postgresql://postgres:QXIPWSxZoNIWuUMEmhrrwLAOjcVZpwzU@postgres-wehg.railway.internal:5432/railway
```

### 测试账号
- 邮箱: 见上方列表
- 验证码: `587585`

### 默认 Circle 配置
- **圈子 323**: 吴军保家 (323 Maple Street NW)
- **圈子 509**: 崔雪薇家 (509 Oak Avenue NW)

---

## 🐛 故障排除

### 问题 1: 推送到 GitHub 失败
**解决方案:**
- 确保已在 GitHub 创建空仓库
- 使用 Personal Access Token 而不是密码
- 或配置 SSH key: https://docs.github.com/en/authentication

### 问题 2: 后端部署失败
**检查:**
- Root Directory 是否设置为 `backend`
- DATABASE_URL 是否正确引用 Postgres
- 查看 Deploy Logs 的具体错误信息

### 问题 3: 前端无法连接后端
**检查:**
- VITE_API_URL 是否正确
- 后端 FRONTEND_URL 是否已设置
- 两个服务是否都在运行
- 查看浏览器控制台的网络请求

### 问题 4: 数据库未初始化
**解决方案:**
- 检查后端部署日志中是否有 "Database seeded successfully!"
- 手动运行: 在 Railway 后端服务中打开 Shell，执行 `npm run railway:deploy`

---

## 📊 监控和维护

### 查看日志
- Railway Dashboard → 选择服务 → **Logs** 标签
- 查看实时部署和运行日志

### 查看数据库
- 使用 Prisma Studio (本地):
  ```bash
  cd backend
  DATABASE_URL="你的Railway数据库URL" npx prisma studio
  ```

### 更新代码
```bash
cd /home/claude/neighborguard-mvp
# 做出更改...
git add .
git commit -m "your message"
git push origin master
```
Railway 会自动检测并重新部署。

---

## 🎉 完成！

你的 NeighborGuard MVP 现在已经在 Railway 上运行了！

- 前端: `https://your-frontend-url.railway.app`
- 后端: `https://your-backend-url.railway.app`
- 数据库: Railway PostgreSQL

### 下一步
- 将测试账号分享给团队成员
- 测试所有功能
- 监控性能和错误
- 根据需要调整配置

如有问题，查看 Railway 的部署日志或参考 `RAILWAY_DEPLOYMENT.md` 获取详细信息。
