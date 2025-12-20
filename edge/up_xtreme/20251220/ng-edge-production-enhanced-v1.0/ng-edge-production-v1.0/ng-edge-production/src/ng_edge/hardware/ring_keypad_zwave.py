"""
Ring Keypad Z-Wave JS Integration - 基于实际工作代码
"""

import asyncio
import json
import uuid
import websockets
from typing import Optional, Callable
from datetime import datetime, timezone
from enum import Enum


class KeypadEvent(str, Enum):
    """Keypad 事件类型"""
    KEY_PRESSED = "key_pressed"          # 单个按键
    PIN_ENTERED = "pin_entered"          # 完整 PIN（按✓后）
    DISARM_PRESSED = "disarm_pressed"
    HOME_PRESSED = "home_pressed"
    AWAY_PRESSED = "away_pressed"
    PANIC_PRESSED = "panic_pressed"
    FIRE_PRESSED = "fire_pressed"
    MEDICAL_PRESSED = "medical_pressed"


class KeypadState(str, Enum):
    """Keypad 显示状态"""
    DISARMED = "disarmed"
    ARMING = "arming"
    ARMED_HOME = "armed_home"
    ARMED_AWAY = "armed_away"
    ENTRY_DELAY = "entry_delay"
    TRIGGERED = "triggered"


class KeypadEventData:
    """Keypad 事件数据"""
    
    def __init__(
        self,
        event_type: KeypadEvent,
        timestamp: datetime,
        key: Optional[str] = None,
        pin: Optional[str] = None,
        raw_data: Optional[dict] = None,
    ):
        self.event_type = event_type
        self.timestamp = timestamp
        self.key = key
        self.pin = pin
        self.raw_data = raw_data or {}


class RingKeypadZWave:
    """Ring Keypad Z-Wave JS 集成 - 使用实际工作的方法"""
    
    def __init__(self, ws_url: str, node_id: int):
        self.ws_url = ws_url
        self.node_id = node_id
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        
        # 事件回调
        self.on_keypad_event: Optional[Callable[[KeypadEventData], None]] = None
        
        # PIN 缓冲
        self.pin_buffer = ""
        self.pin_timeout = 10
        self.last_key_time = 0
        
        # 监听任务
        self.listen_task: Optional[asyncio.Task] = None
    
    def _mid(self) -> str:
        """生成消息 ID"""
        return str(uuid.uuid4())
    
    async def _send(self, command: str, **kwargs):
        """发送命令"""
        payload = {"messageId": self._mid(), "command": command, **kwargs}
        await self.ws.send(json.dumps(payload))
    
    def _looks_like_entry_control(self, obj: dict) -> bool:
        """检查是否是 Entry Control 事件"""
        s = json.dumps(obj, ensure_ascii=False)
        keywords = [
            "Entry Control",
            '"commandClass":111',
            '"eventData"',
            '"eventType"',
            '"eventTypeLabel"',
            '"dataTypeLabel"',
            '"ccId":"Entry Control"',
        ]
        return any(k in s for k in keywords)
    
    async def connect(self) -> bool:
        """连接到 Z-Wave JS"""
        try:
            print(f"[ZWAVE] Connecting to {self.ws_url}...")
            self.ws = await websockets.connect(self.ws_url)
            
            # 1. 接收 version
            ver = json.loads(await self.ws.recv())
            max_schema = ver.get("maxSchemaVersion", 0)
            print(f"[ZWAVE] Connected, schema: {max_schema}")
            
            # 2. 设置 API schema
            await self._send("set_api_schema", schemaVersion=max_schema)
            
            # 3. 开始监听事件
            await self._send("start_listening")
            
            # 4. 监听 driver logs
            await self._send("driver.start_listening_logs")
            
            print(f"[ZWAVE] Subscribed to node {self.node_id} events")
            
            self.connected = True
            
            # 启动监听任务
            self.listen_task = asyncio.create_task(self._listen())
            
            return True
        
        except Exception as e:
            print(f"[ERROR] Connection failed: {e}")
            return False
    
    async def disconnect(self):
        """断开连接"""
        if self.listen_task:
            self.listen_task.cancel()
        
        if self.ws:
            await self.ws.close()
            self.connected = False
            print("[ZWAVE] Disconnected")
    
    async def _listen(self):
        """监听 WebSocket 消息 - 使用实际工作的方法"""
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                
                if msg.get("type") != "event":
                    continue
                
                ev = msg.get("event", {})
                src = ev.get("source")
                name = ev.get("event")
                
                # A) Node 事件
                if src == "node" and ev.get("nodeId") == self.node_id:
                    if self._looks_like_entry_control(msg):
                        print("\n[KEYPAD] 🎯 Entry Control Event!")
                        await self._handle_entry_control(msg)
                
                # B) Driver logs
                if src == "driver" and name == "logging":
                    text = ev.get("formattedMessage") or ev.get("message", "")
                    if text and ("Entry Control" in str(text) or "Keypad" in str(text)):
                        print(f"[KEYPAD] Driver log: {text}")
                        await self._parse_driver_log(text, msg)
        
        except Exception as e:
            print(f"[ERROR] Listen error: {e}")
            self.connected = False
    
    async def _handle_entry_control(self, msg: dict):
        """处理 Entry Control 事件"""
        ev = msg.get("event", {})
        args = ev.get("args", {})
        
        # 提取事件信息
        event_data = args.get("eventData")
        event_type = args.get("eventType")
        new_value = args.get("newValue")
        
        print(f"[KEYPAD] Entry Control: eventType={event_type}, data={event_data}, value={new_value}")
        
        # 根据 eventType 映射按键
        # eventType=2: Enter (按✓后，携带完整 PIN)
        # eventType=3: Disarm all
        # eventType=5: Away
        # eventType=6: Home
        
        if event_type == 2 and event_data:
            # PIN 输入（按✓后才触发，data 包含完整 PIN）
            pin = str(event_data)
            print(f"[KEYPAD] ✅ PIN entered: {pin}")
            
            event = KeypadEventData(
                event_type=KeypadEvent.PIN_ENTERED,
                timestamp=datetime.now(timezone.utc),
                pin=pin,
                raw_data=args,
            )
            
            if self.on_keypad_event:
                self.on_keypad_event(event)
        
        elif event_type == 3:
            # DISARM 按钮
            # 检查是否携带 PIN 数据（用户可能输入 PIN 后直接按 DISARM）
            pin = None
            if event_data:
                pin = str(event_data)
                print(f"[KEYPAD] ✅ DISARM pressed with PIN: {pin}")
            else:
                print(f"[KEYPAD] ✅ DISARM pressed (no PIN)")
            
            event = KeypadEventData(
                event_type=KeypadEvent.DISARM_PRESSED,
                timestamp=datetime.now(timezone.utc),
                pin=pin,  # 可能包含 PIN
                raw_data=args,
            )
            
            if self.on_keypad_event:
                self.on_keypad_event(event)
        
        elif event_type == 5:
            # AWAY 按钮
            pin = None
            if event_data:
                pin = str(event_data)
                print(f"[KEYPAD] ✅ AWAY pressed with PIN: {pin}")
            else:
                print(f"[KEYPAD] ✅ AWAY pressed (no PIN)")
            
            event = KeypadEventData(
                event_type=KeypadEvent.AWAY_PRESSED,
                timestamp=datetime.now(timezone.utc),
                pin=pin,
                raw_data=args,
            )
            
            if self.on_keypad_event:
                self.on_keypad_event(event)
        
        elif event_type == 6:
            # HOME 按钮
            pin = None
            if event_data:
                pin = str(event_data)
                print(f"[KEYPAD] ✅ HOME pressed with PIN: {pin}")
            else:
                print(f"[KEYPAD] ✅ HOME pressed (no PIN)")
            
            event = KeypadEventData(
                event_type=KeypadEvent.HOME_PRESSED,
                timestamp=datetime.now(timezone.utc),
                pin=pin,
                raw_data=args,
            )
            
            if self.on_keypad_event:
                self.on_keypad_event(event)
        
        else:
            # 未知 eventType
            print(f"[KEYPAD] ⚠️  Unknown eventType: {event_type}")
    
    async def _parse_driver_log(self, text: str, msg: dict):
        """从 driver log 解析按键"""
        # Driver log 主要用于调试显示
        # 实际事件处理在 _handle_entry_control 中
        pass
    
    def _trigger_event(self, event_type: KeypadEvent):
        """触发事件"""
        if self.on_keypad_event:
            event = KeypadEventData(
                event_type=event_type,
                timestamp=datetime.now(timezone.utc),
            )
            self.on_keypad_event(event)
    
    # LED 控制（发送命令到 Keypad）
    async def set_state(self, state: KeypadState, countdown: Optional[int] = None):
        """设置 Keypad 状态"""
        print(f"[KEYPAD] Set state: {state.value}")
        
        # Indicator CC (0x87 = 135)
        indicator_map = {
            KeypadState.DISARMED: 2,      # 绿灯
            KeypadState.ARMED_HOME: 1,    # 红灯
            KeypadState.ARMED_AWAY: 1,    # 红灯
            KeypadState.ENTRY_DELAY: 3,   # 黄灯
            KeypadState.TRIGGERED: 1,     # 红灯闪烁
        }
        
        indicator_id = indicator_map.get(state, 2)
        
        try:
            await self._send("node.setValue", 
                nodeId=self.node_id,
                commandClass=135,  # Indicator
                property=indicator_id,
                value=255  # 完全亮
            )
        except Exception as e:
            print(f"[KEYPAD] Set state error: {e}")
    
    async def play_success(self):
        """播放成功音调"""
        print(f"[KEYPAD] Play success tone")
        try:
            await self._send("node.setValue",
                nodeId=self.node_id,
                commandClass=121,  # Sound Switch
                property="toneId",
                value=2  # 成功音调
            )
        except Exception as e:
            print(f"[KEYPAD] Play tone error: {e}")
    
    async def play_error(self):
        """播放错误音调"""
        print(f"[KEYPAD] Play error tone")
        try:
            await self._send("node.setValue",
                nodeId=self.node_id,
                commandClass=121,  # Sound Switch
                property="toneId",
                value=3  # 错误音调
            )
        except Exception as e:
            print(f"[KEYPAD] Play tone error: {e}")
