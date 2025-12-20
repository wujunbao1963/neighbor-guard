#!/bin/bash

################################################################################
# NeighborGuard Edge + Ring Keypad - 完整部署脚本
# 版本: Production v1.0
################################################################################

set -e

echo "=" * 70
echo "🚀 NeighborGuard Edge + Ring Keypad 完整部署"
echo "=" * 70

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用 sudo 运行此脚本"
    exit 1
fi

# 配置
INSTALL_DIR="/opt/ng-edge"
SERVICE_NAME="ng-edge"

echo ""
echo "📋 部署配置:"
echo "  安装目录: $INSTALL_DIR"
echo "  服务名称: $SERVICE_NAME"
echo "  Ring Keypad: 已集成"
echo ""

# 检查源代码
echo "1️⃣  检查源代码..."
if [ ! -d "src/ng_edge" ]; then
    echo "❌ 错误: src/ng_edge 目录未找到"
    echo "   请在部署包目录运行此脚本"
    exit 1
fi
echo "   ✅ 源代码已找到"

# 安装系统依赖
echo ""
echo "2️⃣  安装系统依赖..."
apt-get update -qq
apt-get install -y \
    python3-pip \
    python3-opencv \
    libopencv-dev \
    > /dev/null 2>&1
echo "   ✅ 系统依赖已安装"

# 安装 Python 依赖
echo ""
echo "3️⃣  安装 Python 依赖..."
pip3 install --break-system-packages --ignore-installed fastapi > /dev/null 2>&1 || true
pip3 install --break-system-packages \
    uvicorn \
    pydantic \
    websockets \
    > /dev/null 2>&1
echo "   ✅ Python 依赖已安装"

# 创建安装目录
echo ""
echo "4️⃣  创建安装目录..."
mkdir -p $INSTALL_DIR
echo "   ✅ 目录已创建"

# 部署代码
echo ""
echo "5️⃣  部署代码..."
cp -r src/ng_edge $INSTALL_DIR/
echo "   ✅ 代码已部署"

# 创建配置文件
echo ""
echo "6️⃣  创建配置文件..."

cat > $INSTALL_DIR/ring_config.py << 'EOF'
"""
Ring Keypad Z-Wave JS 配置
"""

# Z-Wave JS WebSocket 配置
ZWAVE_WS_URL = "ws://localhost:3000"
RING_NODE_ID = 2

# NG Edge Manager 配置
MANAGER_HOST = "0.0.0.0"
MANAGER_PORT = 8000

# 默认 PIN
DEFAULT_PIN = "1234"

# 日志级别
LOG_LEVEL = "INFO"
EOF

echo "   ✅ ring_config.py 已创建"

# 创建启动脚本
echo ""
echo "7️⃣  创建启动脚本..."

cat > $INSTALL_DIR/start.sh << 'EOF'
#!/bin/bash
cd /opt/ng-edge
export PYTHONPATH=/opt/ng-edge:$PYTHONPATH
exec python3 -m uvicorn ng_edge.api.manager:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info
EOF

chmod +x $INSTALL_DIR/start.sh
echo "   ✅ start.sh 已创建"

# 创建测试脚本
echo ""
echo "8️⃣  创建测试脚本..."

cat > $INSTALL_DIR/test_ring.py << 'EOF'
#!/usr/bin/env python3
import asyncio
import sys
sys.path.insert(0, '/opt/ng-edge')

from ring_config import ZWAVE_WS_URL, RING_NODE_ID
from ng_edge.hardware.ring_keypad_zwave import RingKeypadZWave, KeypadState

async def test():
    print("\n🧪 Ring Keypad 快速测试\n")
    
    keypad = RingKeypadZWave(ZWAVE_WS_URL, RING_NODE_ID)
    
    event_count = 0
    
    def on_event(event):
        nonlocal event_count
        event_count += 1
        print(f"✅ 事件 #{event_count}: {event.event_type.value}")
        if event.pin:
            print(f"   PIN: {event.pin}")
    
    keypad.on_keypad_event = on_event
    
    print("⏳ 连接中...")
    if await keypad.connect():
        print("✅ 连接成功\n")
        
        print("测试 LED:")
        await keypad.set_state(KeypadState.DISARMED)
        await asyncio.sleep(1)
        await keypad.play_success()
        
        print("\n📝 请按 Ring Keypad 按键:")
        print("  - 输入 1234 + DISARM")
        print("  - 按 HOME")
        print("  - 按 AWAY")
        print("\n按 Ctrl+C 退出\n")
        
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print(f"\n\n✅ 测试完成，共收到 {event_count} 个事件")
        finally:
            await keypad.disconnect()
    else:
        print("❌ 连接失败")
        return False
    
    return True

if __name__ == "__main__":
    asyncio.run(test())
EOF

chmod +x $INSTALL_DIR/test_ring.py
echo "   ✅ test_ring.py 已创建"

# 创建 systemd 服务
echo ""
echo "9️⃣  创建 systemd 服务..."

cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=NeighborGuard Edge Security System with Ring Keypad
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment="PYTHONPATH=$INSTALL_DIR"
ExecStart=$INSTALL_DIR/start.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "   ✅ systemd 服务已创建"

# 验证安装
echo ""
echo "🔍 验证安装..."

ERRORS=0

if [ -d "$INSTALL_DIR/ng_edge" ]; then
    echo "   ✅ ng_edge 代码"
else
    echo "   ❌ ng_edge 代码缺失"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$INSTALL_DIR/ring_config.py" ]; then
    echo "   ✅ ring_config.py"
else
    echo "   ❌ ring_config.py 缺失"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$INSTALL_DIR/ng_edge/hardware/ring_keypad_zwave.py" ]; then
    echo "   ✅ ring_keypad_zwave.py"
else
    echo "   ❌ ring_keypad_zwave.py 缺失"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
    echo "   ✅ systemd 服务"
else
    echo "   ❌ systemd 服务缺失"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ 验证失败，发现 $ERRORS 个错误"
    exit 1
fi

echo ""
echo "=" * 70
echo "✅ 部署完成！"
echo "=" * 70

echo ""
echo "📋 下一步:"
echo ""
echo "1️⃣  检查配置 (如果 Node ID 不是 2):"
echo "   sudo nano $INSTALL_DIR/ring_config.py"
echo ""
echo "2️⃣  测试 Ring Keypad:"
echo "   python3 $INSTALL_DIR/test_ring.py"
echo ""
echo "3️⃣  启动服务:"
echo "   sudo systemctl start $SERVICE_NAME"
echo "   sudo systemctl status $SERVICE_NAME"
echo ""
echo "4️⃣  查看日志:"
echo "   sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "5️⃣  开机自启:"
echo "   sudo systemctl enable $SERVICE_NAME"
echo ""
echo "6️⃣  访问 Manager UI:"
echo "   http://your-ip:8000/manager"
echo ""
echo "=" * 70
echo ""
echo "🔑 Ring Keypad 操作方式:"
echo ""
echo "  撤防: 输入 1234 → 直接按 DISARM (2步)"
echo "  布防 HOME: 直接按 HOME"
echo "  布防 AWAY: 直接按 AWAY"
echo ""
echo "  Entry Delay 撤防:"
echo "    - 开门触发 Entry Delay (黄灯闪烁)"
echo "    - 输入 1234 → 按 DISARM"
echo "    - 成功撤防 (绿灯)"
echo ""
echo "=" * 70
