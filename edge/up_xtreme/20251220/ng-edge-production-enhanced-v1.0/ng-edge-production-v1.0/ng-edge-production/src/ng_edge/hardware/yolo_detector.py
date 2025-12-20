"""
YOLO 检测器 - 针对 Reolink 超宽屏摄像头优化

基于研究论文的最佳实践:
1. 区域分割检测 (避免超宽屏畸变)
2. 使用预训练 COCO 模型
3. YOLOv11n (最快、CPU 友好)
"""

import cv2
import numpy as np
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass
from datetime import datetime
import time

# Ultralytics YOLO
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False
    print("[WARN] ultralytics not installed. Install: pip install ultralytics")


@dataclass
class Detection:
    """检测结果"""
    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[int, int, int, int]  # (x, y, w, h)
    region_index: Optional[int] = None  # 来自哪个区域


class YOLODetector:
    """
    YOLO 检测器
    
    针对超宽屏优化:
    - 支持区域检测
    - 类过滤 (只要 person, car)
    - 置信度阈值
    """
    
    def __init__(
        self,
        model_name: str = "yolo11n.pt",
        conf_threshold: float = 0.5,
        target_classes: List[str] = None,
        device: str = "cpu",
    ):
        """
        Args:
            model_name: YOLO 模型名称
            conf_threshold: 置信度阈值
            target_classes: 目标类别（None = 所有类别）
            device: 'cpu' 或 'cuda'
        """
        if not HAS_YOLO:
            raise RuntimeError("ultralytics not installed")
        
        self.model_name = model_name
        self.conf_threshold = conf_threshold
        self.target_classes = target_classes or ["person", "car"]
        self.device = device
        
        # 加载模型
        print(f"[YOLO] 加载模型: {model_name}")
        self.model = YOLO(model_name)
        
        # 移动到设备
        if device == "cuda":
            self.model.to("cuda")
        
        # COCO 类别
        self.class_names = self.model.names  # {0: 'person', 2: 'car', ...}
        
        # 过滤类别 ID
        self.target_class_ids = []
        for class_id, class_name in self.class_names.items():
            if class_name in self.target_classes:
                self.target_class_ids.append(class_id)
        
        print(f"[YOLO] 目标类别: {self.target_classes}")
        print(f"[YOLO] 目标类别 ID: {self.target_class_ids}")
        print(f"[YOLO] 置信度阈值: {conf_threshold}")
        print(f"[YOLO] 设备: {device}")
        
        # 统计
        self.frame_count = 0
        self.detection_count = 0
        self.total_inference_time = 0.0
    
    def detect(
        self,
        frame: np.ndarray,
        visualize: bool = False
    ) -> Tuple[List[Detection], Optional[np.ndarray]]:
        """
        单帧检测
        
        Args:
            frame: 输入帧
            visualize: 是否返回可视化结果
        
        Returns:
            (detections, vis_frame)
        """
        start_time = time.time()
        
        # YOLO 推理
        results = self.model(
            frame,
            conf=self.conf_threshold,
            classes=self.target_class_ids,
            verbose=False,
        )
        
        inference_time = time.time() - start_time
        self.total_inference_time += inference_time
        self.frame_count += 1
        
        # 解析结果
        detections = []
        
        for result in results:
            boxes = result.boxes
            
            for i in range(len(boxes)):
                class_id = int(boxes.cls[i])
                confidence = float(boxes.conf[i])
                bbox_xyxy = boxes.xyxy[i].cpu().numpy()
                
                # 转换为 (x, y, w, h)
                x1, y1, x2, y2 = bbox_xyxy
                x, y = int(x1), int(y1)
                w, h = int(x2 - x1), int(y2 - y1)
                
                detection = Detection(
                    class_id=class_id,
                    class_name=self.class_names[class_id],
                    confidence=confidence,
                    bbox=(x, y, w, h),
                )
                
                detections.append(detection)
                self.detection_count += 1
        
        # 可视化
        vis_frame = None
        if visualize and len(detections) > 0:
            vis_frame = frame.copy()
            for det in detections:
                x, y, w, h = det.bbox
                
                # 绘制边界框
                color = (0, 255, 0) if det.class_name == "person" else (255, 0, 0)
                cv2.rectangle(vis_frame, (x, y), (x+w, y+h), color, 2)
                
                # 绘制标签
                label = f"{det.class_name} {det.confidence:.2f}"
                cv2.putText(
                    vis_frame, label,
                    (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    2
                )
        
        return detections, vis_frame
    
    def detect_regions(
        self,
        regions: List[np.ndarray],
        region_offsets: List[Tuple[int, int]],
        visualize: bool = False
    ) -> Tuple[List[Detection], Optional[np.ndarray]]:
        """
        多区域检测（超宽屏优化）
        
        Args:
            regions: 区域帧列表
            region_offsets: 每个区域的偏移量 [(x_offset, y_offset), ...]
            visualize: 是否返回可视化结果
        
        Returns:
            (detections, vis_frame) - 所有检测结果，坐标已映射回完整画面
        """
        all_detections = []
        vis_frames = [] if visualize else None
        
        for region_idx, (region, offset) in enumerate(zip(regions, region_offsets)):
            # 检测单个区域
            detections, vis_frame = self.detect(region, visualize=visualize)
            
            # 映射坐标到完整画面
            x_offset, y_offset = offset
            for det in detections:
                x, y, w, h = det.bbox
                det.bbox = (x + x_offset, y + y_offset, w, h)
                det.region_index = region_idx
            
            all_detections.extend(detections)
            
            if visualize and vis_frame is not None:
                vis_frames.append(vis_frame)
        
        # 拼接可视化结果
        combined_vis = None
        if visualize and vis_frames:
            combined_vis = np.hstack(vis_frames)
        
        return all_detections, combined_vis
    
    def get_stats(self) -> Dict:
        """获取统计信息"""
        avg_fps = 0
        if self.total_inference_time > 0:
            avg_fps = self.frame_count / self.total_inference_time
        
        return {
            "frame_count": self.frame_count,
            "detection_count": self.detection_count,
            "total_inference_time": self.total_inference_time,
            "avg_inference_time": self.total_inference_time / self.frame_count if self.frame_count > 0 else 0,
            "avg_fps": avg_fps,
        }


def test_yolo_detector():
    """测试 YOLO 检测器"""
    print("\n" + "=" * 70)
    print("🎯 YOLO 检测器测试")
    print("=" * 70)
    
    if not HAS_YOLO:
        print("\n❌ ultralytics 未安装")
        print("   安装: pip install ultralytics")
        return False
    
    # 创建检测器
    print("\n[1/3] 创建检测器...")
    try:
        detector = YOLODetector(
            model_name="yolo11n.pt",  # Nano 模型（最快）
            conf_threshold=0.5,
            target_classes=["person", "car"],
            device="cpu",
        )
        print("✅ 检测器创建成功")
    except Exception as e:
        print(f"❌ 检测器创建失败: {e}")
        return False
    
    # 加载测试图片
    print("\n[2/3] 加载测试图片...")
    
    # 尝试加载之前保存的测试帧
    test_images = [
        "/tmp/reolink_ultrawide_test/frame_original_20251219_122524.jpg",
        "/tmp/reolink_ultrawide_test/frame_region0_20251219_122524.jpg",
        "/tmp/reolink_ultrawide_test/frame_region1_20251219_122524.jpg",
        "/tmp/reolink_ultrawide_test/frame_region2_20251219_122524.jpg",
    ]
    
    test_frame = None
    for img_path in test_images:
        try:
            test_frame = cv2.imread(img_path)
            if test_frame is not None:
                print(f"✅ 加载图片: {img_path}")
                print(f"   分辨率: {test_frame.shape}")
                break
        except:
            continue
    
    if test_frame is None:
        print("❌ 无法加载测试图片")
        print("   请先运行 reolink_ultrawide.py 生成测试图片")
        return False
    
    # 运行检测
    print("\n[3/3] 运行检测...")
    detections, vis_frame = detector.detect(test_frame, visualize=True)
    
    print(f"\n检测结果:")
    print(f"   检测到 {len(detections)} 个对象")
    
    for i, det in enumerate(detections, 1):
        print(f"   {i}. {det.class_name}: {det.confidence:.3f} @ {det.bbox}")
    
    # 保存结果
    if vis_frame is not None:
        output_path = "/tmp/reolink_ultrawide_test/yolo_detection_result.jpg"
        cv2.imwrite(output_path, vis_frame)
        print(f"\n✅ 检测结果已保存: {output_path}")
    
    # 统计
    stats = detector.get_stats()
    print(f"\n统计信息:")
    print(f"   处理帧数: {stats['frame_count']}")
    print(f"   检测数量: {stats['detection_count']}")
    print(f"   平均推理时间: {stats['avg_inference_time']*1000:.1f}ms")
    print(f"   平均 FPS: {stats['avg_fps']:.1f}")
    
    print("\n" + "=" * 70)
    print("✅ YOLO 检测器测试完成！")
    print("=" * 70)
    
    return True


if __name__ == "__main__":
    import sys
    
    try:
        success = test_yolo_detector()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  测试中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
