"""
Ring Keypad MQTT Integration

通过 MQTT 与 Home Assistant 集成的 Ring Keypad 交互
"""

import asyncio
import json
from typing import Optional, Dict, Any, Callable
from datetime import datetime, timezone
from enum import Enum

# paho-mqtt 是可选依赖
try:
    import paho.mqtt.client as mqtt
    HAS_MQTT = True
except ImportError:
    HAS_MQTT = False
    print("[WARN] paho-mqtt not installed, Ring Keypad integration disabled")


# =============================================================================
# Keypad 事件类型
# =============================================================================

class KeypadEvent(str, Enum):
    """Keypad 事件类型"""
    # 按键事件
    KEY_PRESSED = "key_pressed"
    PIN_ENTERED = "pin_entered"
    
    # 模式按钮
    DISARM_PRESSED = "disarm_pressed"
    HOME_PRESSED = "home_pressed"
    AWAY_PRESSED = "away_pressed"
    
    # 功能按钮
    PANIC_PRESSED = "panic_pressed"
    FIRE_PRESSED = "fire_pressed"
    MEDICAL_PRESSED = "medical_pressed"
    
    # 状态事件
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    BATTERY_LOW = "battery_low"


class KeypadState(str, Enum):
    """Keypad 显示状态"""
    DISARMED = "disarmed"           # 绿灯
    ARMING = "arming"               # 黄灯闪烁
    ARMED_HOME = "armed_home"       # 红灯
    ARMED_AWAY = "armed_away"       # 红灯
    ENTRY_DELAY = "entry_delay"     # 黄灯闪烁 + 蜂鸣
    TRIGGERED = "triggered"         # 红灯闪烁 + 警报
    ERROR = "error"                 # 所有灯闪烁


# =============================================================================
# Keypad 事件数据
# =============================================================================

class KeypadEventData:
    """Keypad 事件数据"""
    
    def __init__(
        self,
        event_type: KeypadEvent,
        timestamp: datetime,
        key: Optional[str] = None,
        pin: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.event_type = event_type
        self.timestamp = timestamp
        self.key = key
        self.pin = pin
        self.metadata = metadata or {}
    
    def __repr__(self):
        return f"KeypadEvent({self.event_type.value}, key={self.key}, pin={'***' if self.pin else None})"


# =============================================================================
# Ring Keypad MQTT Client
# =============================================================================

class RingKeypadMQTT:
    """
    Ring Keypad MQTT 客户端
    
    通过 Home Assistant MQTT 集成与 Ring Keypad 交互
    """
    
    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        username: Optional[str] = None,
        password: Optional[str] = None,
        device_id: str = "ring_keypad",
        ha_discovery_prefix: str = "homeassistant",
    ):
        """
        初始化 Ring Keypad MQTT 客户端
        
        Args:
            broker_host: MQTT broker 主机
            broker_port: MQTT broker 端口
            username: MQTT 用户名
            password: MQTT 密码
            device_id: Ring Keypad 设备 ID
            ha_discovery_prefix: Home Assistant discovery 前缀
        """
        if not HAS_MQTT:
            raise RuntimeError("paho-mqtt not installed. Install: pip install paho-mqtt")
        
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.username = username
        self.password = password
        self.device_id = device_id
        self.ha_discovery_prefix = ha_discovery_prefix
        
        # MQTT 客户端
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        
        # 回调函数
        self.on_keypad_event: Optional[Callable[[KeypadEventData], None]] = None
        
        # Topics
        self.topics = self._build_topics()
        
        # 内部状态
        self.current_pin_buffer = ""
        self.last_key_time: Optional[datetime] = None
        self.pin_timeout_sec = 10
    
    def _build_topics(self) -> Dict[str, str]:
        """构建 MQTT topic 映射"""
        return {
            # 订阅 topics (从 HA 接收)
            "keypad_state": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/state",
            "keypad_key": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/key",
            "keypad_code": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/code_entered",
            "keypad_availability": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/availability",
            
            # 发布 topics (发送到 HA)
            "set_state": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/set",
            "command": f"{self.ha_discovery_prefix}/alarm_control_panel/{self.device_id}/command",
        }
    
    def connect(self) -> bool:
        """连接到 MQTT broker"""
        try:
            self.client = mqtt.Client(client_id=f"ng_edge_{self.device_id}")
            
            # 设置认证
            if self.username and self.password:
                self.client.username_pw_set(self.username, self.password)
            
            # 设置回调
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            
            # 连接
            self.client.connect(self.broker_host, self.broker_port, keepalive=60)
            
            # 启动循环
            self.client.loop_start()
            
            print(f"[MQTT] Connecting to {self.broker_host}:{self.broker_port}...")
            return True
        
        except Exception as e:
            print(f"[ERROR] MQTT connection failed: {e}")
            return False
    
    def disconnect(self):
        """断开 MQTT 连接"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            print("[MQTT] Disconnected")
    
    def _on_connect(self, client, userdata, flags, rc):
        """MQTT 连接回调"""
        if rc == 0:
            self.connected = True
            print(f"[MQTT] Connected successfully")
            
            # 订阅所有 keypad topics
            for topic_name, topic in self.topics.items():
                if topic_name in ["keypad_state", "keypad_key", "keypad_code", "keypad_availability"]:
                    client.subscribe(topic)
                    print(f"[MQTT] Subscribed to {topic}")
            
            # 触发连接事件
            if self.on_keypad_event:
                event = KeypadEventData(
                    event_type=KeypadEvent.CONNECTED,
                    timestamp=datetime.now(timezone.utc),
                )
                self.on_keypad_event(event)
        else:
            print(f"[ERROR] MQTT connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """MQTT 断开回调"""
        self.connected = False
        print(f"[MQTT] Disconnected with code {rc}")
        
        # 触发断开事件
        if self.on_keypad_event:
            event = KeypadEventData(
                event_type=KeypadEvent.DISCONNECTED,
                timestamp=datetime.now(timezone.utc),
            )
            self.on_keypad_event(event)
    
    def _on_message(self, client, userdata, msg):
        """MQTT 消息回调"""
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')
            
            # 解析不同类型的消息
            if topic == self.topics["keypad_key"]:
                self._handle_key_press(payload)
            elif topic == self.topics["keypad_code"]:
                self._handle_code_entered(payload)
            elif topic == self.topics["keypad_state"]:
                self._handle_state_update(payload)
            elif topic == self.topics["keypad_availability"]:
                self._handle_availability(payload)
            else:
                print(f"[MQTT] Unknown topic: {topic}")
        
        except Exception as e:
            print(f"[ERROR] Failed to process message: {e}")
    
    def _handle_key_press(self, payload: str):
        """处理按键事件"""
        now = datetime.now(timezone.utc)
        
        # 解析 payload
        try:
            data = json.loads(payload)
            key = data.get("key", payload)
        except json.JSONDecodeError:
            key = payload
        
        print(f"[KEYPAD] Key pressed: {key}")
        
        # 检查 PIN 超时
        if self.last_key_time:
            elapsed = (now - self.last_key_time).total_seconds()
            if elapsed > self.pin_timeout_sec:
                self.current_pin_buffer = ""
        
        self.last_key_time = now
        
        # 处理不同按键
        if key.isdigit():
            # 数字键 - 添加到 PIN 缓冲
            self.current_pin_buffer += key
            
            # 触发按键事件
            if self.on_keypad_event:
                event = KeypadEventData(
                    event_type=KeypadEvent.KEY_PRESSED,
                    timestamp=now,
                    key=key,
                )
                self.on_keypad_event(event)
        
        elif key.lower() in ["disarm", "off"]:
            self._trigger_mode_event(KeypadEvent.DISARM_PRESSED, now)
        
        elif key.lower() in ["home", "stay"]:
            self._trigger_mode_event(KeypadEvent.HOME_PRESSED, now)
        
        elif key.lower() in ["away"]:
            self._trigger_mode_event(KeypadEvent.AWAY_PRESSED, now)
        
        elif key.lower() in ["panic", "emergency"]:
            self._trigger_mode_event(KeypadEvent.PANIC_PRESSED, now)
        
        elif key.lower() == "fire":
            self._trigger_mode_event(KeypadEvent.FIRE_PRESSED, now)
        
        elif key.lower() == "medical":
            self._trigger_mode_event(KeypadEvent.MEDICAL_PRESSED, now)
    
    def _handle_code_entered(self, payload: str):
        """处理完整 PIN 输入"""
        now = datetime.now(timezone.utc)
        
        # 解析 payload
        try:
            data = json.loads(payload)
            code = data.get("code", payload)
        except json.JSONDecodeError:
            code = payload
        
        print(f"[KEYPAD] PIN entered: ***")
        
        # 触发 PIN 事件
        if self.on_keypad_event:
            event = KeypadEventData(
                event_type=KeypadEvent.PIN_ENTERED,
                timestamp=now,
                pin=code,
            )
            self.on_keypad_event(event)
        
        # 清空 PIN 缓冲
        self.current_pin_buffer = ""
    
    def _handle_state_update(self, payload: str):
        """处理 Keypad 状态更新"""
        print(f"[KEYPAD] State update: {payload}")
        # 可以用于同步状态
    
    def _handle_availability(self, payload: str):
        """处理 Keypad 可用性"""
        available = payload.lower() in ["online", "available", "true", "1"]
        
        if available:
            print(f"[KEYPAD] Device available")
        else:
            print(f"[KEYPAD] Device unavailable")
            
            if self.on_keypad_event:
                event = KeypadEventData(
                    event_type=KeypadEvent.DISCONNECTED,
                    timestamp=datetime.now(timezone.utc),
                )
                self.on_keypad_event(event)
    
    def _trigger_mode_event(self, event_type: KeypadEvent, timestamp: datetime):
        """触发模式按钮事件"""
        if self.on_keypad_event:
            # 如果有 PIN 缓冲，附带 PIN
            pin = self.current_pin_buffer if self.current_pin_buffer else None
            
            event = KeypadEventData(
                event_type=event_type,
                timestamp=timestamp,
                pin=pin,
            )
            self.on_keypad_event(event)
            
            # 清空 PIN 缓冲
            self.current_pin_buffer = ""
    
    # =========================================================================
    # 发送命令到 Keypad
    # =========================================================================
    
    def set_state(self, state: KeypadState, countdown: Optional[int] = None):
        """
        设置 Keypad 状态（LED 和蜂鸣器）
        
        Args:
            state: Keypad 状态
            countdown: 倒计时秒数（可选）
        """
        if not self.connected:
            print("[WARN] MQTT not connected, cannot set keypad state")
            return
        
        payload = {
            "state": state.value,
        }
        
        if countdown is not None:
            payload["countdown"] = countdown
        
        self.client.publish(
            self.topics["set_state"],
            json.dumps(payload),
            qos=1,
            retain=False,
        )
        
        print(f"[KEYPAD] Set state: {state.value}" + 
              (f" (countdown: {countdown}s)" if countdown else ""))
    
    def play_tone(self, tone: str, duration: float = 0.5):
        """
        播放蜂鸣器音调
        
        Args:
            tone: 音调类型 ('beep', 'success', 'error', 'alarm')
            duration: 持续时间（秒）
        """
        if not self.connected:
            return
        
        payload = {
            "command": "play_tone",
            "tone": tone,
            "duration": duration,
        }
        
        self.client.publish(
            self.topics["command"],
            json.dumps(payload),
            qos=1,
        )
        
        print(f"[KEYPAD] Play tone: {tone}")
    
    def flash_led(self, color: str, count: int = 3):
        """
        闪烁 LED
        
        Args:
            color: LED 颜色 ('red', 'green', 'yellow', 'all')
            count: 闪烁次数
        """
        if not self.connected:
            return
        
        payload = {
            "command": "flash_led",
            "color": color,
            "count": count,
        }
        
        self.client.publish(
            self.topics["command"],
            json.dumps(payload),
            qos=1,
        )
        
        print(f"[KEYPAD] Flash LED: {color} x {count}")
    
    def display_message(self, message: str, duration: int = 5):
        """
        显示消息（如果 Keypad 支持 LCD）
        
        Args:
            message: 消息文本
            duration: 显示时长（秒）
        """
        if not self.connected:
            return
        
        payload = {
            "command": "display_message",
            "message": message,
            "duration": duration,
        }
        
        self.client.publish(
            self.topics["command"],
            json.dumps(payload),
            qos=1,
        )
        
        print(f"[KEYPAD] Display: {message}")


# =============================================================================
# Keypad 事件处理器
# =============================================================================

class KeypadEventHandler:
    """
    Keypad 事件处理器
    
    将 Keypad 事件转换为系统操作
    """
    
    def __init__(
        self,
        on_pin_verify: Callable[[str], bool],
        on_mode_change: Callable[[str, Optional[str]], bool],
        on_panic: Optional[Callable[[], None]] = None,
    ):
        """
        Args:
            on_pin_verify: PIN 验证回调 (pin) -> bool
            on_mode_change: 模式切换回调 (mode, pin) -> bool
            on_panic: 紧急按钮回调
        """
        self.on_pin_verify = on_pin_verify
        self.on_mode_change = on_mode_change
        self.on_panic = on_panic
        
        self.keypad: Optional[RingKeypadMQTT] = None
    
    def attach_keypad(self, keypad: RingKeypadMQTT):
        """附加 Keypad 客户端"""
        self.keypad = keypad
        keypad.on_keypad_event = self.handle_event
    
    def handle_event(self, event: KeypadEventData):
        """处理 Keypad 事件"""
        print(f"[HANDLER] {event}")
        
        if event.event_type == KeypadEvent.DISARM_PRESSED:
            self._handle_mode_button("DISARMED", event.pin)
        
        elif event.event_type == KeypadEvent.HOME_PRESSED:
            self._handle_mode_button("HOME", event.pin)
        
        elif event.event_type == KeypadEvent.AWAY_PRESSED:
            self._handle_mode_button("AWAY", event.pin)
        
        elif event.event_type == KeypadEvent.PIN_ENTERED:
            self._handle_pin_entered(event.pin)
        
        elif event.event_type == KeypadEvent.PANIC_PRESSED:
            self._handle_panic()
        
        elif event.event_type == KeypadEvent.FIRE_PRESSED:
            self._handle_panic("fire")
        
        elif event.event_type == KeypadEvent.MEDICAL_PRESSED:
            self._handle_panic("medical")
    
    def _handle_mode_button(self, mode: str, pin: Optional[str]):
        """处理模式按钮"""
        # 如果有 PIN，先验证
        if pin:
            if not self.on_pin_verify(pin):
                print(f"[HANDLER] PIN verification failed")
                if self.keypad:
                    self.keypad.play_tone("error")
                    self.keypad.flash_led("red", 2)
                return
        
        # 切换模式
        success = self.on_mode_change(mode, pin)
        
        if success:
            print(f"[HANDLER] Mode changed to {mode}")
            if self.keypad:
                self.keypad.play_tone("success")
                
                # 设置 Keypad 状态
                if mode == "DISARMED":
                    self.keypad.set_state(KeypadState.DISARMED)
                elif mode == "HOME":
                    self.keypad.set_state(KeypadState.ARMED_HOME)
                elif mode == "AWAY":
                    self.keypad.set_state(KeypadState.ARMED_AWAY)
        else:
            print(f"[HANDLER] Mode change failed")
            if self.keypad:
                self.keypad.play_tone("error")
    
    def _handle_pin_entered(self, pin: Optional[str]):
        """处理 PIN 输入"""
        if not pin:
            return
        
        # 验证 PIN
        valid = self.on_pin_verify(pin)
        
        if valid:
            print(f"[HANDLER] PIN valid")
            if self.keypad:
                self.keypad.play_tone("success")
        else:
            print(f"[HANDLER] PIN invalid")
            if self.keypad:
                self.keypad.play_tone("error")
                self.keypad.flash_led("red", 3)
    
    def _handle_panic(self, panic_type: str = "general"):
        """处理紧急按钮"""
        print(f"[HANDLER] PANIC: {panic_type}")
        
        if self.on_panic:
            self.on_panic()
        
        if self.keypad:
            self.keypad.set_state(KeypadState.TRIGGERED)
            self.keypad.play_tone("alarm", duration=2.0)
