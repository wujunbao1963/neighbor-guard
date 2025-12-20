"""
实时 RTSP + YOLO 检测

整合:
- ReolinkUltrawideClient (RTSP 流)
- YOLODetector (目标检测)
- 帧采样 (20fps → 5fps)
- 实时可视化
"""

import cv2
import time
import os
from datetime import datetime
from typing import Optional
import argparse

# 导入自定义模块
import sys
sys.path.insert(0, '/home/neighborguard/Downloads/reolink-yolo-step2/ng-edge-prod/src')

from ng_edge.hardware.reolink_ultrawide import (
    ReolinkUltrawideClient,
    CameraConfig,
    StreamType,
)
from ng_edge.hardware.yolo_detector import YOLODetector


class RealtimeDetector:
    """
    实时检测器
    
    功能:
    - RTSP 流读取
    - 帧采样
    - YOLO 检测
    - 实时显示
    """
    
    def __init__(
        self,
        camera_config: CameraConfig,
        target_fps: float = 5.0,
        yolo_conf: float = 0.5,
        display: bool = True,
        save_output: bool = False,
    ):
        """
        Args:
            camera_config: 摄像头配置
            target_fps: 目标检测 FPS（帧采样）
            yolo_conf: YOLO 置信度阈值
            display: 是否显示窗口
            save_output: 是否保存检测视频
        """
        self.camera_config = camera_config
        self.target_fps = target_fps
        self.display = display
        self.save_output = save_output
        
        # 帧采样间隔
        self.frame_interval = 1.0 / target_fps
        self.last_detection_time = 0
        
        # 创建客户端
        print("[Realtime] 创建 RTSP 客户端...")
        self.camera = ReolinkUltrawideClient(camera_config)
        
        # 创建检测器
        print("[Realtime] 创建 YOLO 检测器...")
        self.detector = YOLODetector(
            model_name="yolo11n.pt",
            conf_threshold=yolo_conf,
            target_classes=["person", "car"],
            device="cpu",
        )
        
        # 视频写入器
        self.video_writer: Optional[cv2.VideoWriter] = None
        
        # 统计
        self.total_frames = 0
        self.detection_frames = 0
        self.start_time = None
    
    def start(self, duration_sec: Optional[int] = None):
        """
        开始实时检测
        
        Args:
            duration_sec: 运行时长（秒），None = 一直运行
        """
        # 连接摄像头
        if not self.camera.connect():
            print("❌ 无法连接摄像头")
            return False
        
        self.start_time = time.time()
        
        # 创建输出目录
        output_dir = "/tmp/reolink_realtime"
        os.makedirs(output_dir, exist_ok=True)
        
        # 创建视频写入器
        if self.save_output:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            video_path = f"{output_dir}/detection_{timestamp}.mp4"
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            fps = self.target_fps
            frame_size = (self.camera.actual_width, self.camera.actual_height)
            
            self.video_writer = cv2.VideoWriter(
                video_path, fourcc, fps, frame_size
            )
            print(f"[Realtime] 录制到: {video_path}")
        
        print("\n" + "=" * 70)
        print("🎥 实时检测已启动")
        print("=" * 70)
        print(f"摄像头: {self.camera_config.name}")
        print(f"分辨率: {self.camera.actual_width}x{self.camera.actual_height}")
        print(f"源 FPS: {self.camera.actual_fps:.1f}")
        print(f"检测 FPS: {self.target_fps}")
        print(f"YOLO 阈值: {self.detector.conf_threshold}")
        if self.display:
            print("按 'q' 退出，'s' 截图")
        else:
            print("按 Ctrl+C 退出")
        print("=" * 70 + "\n")
        
        try:
            while True:
                # 检查运行时长
                if duration_sec and (time.time() - self.start_time) > duration_sec:
                    print(f"\n[Realtime] 达到运行时长 {duration_sec}s，停止")
                    break
                
                # 读取帧
                ret, frame = self.camera.read_frame()
                if not ret or frame is None:
                    print("[Realtime] 读取帧失败")
                    time.sleep(0.1)
                    continue
                
                self.total_frames += 1
                
                # 帧采样：是否需要检测
                current_time = time.time()
                time_since_last = current_time - self.last_detection_time
                
                if time_since_last >= self.frame_interval:
                    # 运行检测
                    detections, vis_frame = self.detector.detect(
                        frame, visualize=True
                    )
                    
                    self.detection_frames += 1
                    self.last_detection_time = current_time
                    
                    # 显示结果
                    if len(detections) > 0:
                        print(f"[Frame {self.total_frames}] 检测到 {len(detections)} 个对象:")
                        for det in detections:
                            print(f"  - {det.class_name}: {det.confidence:.3f}")
                    
                    # 使用可视化帧
                    display_frame = vis_frame if vis_frame is not None else frame
                else:
                    # 跳过检测
                    display_frame = frame
                
                # 绘制 OSD
                display_frame = self._draw_osd(display_frame)
                
                # 保存视频
                if self.video_writer:
                    self.video_writer.write(display_frame)
                
                # 显示
                if self.display:
                    cv2.imshow("Realtime Detection", display_frame)
                    
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        print("\n[Realtime] 用户退出")
                        break
                    elif key == ord('s'):
                        # 截图
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        screenshot_path = f"{output_dir}/screenshot_{timestamp}.jpg"
                        cv2.imwrite(screenshot_path, display_frame)
                        print(f"[Realtime] 截图: {screenshot_path}")
            
            return True
        
        except KeyboardInterrupt:
            print("\n[Realtime] 用户中断")
            return True
        
        finally:
            self._cleanup()
    
    def _draw_osd(self, frame):
        """绘制 OSD 信息"""
        frame = frame.copy()
        
        # 统计信息
        runtime = time.time() - self.start_time if self.start_time else 0
        actual_fps = self.total_frames / runtime if runtime > 0 else 0
        detection_fps = self.detection_frames / runtime if runtime > 0 else 0
        
        camera_stats = self.camera.get_stats()
        detector_stats = self.detector.get_stats()
        
        # 绘制背景
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (500, 150), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
        
        # 绘制文字
        y = 30
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        color = (0, 255, 0)
        thickness = 1
        
        lines = [
            f"Camera: {self.camera_config.name}",
            f"Resolution: {self.camera.actual_width}x{self.camera.actual_height}",
            f"Camera FPS: {actual_fps:.1f}",
            f"Detection FPS: {detection_fps:.1f} (target: {self.target_fps})",
            f"Total Detections: {detector_stats['detection_count']}",
            f"Avg Inference: {detector_stats['avg_inference_time']*1000:.1f}ms",
        ]
        
        for line in lines:
            cv2.putText(frame, line, (20, y), font, font_scale, color, thickness)
            y += 20
        
        return frame
    
    def _cleanup(self):
        """清理资源"""
        print("\n[Realtime] 清理资源...")
        
        # 断开摄像头
        if self.camera:
            self.camera.disconnect()
        
        # 关闭视频写入器
        if self.video_writer:
            self.video_writer.release()
        
        # 关闭窗口
        if self.display:
            cv2.destroyAllWindows()
        
        # 打印统计
        print("\n" + "=" * 70)
        print("📊 运行统计")
        print("=" * 70)
        
        if self.start_time:
            runtime = time.time() - self.start_time
            print(f"运行时长: {runtime:.1f}s")
            print(f"总帧数: {self.total_frames}")
            print(f"检测帧数: {self.detection_frames}")
            print(f"实际 FPS: {self.total_frames / runtime:.1f}")
            print(f"检测 FPS: {self.detection_frames / runtime:.1f}")
        
        camera_stats = self.camera.get_stats()
        detector_stats = self.detector.get_stats()
        
        print(f"\n摄像头统计:")
        print(f"  读取帧: {camera_stats['frame_count']}")
        print(f"  错误数: {camera_stats['error_count']}")
        
        print(f"\n检测器统计:")
        print(f"  检测数: {detector_stats['detection_count']}")
        print(f"  平均推理时间: {detector_stats['avg_inference_time']*1000:.1f}ms")
        print(f"  平均 FPS: {detector_stats['avg_fps']:.1f}")
        
        print("=" * 70)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="实时 RTSP + YOLO 检测")
    parser.add_argument("--ip", default="10.0.0.155", help="摄像头 IP")
    parser.add_argument("--username", default="admin", help="用户名")
    parser.add_argument("--password", default="Zafac05@a", help="密码")
    parser.add_argument("--stream", default="sub", choices=["sub", "main"], help="流类型")
    parser.add_argument("--fps", type=float, default=5.0, help="检测 FPS")
    parser.add_argument("--conf", type=float, default=0.5, help="YOLO 置信度")
    parser.add_argument("--duration", type=int, default=None, help="运行时长（秒）")
    parser.add_argument("--no-display", action="store_true", help="不显示窗口")
    parser.add_argument("--save", action="store_true", help="保存检测视频")
    
    args = parser.parse_args()
    
    # 创建配置
    config = CameraConfig(
        name="Elite Floodlight WiFi",
        ip=args.ip,
        username=args.username,
        password=args.password,
        stream_type=StreamType.SUB if args.stream == "sub" else StreamType.MAIN,
        use_tcp=True,
    )
    
    # 创建实时检测器
    detector = RealtimeDetector(
        camera_config=config,
        target_fps=args.fps,
        yolo_conf=args.conf,
        display=not args.no_display,
        save_output=args.save,
    )
    
    # 启动
    detector.start(duration_sec=args.duration)


if __name__ == "__main__":
    main()
