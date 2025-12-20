"""
Camera API Endpoints for Edge Manager

Adds real camera input support to the Edge Manager API.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
import threading

# This will be imported in manager.py
camera_router = APIRouter(prefix="/api/camera", tags=["camera"])

# Global camera state
camera_active = False
camera_thread = None
camera_source = None
recent_signals = []  # Store recent signals for display


class CameraStartRequest(BaseModel):
    """Request to start camera"""
    zone_id: str  # Target zone for signals
    camera_ip: str
    detection_fps: float = 5.0
    confidence_threshold: float = 0.6
    camera_username: str = "admin"
    camera_password: str = "Zafac05@a"


class CameraStatusResponse(BaseModel):
    """Camera status"""
    active: bool
    camera_ip: Optional[str] = None
    detection_fps: Optional[float] = None
    stats: Optional[dict] = None


@camera_router.post("/start")
async def start_camera(request: CameraStartRequest):
    """Start real camera input"""
    global camera_active, camera_thread, camera_source
    
    if camera_active:
        raise HTTPException(status_code=400, detail="Camera already active")
    
    try:
        # Import here to avoid circular dependency
        import sys
        import os
        script_dir = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, os.path.join(script_dir, '../../..'))
        
        from camera_signal_source import CameraSignalSource, CameraSignalConfig
        from ng_edge.hardware.reolink_ultrawide import CameraConfig, StreamType
        
        # Create camera config
        camera_config = CameraConfig(
            name="Edge Manager Camera",
            ip=request.camera_ip,
            username=request.camera_username,
            password=request.camera_password,
            stream_type=StreamType.SUB,
            use_tcp=True,
        )
        
        signal_config = CameraSignalConfig(
            camera_name="Edge Manager Camera",
            sensor_id="cam_edge_manager_001",
            zone_id=request.zone_id,  # Use user-selected zone
            detection_fps=request.detection_fps,
            confidence_threshold=request.confidence_threshold,
            target_classes=["person", "car"],
            min_signal_confidence=request.confidence_threshold,
        )
        
        # Create camera source
        camera_source = CameraSignalSource(camera_config, signal_config)
        
        # Connect
        if not camera_source.connect():
            raise HTTPException(status_code=500, detail="Failed to connect to camera")
        
        # Start processing thread
        camera_active = True
        camera_thread = threading.Thread(target=camera_processing_loop, daemon=True)
        camera_thread.start()
        
        return {
            "status": "started",
            "camera_ip": request.camera_ip,
            "detection_fps": request.detection_fps
        }
        
    except Exception as e:
        camera_active = False
        raise HTTPException(status_code=500, detail=str(e))


@camera_router.post("/stop")
async def stop_camera():
    """Stop camera input"""
    global camera_active, camera_source
    
    if not camera_active:
        raise HTTPException(status_code=400, detail="Camera not active")
    
    camera_active = False
    
    if camera_source:
        camera_source.disconnect()
        camera_source = None
    
    return {"status": "stopped"}


@camera_router.get("/status")
async def get_camera_status():
    """Get camera status"""
    global recent_signals
    
    if not camera_active or not camera_source:
        return CameraStatusResponse(active=False)
    
    stats = camera_source.get_stats()
    
    # Add recent signals to stats
    if stats is None:
        stats = {}
    stats['recent_signals'] = recent_signals[:10]  # Return last 10 signals
    
    return CameraStatusResponse(
        active=True,
        camera_ip=camera_source.camera_config.ip,
        detection_fps=camera_source.signal_config.detection_fps,
        stats=stats
    )


def camera_processing_loop():
    """Background thread to process camera frames - DISPLAY ONLY MODE"""
    global camera_active, camera_source, recent_signals
    
    print("[Camera] Running in DISPLAY-ONLY mode - signals will NOT be sent to Pipeline")
    
    while camera_active:
        try:
            if camera_source:
                # Process frame
                signal = camera_source.process_frame()
                
                if signal:
                    # Store signal for display (do NOT send to pipeline)
                    signal_data = {
                        'signal_type': signal.signal_type.value,
                        'zone_id': signal.zone_id,
                        'confidence': signal.confidence,
                        'timestamp': signal.timestamp.isoformat()
                    }
                    
                    recent_signals.insert(0, signal_data)
                    
                    # Keep only last 100 signals
                    if len(recent_signals) > 100:
                        recent_signals = recent_signals[:100]
                    
                    # Log to console
                    print(f"[Camera] Detected: {signal.signal_type.value}, "
                          f"Confidence: {signal.confidence:.3f} "
                          f"(DISPLAY ONLY - not sent to Pipeline)")
            
            # Small delay
            import time
            time.sleep(0.01)
            
        except Exception as e:
            print(f"[Camera] Error: {e}")
            import traceback
            traceback.print_exc()
            camera_active = False
            break
