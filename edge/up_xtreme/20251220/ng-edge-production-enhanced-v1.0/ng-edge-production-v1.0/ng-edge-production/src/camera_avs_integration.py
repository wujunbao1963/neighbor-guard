"""
Camera → AVS 最小集成测试

功能:
1. CameraSignalSource 生成 Signal
2. AVS Assessor 评估 Signal
3. 输出评估结果和调整后置信度

目的: 验证 Camera Signal → AVS 路径正确
"""

import time
from datetime import datetime, timezone
from typing import List, Dict, Any

# 导入模块
import sys
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(script_dir, '../ng-edge-prod/src'))

from camera_signal_source import CameraSignalSource, CameraSignalConfig
from ng_edge.hardware.reolink_ultrawide import CameraConfig, StreamType
from ng_edge.domain.models import Signal
from ng_edge.domain.enums import HouseMode, ZoneType, LocationType
from ng_edge.services.avs_assessor import AVSAssessor, AVSScore


class CameraAVSIntegration:
    """
    Camera + AVS 最小集成
    
    功能:
    - 从摄像头生成 Signal
    - AVS 评估 Signal
    - 输出结果统计
    """
    
    def __init__(
        self,
        camera_source: CameraSignalSource,
        house_mode: HouseMode = HouseMode.AWAY,
    ):
        self.camera_source = camera_source
        self.house_mode = house_mode
        
        # 创建 AVS Assessor
        self.avs_assessor = AVSAssessor(
            max_signal_age_sec=60,
            accuracy_weight=1.0,
            validity_weight=1.0,
            significance_weight=1.0,
        )
        
        # 统计
        self.signals_generated = 0
        self.signals_assessed = 0
        self.assessment_results: List[Dict[str, Any]] = []
        
        print(f"[CameraAVS] 初始化完成")
        print(f"  House Mode: {house_mode.value}")
    
    def process_frame(self) -> Dict[str, Any]:
        """
        处理一帧
        
        Returns:
            包含 Signal 和 AVS 评估的结果字典，如果没有 Signal 返回 None
        """
        # 1. 从摄像头获取 Signal
        signal = self.camera_source.process_frame()
        
        if signal is None:
            return None
        
        self.signals_generated += 1
        
        # 2. AVS 评估
        avs_score = self.avs_assessor.assess_signal(
            signal=signal,
            house_mode=self.house_mode,
            zone_type=ZoneType.EXTERIOR,  # 摄像头在 EXTERIOR Zone
            location_type=LocationType.OUTDOOR,  # OUTDOOR 位置
        )
        
        # 3. 调整置信度
        adjusted_confidence = self.avs_assessor.adjust_confidence(signal, avs_score)
        
        self.signals_assessed += 1
        
        # 4. 构建结果
        result = {
            "signal": signal,
            "avs_score": avs_score,
            "original_confidence": signal.confidence,
            "adjusted_confidence": adjusted_confidence,
            "timestamp": datetime.now(timezone.utc),
        }
        
        self.assessment_results.append(result)
        
        return result
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        if len(self.assessment_results) == 0:
            avg_avs = {"accuracy": 0, "validity": 0, "significance": 0, "composite": 0}
            avg_original_conf = 0
            avg_adjusted_conf = 0
        else:
            avg_avs = {
                "accuracy": sum(r["avs_score"].accuracy for r in self.assessment_results) / len(self.assessment_results),
                "validity": sum(r["avs_score"].validity for r in self.assessment_results) / len(self.assessment_results),
                "significance": sum(r["avs_score"].significance for r in self.assessment_results) / len(self.assessment_results),
                "composite": sum(r["avs_score"].composite_score for r in self.assessment_results) / len(self.assessment_results),
            }
            avg_original_conf = sum(r["original_confidence"] for r in self.assessment_results) / len(self.assessment_results)
            avg_adjusted_conf = sum(r["adjusted_confidence"] for r in self.assessment_results) / len(self.assessment_results)
        
        return {
            "signals_generated": self.signals_generated,
            "signals_assessed": self.signals_assessed,
            "assessment_count": len(self.assessment_results),
            "avg_avs_score": avg_avs,
            "avg_original_confidence": avg_original_conf,
            "avg_adjusted_confidence": avg_adjusted_conf,
            "camera_stats": self.camera_source.get_stats(),
        }


def test_camera_avs_integration():
    """测试 Camera + AVS 集成"""
    
    print("\n" + "=" * 70)
    print("🎯 Camera + AVS 最小集成测试")
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
    print("\n[3/4] 创建 AVS 集成...")
    integration = CameraAVSIntegration(
        camera_source=camera_source,
        house_mode=HouseMode.AWAY,  # 测试 AWAY 模式
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
                signal = result["signal"]
                avs_score = result["avs_score"]
                original_conf = result["original_confidence"]
                adjusted_conf = result["adjusted_confidence"]
                
                print(f"[Signal {integration.signals_assessed}]")
                print(f"  ID: {signal.signal_id}")
                print(f"  类型: {signal.signal_type.value}")
                print(f"  原始置信度: {original_conf:.3f}")
                print(f"  AVS 评分:")
                print(f"    Accuracy:     {avs_score.accuracy:.3f}")
                print(f"    Validity:     {avs_score.validity:.3f}")
                print(f"    Significance: {avs_score.significance:.3f}")
                print(f"    Composite:    {avs_score.composite_score:.3f}")
                print(f"  调整后置信度: {adjusted_conf:.3f}")
                print(f"  质量: {'✅ 高质量' if avs_score.is_high_quality else '✅ 可靠' if avs_score.is_reliable else '⚠️  低质量'}")
                print()
            
            time.sleep(0.01)  # 小延迟避免 CPU 100%
    
    except KeyboardInterrupt:
        print("\n⚠️  测试中断")
    
    # 统计
    print("\n" + "=" * 70)
    print("📊 测试统计")
    print("=" * 70)
    
    stats = integration.get_stats()
    
    print(f"\nSignal 统计:")
    print(f"  生成数量: {stats['signals_generated']}")
    print(f"  评估数量: {stats['signals_assessed']}")
    
    print(f"\nAVS 平均评分:")
    avg_avs = stats['avg_avs_score']
    print(f"  Accuracy:     {avg_avs['accuracy']:.3f}")
    print(f"  Validity:     {avg_avs['validity']:.3f}")
    print(f"  Significance: {avg_avs['significance']:.3f}")
    print(f"  Composite:    {avg_avs['composite']:.3f}")
    
    print(f"\n置信度调整:")
    print(f"  原始平均: {stats['avg_original_confidence']:.3f}")
    print(f"  调整平均: {stats['avg_adjusted_confidence']:.3f}")
    confidence_change = stats['avg_adjusted_confidence'] - stats['avg_original_confidence']
    print(f"  变化: {confidence_change:+.3f} ({confidence_change/stats['avg_original_confidence']*100:+.1f}%)")
    
    print(f"\n摄像头统计:")
    camera_stats = stats['camera_stats']
    print(f"  总帧数: {camera_stats['total_frames']}")
    print(f"  检测次数: {camera_stats['detection_runs']}")
    print(f"  Signal 生成: {camera_stats['signals_generated']}")
    
    detector_stats = camera_stats['detector_stats']
    print(f"\n检测器统计:")
    print(f"  总检测数: {detector_stats['detection_count']}")
    print(f"  平均推理时间: {detector_stats['avg_inference_time']*1000:.1f}ms")
    
    # 详细结果表
    if len(integration.assessment_results) > 0:
        print(f"\n" + "=" * 70)
        print("📋 详细评估结果")
        print("=" * 70)
        print(f"{'#':<4} {'Signal ID':<16} {'原始':<6} {'AVS':<6} {'调整':<6} {'质量':<8}")
        print("-" * 70)
        
        for i, result in enumerate(integration.assessment_results, 1):
            sig_id = result["signal"].signal_id[-12:]  # 只显示后12位
            orig = result["original_confidence"]
            comp = result["avs_score"].composite_score
            adj = result["adjusted_confidence"]
            quality = "高质量" if result["avs_score"].is_high_quality else "可靠" if result["avs_score"].is_reliable else "低质量"
            
            print(f"{i:<4} {sig_id:<16} {orig:.3f}  {comp:.3f}  {adj:.3f}  {quality:<8}")
    
    # 清理
    camera_source.disconnect()
    
    print("\n" + "=" * 70)
    print("✅ Camera + AVS 集成测试完成！")
    print("=" * 70)
    
    return True


def main():
    """主函数"""
    try:
        success = test_camera_avs_integration()
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
