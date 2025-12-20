"""
Reolink 超宽屏摄像头 RTSP 客户端

支持 Reolink 180° 全景摄像头的超宽视频格式:
- Sub Stream: 1920x576 (10:3 比例)
- Main Stream: 5120x1552 (10:3 比例)
"""

import cv2
import os
import time
import numpy as np
from typing import Optional, Tuple, List
from datetime import datetime
from dataclasses import dataclass
from enum import Enum


class StreamType(str, Enum):
    """流类型"""
    SUB = "Preview_01_sub"      # 1920x576, H.264
    MAIN = "Preview_01_main"    # 5120x1552, HEVC


@dataclass
class CameraConfig:
    """Reolink 超宽屏摄像头配置"""
    name: str
    ip: str
    port: int = 554
    username: str = "admin"
    password: str = ""
    stream_type: StreamType = StreamType.SUB
    use_tcp: bool = True
    
    # 超宽屏特性
    is_ultrawide: bool = True  # 10:3 比例
    expected_width: int = 1920  # Sub stream
    expected_height: int = 576  # Sub stream
    
    def get_rtsp_url(self) -> str:
        """构建 RTSP URL"""
        return f"rtsp://{self.username}:{self.password}@{self.ip}:{self.port}/{self.stream_type.value}"
    
    def get_aspect_ratio(self) -> float:
        """获取宽高比"""
        return self.expected_width / self.expected_height


class UltrawideFrameProcessor:
    """
    超宽屏帧处理器
    
    将超宽屏视频分割为多个区域，便于处理
    """
    
    def __init__(self, width: int = 1920, height: int = 576, num_regions: int = 3):
        """
        Args:
            width: 视频宽度
            height: 视频高度
            num_regions: 分割区域数（默认3：左/中/右）
        """
        self.width = width
        self.height = height
        self.num_regions = num_regions
        self.region_width = width // num_regions
        
        print(f"[UltrawideProcessor] 超宽屏配置:")
        print(f"  总分辨率: {width}x{height}")
        print(f"  宽高比: {width/height:.2f}:1")
        print(f"  区域划分: {num_regions} 个")
        print(f"  每区域: {self.region_width}x{height}")
    
    def split_frame(self, frame: np.ndarray) -> List[np.ndarray]:
        """
        将超宽屏帧分割为多个区域
        
        Args:
            frame: 原始帧 (H, W, 3)
        
        Returns:
            区域列表
        """
        regions = []
        for i in range(self.num_regions):
            x_start = i * self.region_width
            x_end = x_start + self.region_width
            region = frame[:, x_start:x_end, :]
            regions.append(region)
        
        return regions
    
    def get_region_bbox(self, region_idx: int) -> Tuple[int, int, int, int]:
        """
        获取区域在原图中的边界框
        
        Args:
            region_idx: 区域索引 (0-based)
        
        Returns:
            (x_min, y_min, x_max, y_max)
        """
        x_min = region_idx * self.region_width
        x_max = x_min + self.region_width
        return (x_min, 0, x_max, self.height)
    
    def visualize_regions(self, frame: np.ndarray) -> np.ndarray:
        """
        可视化区域划分
        
        Args:
            frame: 原始帧
        
        Returns:
            带区域标注的帧
        """
        vis_frame = frame.copy()
        
        # 绘制分割线
        for i in range(1, self.num_regions):
            x = i * self.region_width
            cv2.line(vis_frame, (x, 0), (x, self.height), (0, 255, 0), 2)
        
        # 标注区域
        for i in range(self.num_regions):
            x_center = (i * self.region_width) + (self.region_width // 2)
            y_center = self.height // 2
            
            label = f"Region {i}"
            if i == 0:
                label = "LEFT"
            elif i == self.num_regions - 1:
                label = "RIGHT"
            else:
                label = "CENTER"
            
            cv2.putText(
                vis_frame, label,
                (x_center - 50, y_center),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (0, 255, 0),
                2
            )
        
        return vis_frame


class ReolinkUltrawideClient:
    """
    Reolink 超宽屏摄像头 RTSP 客户端
    
    特点:
    - 支持 1920x576 和 5120x1552 超宽屏分辨率
    - H.264 和 HEVC 解码
    - 区域划分处理
    """
    
    def __init__(self, config: CameraConfig):
        self.config = config
        self.rtsp_url = config.get_rtsp_url()
        
        # OpenCV VideoCapture
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_connected = False
        
        # 视频流信息
        self.actual_width = 0
        self.actual_height = 0
        self.actual_fps = 0.0
        self.fourcc = ""
        
        # 超宽屏处理器
        self.processor: Optional[UltrawideFrameProcessor] = None
        
        # 统计信息
        self.frame_count = 0
        self.error_count = 0
        self.last_frame_time: Optional[float] = None
        self.connection_start_time: Optional[float] = None
        
        # 设置 FFmpeg 选项
        if config.use_tcp:
            os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
        else:
            os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;udp'
    
    def connect(self) -> bool:
        """连接到 RTSP 流"""
        try:
            print(f"[{self.config.name}] 连接超宽屏 RTSP 流...")
            print(f"[{self.config.name}] URL: rtsp://{self.config.username}:***@{self.config.ip}:{self.config.port}/{self.config.stream_type.value}")
            print(f"[{self.config.name}] 传输: {'TCP' if self.config.use_tcp else 'UDP'}")
            
            # 创建 VideoCapture
            self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            
            # 设置缓冲区大小
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            # 检查是否打开成功
            if not self.cap.isOpened():
                print(f"[{self.config.name}] ❌ 无法打开 RTSP 流")
                return False
            
            # 读取第一帧
            ret, frame = self.cap.read()
            if not ret or frame is None:
                print(f"[{self.config.name}] ❌ 无法读取第一帧")
                self.cap.release()
                return False
            
            # 获取流信息
            self.actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self.actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
            
            fourcc_int = int(self.cap.get(cv2.CAP_PROP_FOURCC))
            self.fourcc = "".join([chr((fourcc_int >> 8 * i) & 0xFF) for i in range(4)])
            
            print(f"[{self.config.name}] ✅ 连接成功")
            print(f"[{self.config.name}]    分辨率: {self.actual_width}x{self.actual_height}")
            print(f"[{self.config.name}]    宽高比: {self.actual_width/self.actual_height:.2f}:1")
            print(f"[{self.config.name}]    FPS: {self.actual_fps:.1f}")
            print(f"[{self.config.name}]    编码: {self.fourcc}")
            
            # 验证是否为超宽屏
            aspect_ratio = self.actual_width / self.actual_height
            if aspect_ratio > 3.0:
                print(f"[{self.config.name}]    ✅ 检测到超宽屏视频 (比例 {aspect_ratio:.2f}:1)")
            else:
                print(f"[{self.config.name}]    ⚠️  不是超宽屏视频 (比例 {aspect_ratio:.2f}:1)")
            
            # 创建超宽屏处理器
            self.processor = UltrawideFrameProcessor(
                width=self.actual_width,
                height=self.actual_height,
                num_regions=3  # 左/中/右
            )
            
            self.is_connected = True
            self.connection_start_time = time.time()
            self.frame_count = 0
            self.error_count = 0
            
            return True
        
        except Exception as e:
            print(f"[{self.config.name}] ❌ 连接失败: {e}")
            return False
    
    def read_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        """读取一帧"""
        if not self.is_connected or self.cap is None:
            return False, None
        
        try:
            ret, frame = self.cap.read()
            
            if ret and frame is not None:
                self.frame_count += 1
                self.last_frame_time = time.time()
                return True, frame
            else:
                self.error_count += 1
                return False, None
        
        except Exception as e:
            print(f"[{self.config.name}] ❌ 读取帧错误: {e}")
            self.error_count += 1
            return False, None
    
    def read_frame_regions(self) -> Tuple[bool, Optional[List[np.ndarray]]]:
        """
        读取一帧并分割为区域
        
        Returns:
            (success, regions) - regions 是区域列表
        """
        ret, frame = self.read_frame()
        
        if not ret or frame is None or self.processor is None:
            return False, None
        
        regions = self.processor.split_frame(frame)
        return True, regions
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        uptime = 0
        if self.connection_start_time:
            uptime = time.time() - self.connection_start_time
        
        fps = 0
        if uptime > 0:
            fps = self.frame_count / uptime
        
        return {
            "connected": self.is_connected,
            "frame_count": self.frame_count,
            "error_count": self.error_count,
            "uptime_sec": uptime,
            "actual_fps": fps,
            "stream_width": self.actual_width,
            "stream_height": self.actual_height,
            "stream_fps": self.actual_fps,
            "fourcc": self.fourcc,
            "aspect_ratio": self.actual_width / self.actual_height if self.actual_height > 0 else 0,
        }
    
    def is_healthy(self, max_error_rate: float = 0.1, max_frame_gap_sec: float = 5.0) -> bool:
        """健康检查"""
        if not self.is_connected:
            return False
        
        stats = self.get_stats()
        
        # 检查错误率
        total_attempts = stats["frame_count"] + stats["error_count"]
        if total_attempts > 0:
            error_rate = stats["error_count"] / total_attempts
            if error_rate > max_error_rate:
                return False
        
        # 检查帧间隔
        if self.last_frame_time:
            gap = time.time() - self.last_frame_time
            if gap > max_frame_gap_sec:
                return False
        
        return True
    
    def disconnect(self):
        """断开连接"""
        if self.cap:
            self.cap.release()
            self.cap = None
        
        self.is_connected = False
        print(f"[{self.config.name}] 断开连接")
    
    def reconnect(self) -> bool:
        """重连"""
        print(f"[{self.config.name}] 重新连接...")
        self.disconnect()
        time.sleep(1)
        return self.connect()


def test_ultrawide_camera():
    """测试超宽屏摄像头"""
    print("\n" + "=" * 70)
    print("🎥 Reolink 超宽屏摄像头测试")
    print("=" * 70)
    
    # 配置 Sub Stream (1920x576)
    config = CameraConfig(
        name="Elite Floodlight WiFi",
        ip="10.0.0.155",
        username="admin",
        password="Zafac05@a",
        stream_type=StreamType.SUB,
        use_tcp=True,
    )
    
    print(f"\n📋 摄像头配置:")
    print(f"   名称: {config.name}")
    print(f"   IP: {config.ip}")
    print(f"   流类型: {config.stream_type.value}")
    print(f"   传输: {'TCP' if config.use_tcp else 'UDP'}")
    
    # 创建客户端
    client = ReolinkUltrawideClient(config)
    
    # 测试 1: 连接
    print("\n[1/5] 测试连接...")
    if not client.connect():
        print("\n❌ 连接失败！")
        return False
    
    # 测试 2: 读取帧
    print("\n[2/5] 测试读取帧 (10帧)...")
    for i in range(10):
        ret, frame = client.read_frame()
        if ret:
            print(f"   ✅ 帧 {i+1}: {frame.shape}")
        else:
            print(f"   ❌ 帧 {i+1}: 失败")
        time.sleep(0.05)
    
    # 测试 3: 区域分割
    print("\n[3/5] 测试区域分割...")
    ret, regions = client.read_frame_regions()
    if ret and regions:
        print(f"   ✅ 成功分割为 {len(regions)} 个区域")
        for i, region in enumerate(regions):
            print(f"      区域 {i}: {region.shape}")
    else:
        print("   ❌ 区域分割失败")
    
    # 测试 4: 统计信息
    print("\n[4/5] 统计信息...")
    stats = client.get_stats()
    print(f"   📊 读取帧数: {stats['frame_count']}")
    print(f"   📊 错误次数: {stats['error_count']}")
    print(f"   📊 运行时间: {stats['uptime_sec']:.1f}s")
    print(f"   📊 实际 FPS: {stats['actual_fps']:.1f}")
    print(f"   📊 分辨率: {stats['stream_width']}x{stats['stream_height']}")
    print(f"   📊 宽高比: {stats['aspect_ratio']:.2f}:1")
    print(f"   📊 编码: {stats['fourcc']}")
    
    # 测试 5: 保存测试帧
    print("\n[5/5] 保存测试帧...")
    ret, frame = client.read_frame()
    if ret:
        output_dir = "/tmp/reolink_ultrawide_test"
        os.makedirs(output_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 保存原始帧
        filename_orig = f"{output_dir}/frame_original_{timestamp}.jpg"
        cv2.imwrite(filename_orig, frame)
        print(f"   ✅ 原始帧: {filename_orig}")
        
        # 保存区域可视化
        if client.processor:
            vis_frame = client.processor.visualize_regions(frame)
            filename_vis = f"{output_dir}/frame_regions_{timestamp}.jpg"
            cv2.imwrite(filename_vis, vis_frame)
            print(f"   ✅ 区域可视化: {filename_vis}")
            
            # 保存各个区域
            regions = client.processor.split_frame(frame)
            for i, region in enumerate(regions):
                filename_region = f"{output_dir}/frame_region{i}_{timestamp}.jpg"
                cv2.imwrite(filename_region, region)
                print(f"   ✅ 区域 {i}: {filename_region}")
    
    # 断开连接
    print("\n[清理] 断开连接...")
    client.disconnect()
    
    print("\n" + "=" * 70)
    print("✅ 超宽屏摄像头测试完成！")
    print("=" * 70)
    
    return True


if __name__ == "__main__":
    import sys
    
    print(f"OpenCV 版本: {cv2.__version__}")
    
    try:
        success = test_ultrawide_camera()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  测试中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
