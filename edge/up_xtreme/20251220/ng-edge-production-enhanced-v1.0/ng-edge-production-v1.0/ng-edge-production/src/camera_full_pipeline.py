"""
Camera → Pipeline 完整集成测试

完整链路:
Camera → Signal → Debounce → Evidence → AVS → Router → AlarmSM → Event

目的: 端到端验证完整处理流程
"""

import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# 导入模块
import sys
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(script_dir, '../ng-edge-prod/src'))

from camera_signal_source import CameraSignalSource, CameraSignalConfig
from ng_edge.hardware.reolink_ultrawide import CameraConfig, StreamType
from ng_edge.domain.models import Signal, ModeConfig, Topology, Zone, EntryPoint
from ng_edge.domain.enums import (
    HouseMode,
    NightSubMode,
    ZoneType,
    LocationType,
    AlarmState,
    WorkflowClass,
    CapabilityTier,
)
from ng_edge.services.signal_pipeline import (
    SignalPipeline,
    DebounceConfig,
    ProcessedSignal,
)
from ng_edge.services.alarm_sm import AlarmSMConfig


class CameraFullPipelineIntegration:
    """
    Camera + 完整 Pipeline 集成
    
    完整链路:
    Camera → Signal → Pipeline → Event
    """
    
    def __init__(
        self,
        camera_source: CameraSignalSource,
        house_mode: HouseMode = HouseMode.AWAY,
    ):
        self.camera_source = camera_source
        self.house_mode = house_mode
        
        # 创建 Topology (简化配置)
        self.topology = self._create_topology()
        
        # 创建 Mode Config
        self.mode_config = ModeConfig(
            house_mode=house_mode,
            night_sub_mode=None,
        )
        
        # 创建 Debounce Config
        self.debounce_config = DebounceConfig(
            camera_cooldown_sec=5,  # 摄像头冷却时间
        )
        
        # 创建 AlarmSM Config
        self.alarm_config = AlarmSMConfig()
        
        # 创建 Signal Pipeline
        self.pipeline = SignalPipeline(
            mode_config=self.mode_config,
            topology=self.topology,
            debounce_config=self.debounce_config,
            alarm_config=self.alarm_config,
        )
        
        # 统计
        self.signals_generated = 0
        self.signals_processed = 0
        self.signals_filtered = 0
        self.events_created = 0
        self.processing_results: List[ProcessedSignal] = []
        
        print(f"[Pipeline] 初始化完成")
        print(f"  House Mode: {house_mode.value}")
        print(f"  Camera Cooldown: {self.debounce_config.camera_cooldown_sec}s")
        print(f"  Alarm State: {self.pipeline.alarm_sm.state.value}")
    
    def _create_topology(self) -> Topology:
        """创建简化的 Topology 配置"""
        
        # 创建 Zone
        zone_outdoor = Zone(
            zone_id="zone_outdoor_camera",
            name="Backyard Camera Zone",
            zone_type=ZoneType.EXTERIOR,
            location_type=LocationType.OUTDOOR,
            entry_point_ids=[],
            adjacent_zone_ids=[],
            is_bypass_home=False,
            is_bypass_night_occupied=False,
            capability_tier=CapabilityTier.V,  # V = Video-Verified (有摄像头)
        )
        
        topology = Topology(
            zones={"zone_outdoor_camera": zone_outdoor},
            entry_points={},
        )
        
        return topology
    
    def process_frame(self) -> Optional[ProcessedSignal]:
        """
        处理一帧
        
        Returns:
            ProcessedSignal 对象，如果没有 Signal 返回 None
        """
        # 1. 从摄像头获取 Signal
        signal = self.camera_source.process_frame()
        
        if signal is None:
            return None
        
        self.signals_generated += 1
        
        # 2. 送入 Pipeline 处理
        result = self.pipeline.process(signal)
        
        self.signals_processed += 1
        
        if result.is_filtered:
            self.signals_filtered += 1
        
        if result.event_created:
            self.events_created += 1
        
        self.processing_results.append(result)
        
        return result
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            "signals_generated": self.signals_generated,
            "signals_processed": self.signals_processed,
            "signals_filtered": self.signals_filtered,
            "events_created": self.events_created,
            "current_alarm_state": self.pipeline.alarm_sm.state.value,
            "active_event": self.pipeline._active_event is not None,
            "camera_stats": self.camera_source.get_stats(),
        }


def test_full_pipeline():
    """测试完整 Pipeline 集成"""
    
    print("\n" + "=" * 70)
    print("🎯 Camera + 完整 Pipeline 集成测试")
    print("=" * 70)
    
    # 创建摄像头配置
    camera_config = CameraConfig(
        name="Elite Floodlight WiFi",
        ip="10.0.0.155",
        username="admin",
        password="Zafac05@a",
        stream_type=StreamType.SUB,
        use_tcp=True,
    )
    
    signal_config = CameraSignalConfig(
        camera_name="Backyard Camera",
        sensor_id="cam_backyard_001",
        zone_id="zone_outdoor_camera",
        detection_fps=5.0,
        confidence_threshold=0.5,
        target_classes=["person", "car"],
        min_signal_confidence=0.6,
    )
    
    # 创建 Camera Signal Source
    print("\n[1/4] 创建 Camera Signal Source...")
    camera_source = CameraSignalSource(camera_config, signal_config)
    
    # 连接摄像头
    print("\n[2/4] 连接摄像头...")
    if not camera_source.connect():
        print("❌ 连接失败")
        return False
    print("✅ 连接成功")
    
    # 创建集成对象
    print("\n[3/4] 创建完整 Pipeline...")
    integration = CameraFullPipelineIntegration(
        camera_source=camera_source,
        house_mode=HouseMode.AWAY,
    )
    
    # 运行测试
    print("\n[4/4] 运行测试 (30秒)...")
    print("   (在摄像头前走动以触发检测)\n")
    
    start_time = time.time()
    duration = 30
    
    try:
        while time.time() - start_time < duration:
            result = integration.process_frame()
            
            if result:
                signal = result.signal
                
                print(f"[Signal {integration.signals_processed}]")
                print(f"  ID: {signal.signal_id}")
                print(f"  类型: {signal.signal_type.value}")
                print(f"  置信度: {signal.confidence:.3f}")
                
                if result.is_filtered:
                    print(f"  ⚠️  已过滤: {result.filter_reason}")
                else:
                    if result.evidence:
                        print(f"  Evidence ID: {result.evidence.evidence_id}")
                        print(f"  Signal Confidence: {result.evidence.signal_confidence:.3f}")
                    
                    if result.route_result:
                        print(f"  Workflow: {result.route_result.workflow_class.value}")
                        print(f"  Event Type: {result.route_result.event_type.value}")
                    
                    if result.transition:
                        print(f"  Alarm: {result.transition.from_state.value} → {result.transition.to_state.value}")
                    
                    if result.event_created:
                        print(f"  ✅ Event Created: {result.event_id}")
                    elif result.event_id:
                        print(f"  📝 Event Updated: {result.event_id}")
                    
                    if result.alert_result:
                        print(f"  Alert Level: {result.alert_result.user_alert_level.value}")
                
                print()
            
            time.sleep(0.01)
    
    except KeyboardInterrupt:
        print("\n⚠️  测试中断")
    
    # 统计
    print("\n" + "=" * 70)
    print("📊 测试统计")
    print("=" * 70)
    
    stats = integration.get_stats()
    
    print(f"\nSignal 处理:")
    print(f"  生成数量: {stats['signals_generated']}")
    print(f"  处理数量: {stats['signals_processed']}")
    print(f"  过滤数量: {stats['signals_filtered']}")
    print(f"  过滤率: {stats['signals_filtered']/stats['signals_processed']*100:.1f}%")
    
    print(f"\nEvent 管理:")
    print(f"  创建数量: {stats['events_created']}")
    
    print(f"\n当前状态:")
    print(f"  Alarm State: {stats['current_alarm_state']}")
    print(f"  Active Event: {'Yes' if stats['active_event'] else 'No'}")
    
    print(f"\n摄像头统计:")
    camera_stats = stats['camera_stats']
    print(f"  总帧数: {camera_stats['total_frames']}")
    print(f"  检测次数: {camera_stats['detection_runs']}")
    print(f"  Signal 生成: {camera_stats['signals_generated']}")
    
    detector_stats = camera_stats['detector_stats']
    print(f"\n检测器统计:")
    print(f"  总检测数: {detector_stats['detection_count']}")
    print(f"  平均推理时间: {detector_stats['avg_inference_time']*1000:.1f}ms")
    
    # 详细处理结果
    if len(integration.processing_results) > 0:
        print(f"\n" + "=" * 70)
        print("📋 详细处理结果")
        print("=" * 70)
        print(f"{'#':<4} {'Signal ID':<16} {'过滤':<6} {'Workflow':<16} {'Alarm':<12} {'Event':<8}")
        print("-" * 70)
        
        for i, result in enumerate(integration.processing_results, 1):
            sig_id = result.signal.signal_id[-12:]
            filtered = "是" if result.is_filtered else "否"
            
            if result.is_filtered:
                workflow = "-"
                alarm = "-"
                event = "-"
            else:
                workflow = result.route_result.workflow_class.value[:14] if result.route_result else "-"
                alarm = result.transition.to_state.value if result.transition else "-"
                event = "创建" if result.event_created else ("更新" if result.event_id else "-")
            
            print(f"{i:<4} {sig_id:<16} {filtered:<6} {workflow:<16} {alarm:<12} {event:<8}")
    
    # 清理
    camera_source.disconnect()
    
    print("\n" + "=" * 70)
    print("✅ 完整 Pipeline 集成测试完成！")
    print("=" * 70)
    
    return True


def main():
    """主函数"""
    try:
        success = test_full_pipeline()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  测试中断")
        return 1
    except Exception as e:
        print(f"\n\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
