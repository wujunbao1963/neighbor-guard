"""
Standard Test Configuration - 标准测试配置

提供默认的传感器、区域和入口点配置，简化测试设置。

标准配置（最小可测试链路）:
1. 门入口链路:
   - 户外摄像头 (EXTERIOR) → 检测接近
   - 门磁传感器 (ENTRY_EXIT) → 检测开门
   - 室内PIR (INTERIOR) → 检测进入

2. 窗户入口:
   - 玻璃破碎传感器 (PERIMETER) → 检测破窗

这个配置覆盖最常见的入侵路径和测试场景。
"""

from ng_edge.domain import (
    Zone,
    EntryPoint,
    Topology,
    ZoneType,
    LocationType,
    CapabilityTier,
    SignalType,
)


def create_standard_test_topology() -> Topology:
    """创建标准测试拓扑配置.
    
    配置说明:
    ┌─────────────────────────────────────────┐
    │  标准测试布局                            │
    ├─────────────────────────────────────────┤
    │  [后院] ─→ [后门] ─→ [客厅]              │
    │   摄像头     门磁     PIR                │
    │                                         │
    │  [窗户]                                  │
    │  玻璃破碎                                │
    └─────────────────────────────────────────┘
    
    Returns:
        完整的 Topology 对象
    """
    
    # =========================================================================
    # 区域定义
    # =========================================================================
    
    zones = {
        # 后院 - 户外摄像头监控区域
        "zone_backyard": Zone(
            zone_id="zone_backyard",
            name="后院",
            zone_type=ZoneType.EXTERIOR,
            location_type=LocationType.OUTDOOR,
            capability_tier=CapabilityTier.V,  # 视频监控
            description="户外摄像头监控区域，检测接近门口的人",
        ),
        
        # 后门 - 主要入口
        "zone_back_door": Zone(
            zone_id="zone_back_door",
            name="后门",
            zone_type=ZoneType.ENTRY_EXIT,
            location_type=LocationType.THRESHOLD,
            entry_point_ids=["ep_back_door"],
            description="主入口，配备门磁传感器",
        ),
        
        # 客厅 - 室内监控
        "zone_living_room": Zone(
            zone_id="zone_living_room",
            name="客厅",
            zone_type=ZoneType.INTERIOR,
            location_type=LocationType.INDOOR,
            adjacent_zone_ids=["zone_back_door"],
            description="紧邻后门的室内区域，配备PIR传感器",
        ),
        
        # 窗户 - 周界防护
        "zone_window": Zone(
            zone_id="zone_window",
            name="窗户",
            zone_type=ZoneType.PERIMETER,
            location_type=LocationType.INDOOR,
            entry_point_ids=["ep_window"],
            description="窗户位置，配备玻璃破碎传感器",
        ),
    }
    
    # =========================================================================
    # 入口点定义
    # =========================================================================
    
    entry_points = {
        # 后门入口点
        "ep_back_door": EntryPoint(
            entry_point_id="ep_back_door",
            name="后门入口",
            zone_id="zone_back_door",
            
            # Entry delay 配置（秒）
            entry_delay_away_sec=30,      # AWAY 模式: 30秒
            entry_delay_night_sec=15,     # NIGHT 模式: 15秒
            entry_delay_home_sec=30,      # HOME 模式: 30秒
            
            # 传感器绑定
            sensor_ids=[
                "sensor_camera_backyard",   # 户外摄像头
                "sensor_door_back",          # 门磁
            ],
            
            is_primary_entry=True,
            description="主入口，包含摄像头预警和门磁检测",
        ),
        
        # 窗户入口点
        "ep_window": EntryPoint(
            entry_point_id="ep_window",
            name="窗户入口",
            zone_id="zone_window",
            
            # 窗户无 entry delay（立即触发）
            entry_delay_away_sec=0,
            entry_delay_night_sec=0,
            entry_delay_home_sec=0,
            
            sensor_ids=["sensor_glass_window"],
            
            is_primary_entry=False,
            description="窗户入口，玻璃破碎立即触发报警",
        ),
    }
    
    return Topology(zones=zones, entry_points=entry_points)


def get_standard_sensor_bindings() -> dict:
    """获取标准传感器绑定配置.
    
    Returns:
        传感器ID -> 配置的映射
    """
    return {
        # 户外摄像头
        "sensor_camera_backyard": {
            "sensor_id": "sensor_camera_backyard",
            "sensor_type": "camera",
            "name": "后院摄像头",
            "zone_id": "zone_backyard",
            "zone_type": ZoneType.EXTERIOR,
            "location_type": "outdoor",
            "entry_point_id": "ep_back_door",
            "supported_signals": [
                SignalType.PERSON_DETECTED,
                SignalType.VEHICLE_DETECTED,
            ],
            "description": "Reolink 摄像头 + YOLO，检测后院活动",
        },
        
        # 门磁传感器
        "sensor_door_back": {
            "sensor_id": "sensor_door_back",
            "sensor_type": "door_contact",
            "name": "后门门磁",
            "zone_id": "zone_back_door",
            "zone_type": ZoneType.ENTRY_EXIT,
            "location_type": "indoor",
            "entry_point_id": "ep_back_door",
            "supported_signals": [
                SignalType.DOOR_OPEN,
                SignalType.DOOR_CLOSE,
            ],
            "description": "门磁传感器，检测门开关状态",
        },
        
        # 室内PIR
        "sensor_pir_living": {
            "sensor_id": "sensor_pir_living",
            "sensor_type": "motion_pir",
            "name": "客厅PIR",
            "zone_id": "zone_living_room",
            "zone_type": ZoneType.INTERIOR,
            "location_type": "indoor",
            "entry_point_id": "ep_back_door",
            "supported_signals": [
                SignalType.MOTION_ACTIVE,
                SignalType.MOTION_CLEAR,
            ],
            "description": "被动红外传感器，检测客厅内运动",
        },
        
        # 玻璃破碎传感器
        "sensor_glass_window": {
            "sensor_id": "sensor_glass_window",
            "sensor_type": "glass_break",
            "name": "窗户玻璃破碎",
            "zone_id": "zone_window",
            "zone_type": ZoneType.PERIMETER,
            "location_type": "indoor",
            "entry_point_id": "ep_window",
            "supported_signals": [
                SignalType.GLASS_BREAK,
            ],
            "description": "音频玻璃破碎检测器",
        },
    }


def get_standard_test_scenarios():
    """获取标准测试场景定义.
    
    Returns:
        测试场景列表，每个场景包含名称、步骤和预期结果
    """
    return [
        {
            "id": "scenario_normal_entry",
            "name": "正常进入（AWAY模式）",
            "mode": "AWAY",
            "steps": [
                {
                    "step": 1,
                    "action": "后院检测到人",
                    "sensor": "sensor_camera_backyard",
                    "signal": "PERSON_DETECTED",
                    "expected_state": "QUIET",
                    "description": "摄像头检测到接近",
                },
                {
                    "step": 2,
                    "action": "打开后门",
                    "sensor": "sensor_door_back",
                    "signal": "DOOR_OPEN",
                    "expected_state": "PRE",
                    "description": "门磁触发，有上下文证据",
                },
                {
                    "step": 3,
                    "action": "等待5秒",
                    "expected_state": "PENDING",
                    "description": "进入entry delay倒计时",
                },
                {
                    "step": 4,
                    "action": "客厅检测到运动",
                    "sensor": "sensor_pir_living",
                    "signal": "MOTION_ACTIVE",
                    "expected_state": "PENDING",
                    "description": "确认有人进入",
                },
                {
                    "step": 5,
                    "action": "用Keypad撤防",
                    "expected_state": "DISARMED",
                    "description": "用户及时撤防",
                },
            ],
        },
        
        {
            "id": "scenario_glass_break",
            "name": "窗户破碎（AWAY模式）",
            "mode": "AWAY",
            "steps": [
                {
                    "step": 1,
                    "action": "玻璃破碎",
                    "sensor": "sensor_glass_window",
                    "signal": "GLASS_BREAK",
                    "expected_state": "TRIGGERED",
                    "description": "立即触发报警，无entry delay",
                },
                {
                    "step": 2,
                    "action": "用Keypad取消报警",
                    "expected_state": "CANCELED",
                    "description": "用户取消误报",
                },
            ],
        },
        
        {
            "id": "scenario_home_mode",
            "name": "在家模式活动",
            "mode": "HOME",
            "steps": [
                {
                    "step": 1,
                    "action": "后院检测到人",
                    "sensor": "sensor_camera_backyard",
                    "signal": "PERSON_DETECTED",
                    "expected_state": "PRE",
                    "description": "外部活动引起注意",
                },
                {
                    "step": 2,
                    "action": "客厅检测到运动",
                    "sensor": "sensor_pir_living",
                    "signal": "MOTION_ACTIVE",
                    "expected_state": "QUIET",
                    "description": "家人活动，不报警",
                },
            ],
        },
    ]


# =============================================================================
# 快捷函数
# =============================================================================

def print_standard_config():
    """打印标准配置的可读摘要."""
    topology = create_standard_test_topology()
    sensors = get_standard_sensor_bindings()
    
    print("=" * 60)
    print("NeighborGuard Edge - 标准测试配置")
    print("=" * 60)
    print()
    
    print("区域 (Zones):")
    print("-" * 60)
    for zone_id, zone in topology.zones.items():
        print(f"  {zone.name} ({zone.zone_type.value})")
        print(f"    ID: {zone_id}")
        print(f"    位置: {zone.location_type.value}")
        if zone.description:
            print(f"    说明: {zone.description}")
        print()
    
    print("入口点 (Entry Points):")
    print("-" * 60)
    for ep_id, ep in topology.entry_points.items():
        print(f"  {ep.name}")
        print(f"    ID: {ep_id}")
        print(f"    Entry Delay: AWAY={ep.entry_delay_away_sec}s, "
              f"NIGHT={ep.entry_delay_night_sec}s, HOME={ep.entry_delay_home_sec}s")
        print(f"    传感器: {', '.join(ep.sensor_ids)}")
        print()
    
    print("传感器 (Sensors):")
    print("-" * 60)
    for sensor_id, config in sensors.items():
        print(f"  {config['name']} ({config['sensor_type']})")
        print(f"    ID: {sensor_id}")
        print(f"    区域: {config['zone_id']}")
        print(f"    信号: {', '.join(s.value for s in config['supported_signals'])}")
        print()


if __name__ == "__main__":
    # 打印配置摘要
    print_standard_config()
    
    # 也可以创建并验证拓扑
    topology = create_standard_test_topology()
    print(f"\n✓ 标准拓扑创建成功: {len(topology.zones)} 个区域, "
          f"{len(topology.entry_points)} 个入口点")
