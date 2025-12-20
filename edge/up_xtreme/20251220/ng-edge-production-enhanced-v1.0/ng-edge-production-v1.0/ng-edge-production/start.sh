#!/bin/bash

# NG Edge Manager Enhanced - 启动脚本

cd "$(dirname "$0")/src"

echo "======================================================================"
echo "🛡️  NG Edge Manager Enhanced"
echo "======================================================================"
echo ""
echo "✅ 双模式输入支持:"
echo "   ✋ 手动模式 - 快速测试和演示"
echo "   📹 摄像头模式 - 实时 YOLO 检测"
echo ""
echo "🌐 访问 UI:       http://localhost:8000"
echo "📖 访问 API 文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""
echo "======================================================================"
echo ""

uvicorn ng_edge.api.manager:app --reload --host 0.0.0.0 --port 8000
