"""
Tests for Output Channels - 双轨输出系统测试
"""

import pytest
import asyncio
import json
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, patch

from ng_edge.services.output_channels import (
    OutputChannel,
    EdgeOutputChannel,
    CloudOutputChannel,
    OutputManager,
    HAS_AIOHTTP,
)
from ng_edge.domain.models import SecurityEvent
from ng_edge.domain.enums import AlarmState, SignalType


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def sample_event():
    """创建测试用的 SecurityEvent"""
    from ng_edge.domain.enums import EventType, WorkflowClass, EventDisposition, HouseMode
    
    now = datetime(2025, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
    
    return SecurityEvent(
        event_id="test_event_001",
        created_at=now,
        updated_at=now,
        event_type=EventType.INTRUSION_CONFIRMED,
        workflow_class=WorkflowClass.UNAUTH_ENTRY_DOOR,
        alarm_state=AlarmState.TRIGGERED,
        event_disposition=EventDisposition.PENDING,
        house_mode=HouseMode.AWAY,
        primary_zone_id="zone_front_door",
        entry_point_id="ep_main",
        evidence_ids=["evidence_001"],
        trigger_signal_id="signal_001",
        user_alert_config={
            "alert_enabled": True,
            "notification_methods": ["push", "sms"],
        },
        description="Unauthorized entry detected",
        severity="high",
        confidence=0.95,
    )


@pytest.fixture
def temp_output_dir():
    """创建临时输出目录"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


# =============================================================================
# EdgeOutputChannel Tests
# =============================================================================

class TestEdgeOutputChannel:
    """EdgeOutputChannel 测试套件"""
    
    @pytest.mark.asyncio
    async def test_create_channel(self, temp_output_dir):
        """测试创建 Edge 输出通道"""
        channel = EdgeOutputChannel(
            name="test_edge",
            output_dir=temp_output_dir,
            max_files=10,
        )
        
        assert channel.name == "test_edge"
        assert channel.enabled is True
        assert channel.success_count == 0
        assert channel.failure_count == 0
        assert Path(temp_output_dir).exists()
    
    @pytest.mark.asyncio
    async def test_send_event_creates_file(self, temp_output_dir, sample_event):
        """测试发送事件创建 JSON 文件"""
        channel = EdgeOutputChannel(
            output_dir=temp_output_dir,
            max_files=10,
        )
        
        success = await channel.send(sample_event)
        
        assert success is True
        assert channel.success_count == 1
        assert channel.failure_count == 0
        
        # 验证文件创建
        files = list(Path(temp_output_dir).glob("event_*.json"))
        assert len(files) == 1
        
        # 验证文件内容
        with open(files[0], 'r') as f:
            data = json.load(f)
        
        assert data["event_id"] == "test_event_001"
        assert data["event_type"] == "intrusion_detected"
        assert data["severity"] == "high"
        assert data["alarm_state"] == "triggered"
        assert data["zone_id"] == "zone_front_door"
    
    @pytest.mark.asyncio
    async def test_send_multiple_events(self, temp_output_dir, sample_event):
        """测试发送多个事件"""
        from ng_edge.domain.enums import EventType, WorkflowClass, HouseMode
        
        channel = EdgeOutputChannel(
            output_dir=temp_output_dir,
            max_files=10,
        )
        
        # 发送 5 个事件
        for i in range(5):
            now = datetime.now(timezone.utc)
            event = SecurityEvent(
                event_id=f"event_{i:03d}",
                created_at=now,
                updated_at=now,
                event_type=EventType.ACTIVITY_DETECTED,
                workflow_class=WorkflowClass.INTERIOR_ACTIVITY,
                alarm_state=AlarmState.QUIET,
                house_mode=HouseMode.HOME,
                primary_zone_id="zone_test",
            )
            await channel.send(event)
        
        assert channel.success_count == 5
        
        files = list(Path(temp_output_dir).glob("event_*.json"))
        assert len(files) == 5
    
    @pytest.mark.asyncio
    async def test_file_cleanup(self, temp_output_dir, sample_event):
        """测试文件自动清理"""
        from ng_edge.domain.enums import EventType, WorkflowClass, HouseMode
        
        channel = EdgeOutputChannel(
            output_dir=temp_output_dir,
            max_files=3,  # 只保留 3 个文件
        )
        
        # 发送 5 个事件
        for i in range(5):
            now = datetime.now(timezone.utc)
            event = SecurityEvent(
                event_id=f"event_{i:03d}",
                created_at=now,
                updated_at=now,
                event_type=EventType.ACTIVITY_DETECTED,
                workflow_class=WorkflowClass.INTERIOR_ACTIVITY,
                alarm_state=AlarmState.QUIET,
                house_mode=HouseMode.HOME,
                primary_zone_id="zone_test",
            )
            await channel.send(event)
            await asyncio.sleep(0.01)  # 确保文件时间戳不同
        
        # 应该只保留最新的 3 个文件
        files = list(Path(temp_output_dir).glob("event_*.json"))
        assert len(files) == 3
    
    @pytest.mark.asyncio
    async def test_disabled_channel(self, temp_output_dir, sample_event):
        """测试禁用的通道不输出"""
        channel = EdgeOutputChannel(
            output_dir=temp_output_dir,
            enabled=False,
        )
        
        success = await channel.send(sample_event)
        
        assert success is False
        assert channel.success_count == 0
        
        files = list(Path(temp_output_dir).glob("event_*.json"))
        assert len(files) == 0
    
    @pytest.mark.asyncio
    async def test_get_status(self, temp_output_dir, sample_event):
        """测试获取通道状态"""
        channel = EdgeOutputChannel(
            name="test_edge",
            output_dir=temp_output_dir,
            max_files=100,
        )
        
        # 发送事件
        await channel.send(sample_event)
        
        status = channel.get_status()
        
        assert status["name"] == "test_edge"
        assert status["enabled"] is True
        assert status["success_count"] == 1
        assert status["failure_count"] == 0
        assert status["file_count"] == 1
        assert status["output_dir"] == temp_output_dir
        assert status["max_files"] == 100


# =============================================================================
# CloudOutputChannel Tests
# =============================================================================

class TestCloudOutputChannel:
    """CloudOutputChannel 测试套件"""
    
    @pytest.mark.asyncio
    async def test_create_channel(self):
        """测试创建 Cloud 输出通道"""
        channel = CloudOutputChannel(
            name="test_cloud",
            endpoint_url="https://api.example.com/events",
            api_key="test_key_123",
            timeout=10,
            max_retries=5,
        )
        
        assert channel.name == "test_cloud"
        assert channel.endpoint_url == "https://api.example.com/events"
        assert channel.api_key == "test_key_123"
        assert channel.timeout == 10
        assert channel.max_retries == 5
        assert channel.enabled is True
    
    @pytest.mark.asyncio
    async def test_send_success(self, sample_event):
        """测试成功发送到云端"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            api_key="test_key",
        )
        
        # Mock HTTP 请求
        mock_response = Mock()
        mock_response.status = 200
        mock_response.text = AsyncMock(return_value="OK")
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.return_value = mock_response
            
            success = await channel.send(sample_event)
        
        assert success is True
        assert channel.success_count == 1
        assert channel.failure_count == 0
    
    @pytest.mark.asyncio
    async def test_send_http_error(self, sample_event):
        """测试 HTTP 错误"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            max_retries=1,  # 只重试 1 次
        )
        
        # Mock HTTP 错误
        mock_response = Mock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Internal Server Error")
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.return_value = mock_response
            
            success = await channel.send(sample_event)
        
        assert success is False
        assert channel.failure_count == 1
        assert "HTTP 500" in channel.last_error
    
    @pytest.mark.asyncio
    async def test_send_timeout(self, sample_event):
        """测试超时"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            timeout=1,
            max_retries=1,
        )
        
        # Mock 超时
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.side_effect = asyncio.TimeoutError()
            
            success = await channel.send(sample_event)
        
        assert success is False
        assert channel.failure_count == 1
        assert "Timeout" in channel.last_error
    
    @pytest.mark.asyncio
    async def test_retry_mechanism(self, sample_event):
        """测试重试机制"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            max_retries=3,
        )
        
        # 前两次失败，第三次成功
        mock_responses = [
            Mock(status=500, text=AsyncMock(return_value="Error 1")),
            Mock(status=500, text=AsyncMock(return_value="Error 2")),
            Mock(status=200, text=AsyncMock(return_value="OK")),
        ]
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.side_effect = mock_responses
            
            success = await channel.send(sample_event)
        
        assert success is True
        assert channel.success_count == 1
        assert mock_post.call_count == 3
    
    @pytest.mark.asyncio
    async def test_failed_queue(self, sample_event):
        """测试失败队列"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            max_retries=1,
        )
        
        # Mock 持续失败
        mock_response = Mock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Error")
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.return_value = mock_response
            
            await channel.send(sample_event)
        
        # 验证事件被加入失败队列
        assert len(channel.failed_queue) == 1
        assert channel.failed_queue[0].event_id == "test_event_001"
    
    @pytest.mark.asyncio
    async def test_disabled_channel(self, sample_event):
        """测试禁用的通道"""
        channel = CloudOutputChannel(
            endpoint_url="https://api.example.com/events",
            enabled=False,
        )
        
        success = await channel.send(sample_event)
        
        assert success is False
        assert channel.success_count == 0
    
    @pytest.mark.asyncio
    async def test_get_status(self):
        """测试获取状态"""
        channel = CloudOutputChannel(
            name="test_cloud",
            endpoint_url="https://api.example.com/events",
            api_key="secret",
            timeout=5,
            max_retries=3,
        )
        
        status = channel.get_status()
        
        assert status["name"] == "test_cloud"
        assert status["endpoint_url"] == "https://api.example.com/events"
        assert status["timeout"] == 5
        assert status["max_retries"] == 3
        assert status["has_api_key"] is True
        assert status["failed_queue_size"] == 0


# =============================================================================
# OutputManager Tests
# =============================================================================

class TestOutputManager:
    """OutputManager 测试套件"""
    
    @pytest.mark.asyncio
    async def test_create_manager(self):
        """测试创建输出管理器"""
        manager = OutputManager()
        
        assert len(manager.channels) == 0
        assert manager.total_events_sent == 0
        assert manager.total_events_failed == 0
    
    @pytest.mark.asyncio
    async def test_register_channels(self, temp_output_dir):
        """测试注册通道"""
        manager = OutputManager()
        
        edge_channel = EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        )
        cloud_channel = CloudOutputChannel(
            name="cloud",
            endpoint_url="https://api.example.com/events",
        )
        
        manager.register_channel(edge_channel)
        manager.register_channel(cloud_channel)
        
        assert len(manager.channels) == 2
        assert "edge" in manager.channels
        assert "cloud" in manager.channels
    
    @pytest.mark.asyncio
    async def test_send_to_all_channels(self, temp_output_dir, sample_event):
        """测试发送到所有通道"""
        manager = OutputManager()
        
        # 注册 Edge 通道
        edge_channel = EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        )
        manager.register_channel(edge_channel)
        
        # 注册 Cloud 通道 (Mock)
        cloud_channel = CloudOutputChannel(
            name="cloud",
            endpoint_url="https://api.example.com/events",
        )
        manager.register_channel(cloud_channel)
        
        # Mock Cloud 成功
        mock_response = Mock()
        mock_response.status = 200
        mock_response.text = AsyncMock(return_value="OK")
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.return_value = mock_response
            
            results = await manager.send_event(sample_event)
        
        assert results["edge"] is True
        assert results["cloud"] is True
        assert manager.total_events_sent == 1
        assert manager.total_events_failed == 0
    
    @pytest.mark.asyncio
    async def test_partial_failure(self, temp_output_dir, sample_event):
        """测试部分通道失败"""
        manager = OutputManager()
        
        # Edge 通道 (成功)
        edge_channel = EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        )
        manager.register_channel(edge_channel)
        
        # Cloud 通道 (失败)
        cloud_channel = CloudOutputChannel(
            name="cloud",
            endpoint_url="https://api.example.com/events",
            max_retries=1,
        )
        manager.register_channel(cloud_channel)
        
        # Mock Cloud 失败
        mock_response = Mock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Error")
        
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_post.return_value.__aenter__.return_value = mock_response
            
            results = await manager.send_event(sample_event)
        
        assert results["edge"] is True
        assert results["cloud"] is False
        assert manager.total_events_failed == 1
    
    @pytest.mark.asyncio
    async def test_enable_disable_channel(self, temp_output_dir, sample_event):
        """测试启用/禁用通道"""
        manager = OutputManager()
        
        edge_channel = EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        )
        manager.register_channel(edge_channel)
        
        # 禁用通道
        manager.disable_channel("edge")
        results = await manager.send_event(sample_event)
        
        assert len(results) == 0  # 禁用的通道不参与
        
        # 启用通道
        manager.enable_channel("edge")
        results = await manager.send_event(sample_event)
        
        assert results["edge"] is True
    
    @pytest.mark.asyncio
    async def test_get_status(self, temp_output_dir, sample_event):
        """测试获取管理器状态"""
        manager = OutputManager()
        
        edge_channel = EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        )
        manager.register_channel(edge_channel)
        
        await manager.send_event(sample_event)
        
        status = manager.get_status()
        
        assert status["total_events_sent"] == 1
        assert status["total_events_failed"] == 0
        assert "edge" in status["channels"]
        assert status["channels"]["edge"]["success_count"] == 1


# =============================================================================
# Integration Tests
# =============================================================================

class TestOutputIntegration:
    """集成测试"""
    
    @pytest.mark.asyncio
    async def test_full_pipeline(self, temp_output_dir):
        """测试完整的输出流程"""
        from ng_edge.domain.enums import EventType, WorkflowClass, HouseMode
        
        manager = OutputManager()
        
        # 注册两个通道
        manager.register_channel(EdgeOutputChannel(
            name="edge",
            output_dir=temp_output_dir,
        ))
        manager.register_channel(CloudOutputChannel(
            name="cloud",
            endpoint_url="https://api.example.com/events",
            api_key="test_key",
        ))
        
        # 创建多个事件
        events = [
            SecurityEvent(
                event_id=f"event_{i:03d}",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                event_type=EventType.ACTIVITY_DETECTED,
                workflow_class=WorkflowClass.INTERIOR_ACTIVITY,
                alarm_state=AlarmState.QUIET,
                house_mode=HouseMode.HOME,
                primary_zone_id="zone_test",
            )
            for i in range(10)
        ]
        
        # Mock Cloud 响应 (如果 aiohttp 可用)
        if HAS_AIOHTTP:
            mock_response = Mock()
            mock_response.status = 200
            mock_response.text = AsyncMock(return_value="OK")
            
            with patch('aiohttp.ClientSession.post') as mock_post:
                mock_post.return_value.__aenter__.return_value = mock_response
                
                # 发送所有事件
                for event in events:
                    await manager.send_event(event)
        else:
            # 如果没有 aiohttp，只测试 Edge 通道
            for event in events:
                await manager.send_event(event)
        
        # 验证结果
        assert manager.total_events_sent >= 10
        
        # 验证 Edge 文件
        files = list(Path(temp_output_dir).glob("event_*.json"))
        assert len(files) == 10
        
        # 验证状态
        status = manager.get_status()
        assert status["channels"]["edge"]["success_count"] == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
