"""
Output Channels - 双轨输出系统

支持多种输出通道：
- EdgeOutputChannel: 本地 JSON 文件输出
- CloudOutputChannel: HTTP POST 到云端
- OutputManager: 输出路由和管理
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path
import json
import asyncio
from dataclasses import dataclass, asdict

# aiohttp 是可选依赖（仅 CloudOutputChannel 需要）
try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

from ..domain.models import SecurityEvent


# =============================================================================
# Output Channel 抽象基类
# =============================================================================

class OutputChannel(ABC):
    """输出通道抽象基类"""
    
    def __init__(self, name: str, enabled: bool = True):
        self.name = name
        self.enabled = enabled
        self.success_count = 0
        self.failure_count = 0
        self.last_send_time: Optional[datetime] = None
        self.last_error: Optional[str] = None
    
    @abstractmethod
    async def send(self, event: SecurityEvent) -> bool:
        """
        发送事件到输出通道
        
        Returns:
            True if success, False otherwise
        """
        pass
    
    def get_status(self) -> Dict[str, Any]:
        """获取通道状态"""
        return {
            "name": self.name,
            "enabled": self.enabled,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "last_send_time": self.last_send_time.isoformat() if self.last_send_time else None,
            "last_error": self.last_error,
        }
    
    def _record_success(self):
        """记录成功"""
        self.success_count += 1
        self.last_send_time = datetime.now(timezone.utc)
        self.last_error = None
    
    def _record_failure(self, error: str):
        """记录失败"""
        self.failure_count += 1
        self.last_error = error


# =============================================================================
# Edge Output Channel (本地文件)
# =============================================================================

class EdgeOutputChannel(OutputChannel):
    """
    Edge 本地输出通道
    
    特性:
    - JSON 格式输出
    - 文件轮转 (基于数量)
    - 自动清理旧文件
    """
    
    def __init__(
        self,
        name: str = "edge",
        output_dir: str = "./output/events",
        max_files: int = 1000,
        enabled: bool = True,
    ):
        super().__init__(name, enabled)
        self.output_dir = Path(output_dir)
        self.max_files = max_files
        
        # 创建输出目录
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    async def send(self, event: SecurityEvent) -> bool:
        """写入事件到本地 JSON 文件"""
        if not self.enabled:
            return False
        
        try:
            # 生成文件名: event_<timestamp>_<event_id>.json
            timestamp = event.created_at.strftime("%Y%m%d_%H%M%S_%f")
            filename = f"event_{timestamp}_{event.event_id}.json"
            filepath = self.output_dir / filename
            
            # 序列化事件
            event_dict = self._serialize_event(event)
            
            # 写入文件
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(event_dict, f, indent=2, ensure_ascii=False)
            
            self._record_success()
            
            # 清理旧文件
            await self._cleanup_old_files()
            
            return True
        
        except Exception as e:
            error_msg = f"EdgeOutput failed: {str(e)}"
            self._record_failure(error_msg)
            print(f"[ERROR] {error_msg}")
            return False
    
    def _serialize_event(self, event: SecurityEvent) -> Dict[str, Any]:
        """序列化事件为 JSON 可写格式"""
        return {
            "event_id": event.event_id,
            "created_at": event.created_at.isoformat(),
            "updated_at": event.updated_at.isoformat(),
            "event_type": event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type),
            "workflow_class": event.workflow_class.value if hasattr(event.workflow_class, 'value') else str(event.workflow_class),
            "alarm_state": event.alarm_state.value if hasattr(event.alarm_state, 'value') else str(event.alarm_state),
            "house_mode": event.house_mode.value if hasattr(event.house_mode, 'value') else str(event.house_mode),
            "night_sub_mode": event.night_sub_mode.value if event.night_sub_mode and hasattr(event.night_sub_mode, 'value') else None,
            "primary_zone_id": event.primary_zone_id,
            "entry_point_id": event.entry_point_id,
            "evidence_ids": event.evidence_ids,
            "trigger_signal_id": event.trigger_signal_id,
            "description": event.description if hasattr(event, 'description') else None,
            "severity": event.severity if hasattr(event, 'severity') else None,
            "confidence": event.confidence if hasattr(event, 'confidence') else None,
        }
    
    async def _cleanup_old_files(self):
        """清理超过最大数量的旧文件"""
        try:
            # 获取所有事件文件
            files = sorted(
                self.output_dir.glob("event_*.json"),
                key=lambda f: f.stat().st_mtime,
                reverse=True  # 最新的在前
            )
            
            # 删除超过 max_files 的文件
            if len(files) > self.max_files:
                for old_file in files[self.max_files:]:
                    old_file.unlink()
                    print(f"[CLEANUP] Deleted old file: {old_file.name}")
        
        except Exception as e:
            print(f"[WARN] Cleanup failed: {str(e)}")
    
    def get_status(self) -> Dict[str, Any]:
        """获取通道状态（增强版）"""
        status = super().get_status()
        
        # 统计文件数量
        try:
            file_count = len(list(self.output_dir.glob("event_*.json")))
            total_size = sum(f.stat().st_size for f in self.output_dir.glob("event_*.json"))
            status.update({
                "output_dir": str(self.output_dir),
                "file_count": file_count,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "max_files": self.max_files,
            })
        except Exception as e:
            status["file_stats_error"] = str(e)
        
        return status


# =============================================================================
# Cloud Output Channel (HTTP)
# =============================================================================

class CloudOutputChannel(OutputChannel):
    """
    Cloud 输出通道
    
    特性:
    - HTTP POST 到云端
    - 重试机制 (3次)
    - 超时控制
    - 失败队列 (可选)
    """
    
    def __init__(
        self,
        name: str = "cloud",
        endpoint_url: str = "https://api.example.com/events",
        api_key: Optional[str] = None,
        timeout: int = 5,
        max_retries: int = 3,
        enabled: bool = True,
    ):
        super().__init__(name, enabled)
        
        if not HAS_AIOHTTP:
            print("[WARN] aiohttp not installed, CloudOutputChannel will be disabled")
            self.enabled = False
        
        self.endpoint_url = endpoint_url
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        
        # 失败队列 (内存中暂存)
        self.failed_queue: List[SecurityEvent] = []
        self.max_queue_size = 100
    
    async def send(self, event: SecurityEvent) -> bool:
        """发送事件到云端 API"""
        if not self.enabled:
            return False
        
        # 准备 payload
        payload = self._prepare_payload(event)
        headers = self._prepare_headers()
        
        # 重试发送
        for attempt in range(1, self.max_retries + 1):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.endpoint_url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=self.timeout)
                    ) as response:
                        if response.status in (200, 201, 202):
                            self._record_success()
                            return True
                        else:
                            error_text = await response.text()
                            error_msg = f"HTTP {response.status}: {error_text[:100]}"
                            
                            if attempt == self.max_retries:
                                self._record_failure(error_msg)
                                self._add_to_failed_queue(event)
                                return False
                            else:
                                print(f"[WARN] CloudOutput retry {attempt}/{self.max_retries}: {error_msg}")
                                await asyncio.sleep(1 * attempt)  # 指数退避
            
            except asyncio.TimeoutError:
                error_msg = f"Timeout after {self.timeout}s"
                if attempt == self.max_retries:
                    self._record_failure(error_msg)
                    self._add_to_failed_queue(event)
                    return False
                else:
                    print(f"[WARN] CloudOutput timeout, retry {attempt}/{self.max_retries}")
                    await asyncio.sleep(1 * attempt)
            
            except Exception as e:
                error_msg = f"CloudOutput error: {str(e)}"
                if attempt == self.max_retries:
                    self._record_failure(error_msg)
                    self._add_to_failed_queue(event)
                    return False
                else:
                    print(f"[WARN] CloudOutput exception, retry {attempt}/{self.max_retries}: {error_msg}")
                    await asyncio.sleep(1 * attempt)
        
        return False
    
    def _prepare_payload(self, event: SecurityEvent) -> Dict[str, Any]:
        """准备 HTTP payload"""
        return {
            "event_id": event.event_id,
            "created_at": event.created_at.isoformat(),
            "updated_at": event.updated_at.isoformat(),
            "event_type": event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type),
            "workflow_class": event.workflow_class.value if hasattr(event.workflow_class, 'value') else str(event.workflow_class),
            "alarm_state": event.alarm_state.value if hasattr(event.alarm_state, 'value') else str(event.alarm_state),
            "house_mode": event.house_mode.value if hasattr(event.house_mode, 'value') else str(event.house_mode),
            "night_sub_mode": event.night_sub_mode.value if event.night_sub_mode and hasattr(event.night_sub_mode, 'value') else None,
            "primary_zone_id": event.primary_zone_id,
            "entry_point_id": event.entry_point_id,
            "evidence_ids": event.evidence_ids,
            "trigger_signal_id": event.trigger_signal_id,
            "description": event.description if hasattr(event, 'description') else None,
            "severity": event.severity if hasattr(event, 'severity') else None,
            "confidence": event.confidence if hasattr(event, 'confidence') else None,
        }
    
    def _prepare_headers(self) -> Dict[str, str]:
        """准备 HTTP headers"""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "NeighborGuard-Edge/1.0",
        }
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        return headers
    
    def _add_to_failed_queue(self, event: SecurityEvent):
        """添加到失败队列"""
        if len(self.failed_queue) < self.max_queue_size:
            self.failed_queue.append(event)
            print(f"[QUEUE] Added event {event.event_id} to failed queue (size: {len(self.failed_queue)})")
        else:
            print(f"[WARN] Failed queue full, dropping event {event.event_id}")
    
    async def retry_failed_events(self) -> int:
        """重试失败队列中的事件"""
        if not self.failed_queue:
            return 0
        
        success_count = 0
        remaining = []
        
        for event in self.failed_queue:
            if await self.send(event):
                success_count += 1
            else:
                remaining.append(event)
        
        self.failed_queue = remaining
        return success_count
    
    def get_status(self) -> Dict[str, Any]:
        """获取通道状态（增强版）"""
        status = super().get_status()
        status.update({
            "endpoint_url": self.endpoint_url,
            "timeout": self.timeout,
            "max_retries": self.max_retries,
            "failed_queue_size": len(self.failed_queue),
            "has_api_key": self.api_key is not None,
        })
        return status


# =============================================================================
# Output Manager (输出路由管理)
# =============================================================================

class OutputManager:
    """
    输出管理器
    
    特性:
    - 管理多个输出通道
    - 并行输出（不阻塞）
    - 失败容错
    - 统计追踪
    """
    
    def __init__(self):
        self.channels: Dict[str, OutputChannel] = {}
        self.total_events_sent = 0
        self.total_events_failed = 0
    
    def register_channel(self, channel: OutputChannel):
        """注册输出通道"""
        self.channels[channel.name] = channel
        print(f"[OUTPUT] Registered channel: {channel.name}")
    
    def unregister_channel(self, name: str):
        """注销输出通道"""
        if name in self.channels:
            del self.channels[name]
            print(f"[OUTPUT] Unregistered channel: {name}")
    
    def get_channel(self, name: str) -> Optional[OutputChannel]:
        """获取指定通道"""
        return self.channels.get(name)
    
    async def send_event(self, event: SecurityEvent) -> Dict[str, bool]:
        """
        发送事件到所有启用的通道
        
        Returns:
            Dict[channel_name, success]
        """
        if not self.channels:
            print("[WARN] No output channels registered")
            return {}
        
        # 并行发送到所有通道
        tasks = []
        channel_names = []
        
        for name, channel in self.channels.items():
            if channel.enabled:
                tasks.append(channel.send(event))
                channel_names.append(name)
        
        if not tasks:
            print("[WARN] No enabled output channels")
            return {}
        
        # 等待所有任务完成
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 统计结果
        output_results = {}
        all_success = True
        
        for name, result in zip(channel_names, results):
            if isinstance(result, Exception):
                print(f"[ERROR] Channel {name} exception: {result}")
                output_results[name] = False
                all_success = False
            else:
                output_results[name] = result
                if not result:
                    all_success = False
        
        # 更新统计
        if all_success:
            self.total_events_sent += 1
        else:
            self.total_events_failed += 1
        
        return output_results
    
    def get_status(self) -> Dict[str, Any]:
        """获取所有通道状态"""
        return {
            "total_events_sent": self.total_events_sent,
            "total_events_failed": self.total_events_failed,
            "channels": {
                name: channel.get_status()
                for name, channel in self.channels.items()
            }
        }
    
    def enable_channel(self, name: str):
        """启用通道"""
        if name in self.channels:
            self.channels[name].enabled = True
            print(f"[OUTPUT] Enabled channel: {name}")
    
    def disable_channel(self, name: str):
        """禁用通道"""
        if name in self.channels:
            self.channels[name].enabled = False
            print(f"[OUTPUT] Disabled channel: {name}")
