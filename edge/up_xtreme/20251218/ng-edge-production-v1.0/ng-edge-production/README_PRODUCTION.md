# NeighborGuard Edge + Ring Keypad - Production v1.0

## ✅ 完全测试验证

所有功能已在实际环境中测试通过：
- ✅ Ring Keypad 自动连接
- ✅ PIN 直接按钮操作 (1234 → DISARM)
- ✅ 兼容传统操作 (1234 → ✓ → DISARM)
- ✅ Entry Delay 安全保护
- ✅ LED 状态同步
- ✅ 音调反馈
- ✅ Manager UI 集成
- ✅ 生产就绪

---

## 🚀 全新安装

### 系统要求

- Ubuntu 24.04 LTS
- Python 3.12+
- Z-Wave JS 运行在 ws://localhost:3000
- Ring Keypad 已配对 (Node ID 2)

### 安装步骤

```bash
# 1. 解压
cd ~
tar -xzf ng-edge-production-v1.0.tar.gz
cd ng-edge-production

# 2. 运行部署脚本
sudo bash deploy_production.sh

# 3. 测试 Ring Keypad
python3 /opt/ng-edge/test_ring.py

# 4. 启动服务
sudo systemctl start ng-edge
sudo journalctl -u ng-edge -f
```

---

## 🎮 Ring Keypad 操作

### 撤防 (DISARM)

**方式 1: 直接按钮 (推荐，2步)**
```
1. 输入 1234
2. 直接按 DISARM
→ 验证 PIN → 撤防 → 绿灯
```

**方式 2: 传统方式 (兼容，3步)**
```
1. 输入 1234
2. 按 ✓
3. 按 DISARM
→ 验证 PIN → 撤防 → 绿灯
```

### 布防

**AWAY 模式**
```
直接按 AWAY
→ 系统布防 AWAY → 红灯
```

**HOME 模式**
```
直接按 HOME
→ 系统布防 HOME → 红灯
```

### Entry Delay 处理

**场景**: AWAY 模式下有人开门

```
1. 门磁触发
   → Keypad 黄灯闪烁 + 蜂鸣
   → 30 秒倒计时

2. 输入 1234 + 按 DISARM
   → 验证 PIN → 取消警报 → 绿灯

3. 如果不输入 PIN，直接按 DISARM
   → 拒绝 + 错误音
   → 继续倒计时

4. 30 秒后未撤防
   → 触发警报 → 红灯闪烁
```

---

## ⚙️ 配置

### Ring Keypad 配置

编辑: `/opt/ng-edge/ring_config.py`

```python
# Z-Wave JS WebSocket
ZWAVE_WS_URL = "ws://localhost:3000"

# Ring Keypad Node ID
RING_NODE_ID = 2  # 改成你的 Node ID

# 默认 PIN
DEFAULT_PIN = "1234"
```

修改后重启:
```bash
sudo systemctl restart ng-edge
```

### 修改 PIN

通过 API:
```bash
curl -X POST http://localhost:8000/api/set-pin \
  -H "Content-Type: application/json" \
  -d '{"new_pin": "5678"}'
```

---

## 🌐 Manager UI

访问: `http://your-ip:8000/manager`

**功能**:
- ✅ 实时查看系统状态
- ✅ Zone 管理
- ✅ Entry Point 管理
- ✅ Sensor 管理
- ✅ 模式切换
- ✅ Ring Keypad 状态显示

**注意**: 推荐使用 Ring Keypad 物理按键控制，网页作为备用。

---

## 📊 系统架构

### Ring Keypad 事件流

```
用户操作 → Ring Keypad (Z-Wave)
         ↓
    Z-Wave JS (WebSocket)
         ↓
    ring_keypad_zwave.py (驱动)
         ↓
    manager.py (事件处理)
         ↓
    SecurityCoordinator (状态机)
         ↓
    LED/音调反馈 → Ring Keypad
```

### 事件类型

| 操作 | Z-Wave Event | eventData | 系统行为 |
|------|-------------|-----------|----------|
| 输入 PIN + DISARM | eventType=3 | PIN | PIN 验证 → 撤防 |
| 输入 PIN + ✓ | eventType=2 | PIN | PIN 缓存 30秒 |
| 按 DISARM | eventType=3 | None | 使用缓存 PIN |
| 按 HOME | eventType=6 | PIN/None | HOME 模式 |
| 按 AWAY | eventType=5 | PIN/None | AWAY 模式 |

---

## 🔧 故障排查

### Ring Keypad 无响应

```bash
# 1. 检查连接
sudo journalctl -u ng-edge | grep KEYPAD

# 应该看到:
# [KEYPAD] ✅ Ring Keypad 连接成功

# 2. 测试连接
python3 /opt/ng-edge/test_ring.py

# 3. 检查 Z-Wave JS
docker ps | grep zwavejs
docker logs zwavejs | tail -20
```

### PIN 验证失败

```bash
# 检查当前 PIN
curl http://localhost:8000/api/pin-status

# 重置 PIN
curl -X POST http://localhost:8000/api/set-pin \
  -H "Content-Type: application/json" \
  -d '{"new_pin": "1234"}'
```

### Entry Delay 无法撤防

**症状**: 输入 PIN + DISARM 无效

**检查**:
```bash
# 查看日志
sudo journalctl -u ng-edge -f | grep KEYPAD

# 应该看到:
# [KEYPAD] ✅ DISARM pressed with PIN: 1234
# [KEYPAD] 使用 PIN: 1234
# [KEYPAD] 撤防成功
```

**如果看到**:
```
[KEYPAD] ❌ Entry Delay 期间必须输入 PIN 才能撤防
```

说明 PIN 没有随按钮发送，尝试：
1. 输入 1234
2. 按 ✓
3. 按 DISARM

---

## 📁 文件结构

```
/opt/ng-edge/
├── ng_edge/
│   ├── api/
│   │   └── manager.py          # Ring Keypad 集成
│   ├── hardware/
│   │   └── ring_keypad_zwave.py  # Ring 驱动
│   ├── domain/
│   ├── services/
│   └── ...
├── ring_config.py              # Ring 配置
├── start.sh                    # 启动脚本
└── test_ring.py                # 测试脚本

/etc/systemd/system/
└── ng-edge.service             # systemd 服务
```

---

## 🎯 核心功能

### Ring Keypad 集成
- ✅ 自动连接（首次 API 请求时）
- ✅ PIN 直接按钮支持
- ✅ PIN 缓存 (30秒)
- ✅ Entry Delay 安全保护
- ✅ LED 状态同步
- ✅ 音调反馈

### Manager API
- ✅ 55+ REST API 端点
- ✅ 完整 Web UI
- ✅ Zone/Entry Point/Sensor 管理
- ✅ 模式切换
- ✅ 事件日志

### 状态同步
- ✅ 系统状态 → Keypad LED
- ✅ Keypad 按键 → 系统模式
- ✅ Entry Delay → 黄灯 + 蜂鸣
- ✅ Triggered → 红灯闪烁

---

## 🔑 安全特性

1. **PIN 验证**
   - 默认 PIN: 1234
   - 可通过 API 修改
   - 错误次数限制

2. **Entry Delay 保护**
   - 必须输入 PIN 才能撤防
   - 无 PIN 尝试会被拒绝
   - 播放错误音提示

3. **PIN 缓存安全**
   - 缓存有效期 30 秒
   - 撤防成功后清除
   - 超时自动失效

---

## 📞 快速命令

```bash
# 查看服务状态
sudo systemctl status ng-edge

# 查看实时日志
sudo journalctl -u ng-edge -f

# 查看 Keypad 日志
sudo journalctl -u ng-edge | grep KEYPAD | tail -50

# 重启服务
sudo systemctl restart ng-edge

# 停止服务
sudo systemctl stop ng-edge

# 开机自启
sudo systemctl enable ng-edge

# 测试 Ring Keypad
python3 /opt/ng-edge/test_ring.py
```

---

## 🎉 完成

你的 NeighborGuard Edge 系统现在：
- ✅ Ring Keypad 完全集成
- ✅ 操作简单直观 (1234 → DISARM)
- ✅ 安全可靠
- ✅ 生产就绪

**享受你的智能安防系统！** 🛡️

---

## 📝 版本信息

- **版本**: Production v1.0
- **发布日期**: 2025-12-19
- **测试状态**: ✅ 完全验证
- **Ring Keypad**: 完全支持
- **部署平台**: Ubuntu 24.04 LTS
