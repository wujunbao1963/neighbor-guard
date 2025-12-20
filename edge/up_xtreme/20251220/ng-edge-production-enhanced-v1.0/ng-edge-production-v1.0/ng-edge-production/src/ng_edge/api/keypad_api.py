"""
Keypad API - 键盘控制接口

提供 REST API 用于模拟物理 Keypad 操作:
- 模式切换 (DISARM, AWAY, HOME, NIGHT)
- PIN 验证
- 报警取消
- 状态查询
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from ..domain.enums import HouseMode, NightSubMode, AlarmState
from ..services.signal_pipeline import SignalPipeline


# Create router
keypad_router = APIRouter(prefix="/keypad", tags=["keypad"])


# =============================================================================
# Request/Response Models
# =============================================================================

class PinRequest(BaseModel):
    """PIN 码输入请求"""
    pin: str = Field(..., min_length=4, max_length=6, description="用户PIN码")


class ModeChangeRequest(BaseModel):
    """模式切换请求"""
    pin: str = Field(..., description="用户PIN码")
    target_mode: HouseMode = Field(..., description="目标模式")
    night_sub_mode: Optional[NightSubMode] = Field(None, description="NIGHT子模式")


class CancelAlarmRequest(BaseModel):
    """取消报警请求"""
    pin: str = Field(..., description="用户PIN码")
    reason: Optional[str] = Field(None, description="取消原因")


class KeypadStatusResponse(BaseModel):
    """Keypad 状态响应"""
    current_mode: HouseMode
    alarm_state: AlarmState
    is_armed: bool
    entry_delay_active: bool
    entry_delay_remaining_sec: Optional[float]
    zones_total: int
    zones_active: int
    last_event_time: Optional[datetime]
    last_event_type: Optional[str]


# =============================================================================
# Global State (在生产环境中应该用依赖注入)
# =============================================================================

_global_pipeline: Optional[SignalPipeline] = None
_user_pin: str = "1234"  # 默认测试PIN


def set_pipeline(pipeline: SignalPipeline):
    """设置全局 pipeline 实例"""
    global _global_pipeline
    _global_pipeline = pipeline


def get_pipeline() -> SignalPipeline:
    """获取 pipeline 实例"""
    if _global_pipeline is None:
        raise HTTPException(status_code=500, detail="Pipeline not initialized")
    return _global_pipeline


def set_user_pin(pin: str):
    """设置用户PIN码（测试用）"""
    global _user_pin
    _user_pin = pin


def verify_pin(pin: str) -> bool:
    """验证PIN码"""
    return pin == _user_pin


# =============================================================================
# API Endpoints
# =============================================================================

@keypad_router.get("/status", response_model=KeypadStatusResponse)
async def get_keypad_status():
    """获取 Keypad 当前状态
    
    返回系统当前模式、报警状态、区域信息等
    """
    pipeline = get_pipeline()
    
    # 获取 entry delay 剩余时间
    entry_delay_remaining = None
    entry_delay_active = False
    if hasattr(pipeline, 'entry_delay_timer') and pipeline.entry_delay_timer:
        entry_delay_remaining = pipeline.entry_delay_timer.get_remaining()
        entry_delay_active = entry_delay_remaining > 0
    
    # 统计活动区域
    zones_total = len(pipeline.topology.zones) if pipeline.topology else 0
    zones_active = zones_total  # 简化：假设所有区域都活动
    
    # 获取最后事件
    last_event = pipeline.last_event if hasattr(pipeline, 'last_event') else None
    last_event_time = last_event.timestamp if last_event else None
    last_event_type = last_event.event_type.value if last_event else None
    
    return KeypadStatusResponse(
        current_mode=pipeline.mode_config.house_mode,
        alarm_state=pipeline.alarm_state,
        is_armed=pipeline.mode_config.house_mode != HouseMode.DISARMED,
        entry_delay_active=entry_delay_active,
        entry_delay_remaining_sec=entry_delay_remaining,
        zones_total=zones_total,
        zones_active=zones_active,
        last_event_time=last_event_time,
        last_event_type=last_event_type,
    )


@keypad_router.post("/verify-pin")
async def verify_pin_endpoint(request: PinRequest):
    """验证PIN码
    
    用于测试PIN码是否正确，不执行任何操作
    """
    is_valid = verify_pin(request.pin)
    
    return {
        "valid": is_valid,
        "message": "PIN正确" if is_valid else "PIN错误"
    }


@keypad_router.post("/change-mode")
async def change_mode(request: ModeChangeRequest):
    """切换系统模式
    
    支持的模式切换:
    - DISARMED (撤防)
    - AWAY (离家)
    - HOME (在家)
    - NIGHT (夜间)
    """
    # 验证PIN
    if not verify_pin(request.pin):
        raise HTTPException(status_code=401, detail="PIN码错误")
    
    pipeline = get_pipeline()
    old_mode = pipeline.mode_config.house_mode
    
    # 检查是否可以切换模式
    # 例如：TRIGGERED 状态下可能需要先取消报警
    if pipeline.alarm_state == AlarmState.TRIGGERED:
        raise HTTPException(
            status_code=400,
            detail="系统正在报警，请先取消报警再切换模式"
        )
    
    # 更新模式
    pipeline.mode_config.house_mode = request.target_mode
    if request.target_mode == HouseMode.NIGHT and request.night_sub_mode:
        pipeline.mode_config.night_sub_mode = request.night_sub_mode
    
    # 如果切换到 DISARMED，重置报警状态
    if request.target_mode == HouseMode.DISARMED:
        if pipeline.alarm_state != AlarmState.QUIET:
            # 调用 StateMachine 的 disarm 方法
            if hasattr(pipeline, 'alarm_sm') and pipeline.alarm_sm:
                # 简化：直接设置状态（实际应该调用 SM 方法）
                pipeline.alarm_state = AlarmState.QUIET
    
    return {
        "success": True,
        "old_mode": old_mode.value,
        "new_mode": request.target_mode.value,
        "message": f"模式已切换: {old_mode.value} → {request.target_mode.value}",
        "is_armed": request.target_mode != HouseMode.DISARMED,
    }


@keypad_router.post("/cancel-alarm")
async def cancel_alarm(request: CancelAlarmRequest):
    """取消报警
    
    用户通过PIN验证后可以取消当前报警
    """
    # 验证PIN
    if not verify_pin(request.pin):
        raise HTTPException(status_code=401, detail="PIN码错误")
    
    pipeline = get_pipeline()
    old_state = pipeline.alarm_state
    
    # 检查是否有报警需要取消
    if old_state not in [AlarmState.PENDING, AlarmState.TRIGGERED]:
        return {
            "success": False,
            "message": "当前没有需要取消的报警",
            "current_state": old_state.value,
        }
    
    # 取消报警
    # 实际应该调用 SignalPipeline 的 cancel 方法
    # 这里简化为直接修改状态
    new_state = AlarmState.CANCELED
    pipeline.alarm_state = new_state
    
    # 停止 entry delay timer
    if hasattr(pipeline, 'entry_delay_timer') and pipeline.entry_delay_timer:
        pipeline.entry_delay_timer.cancel()
    
    return {
        "success": True,
        "old_state": old_state.value,
        "new_state": new_state.value,
        "message": f"报警已取消: {old_state.value} → {new_state.value}",
        "reason": request.reason or "用户手动取消",
    }


@keypad_router.post("/disarm")
async def disarm(request: PinRequest):
    """快速撤防
    
    直接撤防系统（等同于切换到DISARMED模式）
    """
    mode_request = ModeChangeRequest(
        pin=request.pin,
        target_mode=HouseMode.DISARMED
    )
    return await change_mode(mode_request)


@keypad_router.post("/arm-away")
async def arm_away(request: PinRequest):
    """快速布防（AWAY模式）"""
    mode_request = ModeChangeRequest(
        pin=request.pin,
        target_mode=HouseMode.AWAY
    )
    return await change_mode(mode_request)


@keypad_router.post("/arm-home")
async def arm_home(request: PinRequest):
    """快速布防（HOME模式）"""
    mode_request = ModeChangeRequest(
        pin=request.pin,
        target_mode=HouseMode.HOME
    )
    return await change_mode(mode_request)


@keypad_router.post("/arm-night")
async def arm_night(request: PinRequest):
    """快速布防（NIGHT模式）
    
    默认使用 NIGHT_OCCUPIED 子模式
    """
    mode_request = ModeChangeRequest(
        pin=request.pin,
        target_mode=HouseMode.NIGHT,
        night_sub_mode=NightSubMode.NIGHT_OCCUPIED
    )
    return await change_mode(mode_request)


@keypad_router.get("/entry-delay")
async def get_entry_delay():
    """获取当前 entry delay 状态
    
    用于实时显示倒计时
    """
    pipeline = get_pipeline()
    
    entry_delay_active = False
    remaining_sec = 0
    
    if hasattr(pipeline, 'entry_delay_timer') and pipeline.entry_delay_timer:
        remaining_sec = pipeline.entry_delay_timer.get_remaining()
        entry_delay_active = remaining_sec > 0
    
    return {
        "active": entry_delay_active,
        "remaining_sec": remaining_sec,
        "alarm_state": pipeline.alarm_state.value,
    }
