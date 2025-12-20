"""
Camera Signal Source - 摄像头信号生成器

功能:
1. 从 YOLO 检测结果生成 Signal
2. 置信度映射
3. Zone 绑定
4. 与 SignalPipeline 集成
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional
from dataclasses import dataclass

# NG Edge imports
import sys
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(script_dir, '../ng-edge-prod/src'))

from ng_edge.domain.models import Signal
from ng_edge.domain.enums import SignalType
from ng_edge.hardware.reolink_ultrawide import (
    ReolinkUltrawideClient, 
    CameraConfig,
    StreamType,
)
from ng_edge.hardware.yolo_detector import YOLODetector, Detection


@dataclass
class CameraSignalConfig:
    """摄像头信号配置"""
    camera_name: str
    sensor_id: str  # 唯一传感器 ID
    zone_id: str    # 绑定的 Zone ID (OUTDOOR)
    
    # 检测配置
    detection_fps: float = 5.0
    confidence_threshold: float = 0.5
    target_classes: List[str] = None
    
    # 信号映射
    min_signal_confidence: float = 0.6  # 低于此值的检测不生成 Signal
    confidence_scaling: float = 1.0     # 置信度缩放因子
    
    def __post_init__(self):
        if self.target_classes is None:
            self.target_classes = ["person", "car"]


class CameraSignalSource:
    """
    摄像头信号源
    
    职责:
    1. 管理 RTSP 连接和 YOLO 检测
    2. 将检测结果转换为 Signal
    3. 处理帧采样和信号生成频率
    """
    
    def __init__(
        self,
        camera_config: CameraConfig,
        signal_config: CameraSignalConfig,
    ):
        self.camera_config = camera_config
        self.signal_config = signal_config
        
        # 创建客户端和检测器
        self.camera = ReolinkUltrawideClient(camera_config)
        self.detector = YOLODetector(
            model_name="yolo11n.pt",
            conf_threshold=signal_config.confidence_threshold,
            target_classes=signal_config.target_classes,
            device="cpu",
        )
        
        # 帧采样
        self.frame_interval = 1.0 / signal_config.detection_fps
        self.last_detection_time = 0.0
        
        # 统计
        self.total_frames = 0
        self.detection_runs = 0
        self.signals_generated = 0
        
        print(f"[CameraSignalSource] 初始化完成")
        print(f"  摄像头: {camera_config.name}")
        print(f"  传感器 ID: {signal_config.sensor_id}")
        print(f"  Zone ID: {signal_config.zone_id}")
        print(f"  检测 FPS: {signal_config.detection_fps}")
        print(f"  置信度阈值: {signal_config.confidence_threshold}")
    
    def connect(self) -> bool:
        """连接到摄像头"""
        return self.camera.connect()
    
    def disconnect(self):
        """断开连接"""
        self.camera.disconnect()
    
    def process_frame(self) -> Optional[Signal]:
        """
        处理一帧并可能生成 Signal
        
        Returns:
            Signal 对象，如果：
            1. 达到采样间隔
            2. 检测到目标对象
            3. 置信度 >= min_signal_confidence
            否则返回 None
        """
        import time
        
        # 读取帧
        ret, frame = self.camera.read_frame()
        if not ret or frame is None:
            return None
        
        self.total_frames += 1
        
        # 帧采样检查
        current_time = time.time()
        time_since_last = current_time - self.last_detection_time
        
        if time_since_last < self.frame_interval:
            return None  # 跳过此帧
        
        # 运行检测
        detections, _ = self.detector.detect(frame, visualize=False)
        self.detection_runs += 1
        self.last_detection_time = current_time
        
        # 如果没有检测到任何对象，返回 None
        if len(detections) == 0:
            return None
        
        # 找到置信度最高的检测
        best_detection = max(detections, key=lambda d: d.confidence)
        
        # 置信度过滤
        if best_detection.confidence < self.signal_config.min_signal_confidence:
            return None
        
        # 生成 Signal
        signal = self._create_signal(best_detection, detections)
        self.signals_generated += 1
        
        return signal
    
    def _create_signal(
        self,
        best_detection: Detection,
        all_detections: List[Detection]
    ) -> Signal:
        """
        创建 Signal 对象
        
        Args:
            best_detection: 置信度最高的检测
            all_detections: 所有检测结果
        """
        # 生成唯一 Signal ID
        signal_id = f"sig_{uuid.uuid4().hex[:12]}"
        
        # 置信度缩放
        scaled_confidence = min(
            1.0,
            best_detection.confidence * self.signal_config.confidence_scaling
        )
        
        # 构建 raw_payload
        raw_payload = {
            "detection_count": len(all_detections),
            "best_detection": {
                "class": best_detection.class_name,
                "confidence": best_detection.confidence,
                "bbox": best_detection.bbox,
                "region_index": best_detection.region_index,
            },
            "all_detections": [
                {
                    "class": det.class_name,
                    "confidence": det.confidence,
                    "bbox": det.bbox,
                }
                for det in all_detections
            ],
            "camera": {
                "name": self.camera_config.name,
                "resolution": f"{self.camera.actual_width}x{self.camera.actual_height}",
                "fps": self.camera.actual_fps,
            }
        }
        
        # 创建 Signal
        signal = Signal(
            signal_id=signal_id,
            timestamp=datetime.now(timezone.utc),  # 使用 UTC aware datetime
            sensor_id=self.signal_config.sensor_id,
            sensor_type="camera",
            signal_type=SignalType.PERSON_DETECTED,  # 使用正确的枚举值
            zone_id=self.signal_config.zone_id,
            entry_point_id=None,  # 摄像头不绑定 EntryPoint
            confidence=scaled_confidence,
            raw_payload=raw_payload,
            is_processed=False,
            is_filtered=False,
        )
        
        return signal
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            "camera_name": self.camera_config.name,
            "sensor_id": self.signal_config.sensor_id,
            "zone_id": self.signal_config.zone_id,
            "total_frames": self.total_frames,
            "detection_runs": self.detection_runs,
            "signals_generated": self.signals_generated,
            "camera_stats": self.camera.get_stats(),
            "detector_stats": self.detector.get_stats(),
        }


def test_camera_signal_source():
    """测试摄像头信号源"""
    import time
    
    print("\n" + "=" * 70)
    print("🎯 Camera Signal Source 测试")
    print("=" * 70)
    
    # 创建配置
    from ng_edge.hardware.reolink_ultrawide import StreamType
    
    camera_config = CameraConfig(
        name="Elite Floodlight WiFi",
        ip="10.0.0.155",
        username="admin",
        password="Zafac05@a",
        stream_type=StreamType.SUB,  # 使用枚举，不是字符串
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
    
    # 创建信号源
    source = CameraSignalSource(camera_config, signal_config)
    
    # 连接
    print("\n[1/3] 连接摄像头...")
    if not source.connect():
        print("❌ 连接失败")
        return False
    
    print("✅ 连接成功")
    
    # 处理帧并生成 Signal
    print("\n[2/3] 处理帧 (30秒)...")
    print("   (在摄像头前走动以触发检测)\n")
    
    start_time = time.time()
    duration = 30
    signals = []
    
    try:
        while time.time() - start_time < duration:
            signal = source.process_frame()
            
            if signal:
                signals.append(signal)
                print(f"[Signal {len(signals)}] 生成 Signal:")
                print(f"   ID: {signal.signal_id}")
                print(f"   类型: {signal.signal_type.value}")
                print(f"   置信度: {signal.confidence:.3f}")
                print(f"   Zone: {signal.zone_id}")
                print(f"   检测数: {signal.raw_payload['detection_count']}")
                print(f"   最佳: {signal.raw_payload['best_detection']['class']} "
                      f"({signal.raw_payload['best_detection']['confidence']:.3f})")
                print()
            
            time.sleep(0.01)  # 小延迟避免 CPU 100%
    
    except KeyboardInterrupt:
        print("\n⚠️  测试中断")
    
    # 统计
    print("\n[3/3] 统计信息...")
    stats = source.get_stats()
    
    print(f"\n摄像头统计:")
    print(f"   总帧数: {stats['total_frames']}")
    print(f"   检测次数: {stats['detection_runs']}")
    print(f"   生成 Signal: {stats['signals_generated']}")
    
    print(f"\n检测器统计:")
    detector_stats = stats['detector_stats']
    print(f"   总检测数: {detector_stats['detection_count']}")
    print(f"   平均推理时间: {detector_stats['avg_inference_time']*1000:.1f}ms")
    
    print(f"\nSignal 生成率:")
    if stats['detection_runs'] > 0:
        rate = stats['signals_generated'] / stats['detection_runs'] * 100
        print(f"   {rate:.1f}% ({stats['signals_generated']}/{stats['detection_runs']})")
    
    # 显示生成的 Signal
    print(f"\n生成的 Signal 列表:")
    for i, sig in enumerate(signals, 1):
        print(f"   {i}. {sig.signal_id} - {sig.timestamp.strftime('%H:%M:%S')} - "
              f"conf={sig.confidence:.3f}")
    
    # 清理
    source.disconnect()
    
    print("\n" + "=" * 70)
    print("✅ Camera Signal Source 测试完成！")
    print("=" * 70)
    
    return True


if __name__ == "__main__":
    import sys
    
    try:
        success = test_camera_signal_source()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  测试中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
