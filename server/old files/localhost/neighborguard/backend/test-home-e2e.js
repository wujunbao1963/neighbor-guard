// ============================================================================
// NeighborGuard Phase 2 - 完整端到端测试
// 基于您的家庭传感器布局设计
// Run with: node test-home-e2e.js
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');
const { fusionEngine, FUSION_RULES } = require('./src/services/fusionEngine');
const { notificationScorer } = require('./src/services/notificationScorer');
const { notificationPolicy } = require('./src/services/notificationPolicy');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// 测试配置 - 您的家庭传感器布局
// ============================================================================

const HOME_CONFIG = {
  // Zones 配置 - zoneType must be unique per circle
  zones: [
    { id: 'zone_front_door', zoneType: 'FRONT_DOOR', displayName: '前门', privacyLevel: 'RESTRICTED', isEntryPoint: true, zoneGroup: 'front' },
    { id: 'zone_porch', zoneType: 'PORCH', displayName: '门廊', privacyLevel: 'SEMI_PRIVATE', isEntryPoint: false, zoneGroup: 'front' },
    { id: 'zone_hallway_front', zoneType: 'HALLWAY_FRONT', displayName: '前门走廊', privacyLevel: 'RESTRICTED', isEntryPoint: false, zoneGroup: 'interior' },
    { id: 'zone_front_yard', zoneType: 'FRONT_YARD', displayName: '前院', privacyLevel: 'SEMI_PRIVATE', isEntryPoint: false, zoneGroup: 'front' },
    { id: 'zone_back_door', zoneType: 'BACK_DOOR', displayName: '后门', privacyLevel: 'RESTRICTED', isEntryPoint: true, zoneGroup: 'back' },
    { id: 'zone_back_yard', zoneType: 'BACK_YARD', displayName: '后院', privacyLevel: 'PRIVATE', isEntryPoint: false, zoneGroup: 'back' },
    { id: 'zone_hallway_back', zoneType: 'HALLWAY_BACK', displayName: '后门走廊', privacyLevel: 'RESTRICTED', isEntryPoint: false, zoneGroup: 'interior' },
    { id: 'zone_driveway', zoneType: 'DRIVEWAY', displayName: '车道', privacyLevel: 'SEMI_PRIVATE', isEntryPoint: false, zoneGroup: 'front' }
  ],
  
  // Sensors 配置
  sensors: [
    // 前门区域
    { id: 'sensor_doorbell_cam', name: '门铃摄像头', sensorType: 'CAMERA_PERSON', zoneId: 'zone_front_door' },
    { id: 'sensor_front_cam', name: '前门摄像头', sensorType: 'CAMERA_PERSON', zoneId: 'zone_porch' },
    { id: 'sensor_front_cam_pkg', name: '前门摄像头-包裹', sensorType: 'CAMERA_PACKAGE', zoneId: 'zone_porch' },
    { id: 'sensor_front_pir', name: '前门PIR', sensorType: 'PIR', zoneId: 'zone_hallway_front' },
    { id: 'sensor_front_door', name: '前门门磁', sensorType: 'DOOR_CONTACT', zoneId: 'zone_front_door' },
    { id: 'sensor_front_glass', name: '前窗玻璃', sensorType: 'GLASS_BREAK', zoneId: 'zone_front_yard' },
    
    // 后院区域
    { id: 'sensor_back_cam_top', name: '后院上方摄像头', sensorType: 'CAMERA_PERSON', zoneId: 'zone_back_yard' },
    { id: 'sensor_back_cam_mid', name: '后院中间摄像头', sensorType: 'CAMERA_PERSON', zoneId: 'zone_back_yard' },
    { id: 'sensor_back_pir', name: '后门PIR', sensorType: 'PIR', zoneId: 'zone_hallway_back' },
    { id: 'sensor_back_door', name: '后门门磁', sensorType: 'DOOR_CONTACT', zoneId: 'zone_back_door' },
    { id: 'sensor_back_glass', name: '后窗玻璃', sensorType: 'GLASS_BREAK', zoneId: 'zone_back_yard' },
    
    // 车道区域
    { id: 'sensor_driveway_cam', name: '车道摄像头', sensorType: 'CAMERA_PERSON', zoneId: 'zone_driveway' },
    { id: 'sensor_driveway_cam_v', name: '车道摄像头-车辆', sensorType: 'CAMERA_VEHICLE', zoneId: 'zone_driveway' }
  ]
};

// ============================================================================
// 测试场景定义
// ============================================================================

const TEST_SCENARIOS = {
  // =========================================================================
  // Break-in Attempt Tests
  // =========================================================================
  B1: {
    name: '前门夜间入侵',
    category: 'break-in',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_front_door', newState: 'open', delay: 5000 },
      { sensorId: 'sensor_front_pir', newState: 'on', delay: 8000 }
    ],
    expected: {
      eventType: 'break_in_attempt',
      severity: 'HIGH',
      notificationLevel: 'HIGH',
      trackCount: 1,
      pathContains: ['FRONT_DOOR', 'HALLWAY']
    }
  },
  
  B2: {
    name: '后门离家入侵',
    category: 'break-in',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_back_door', newState: 'open', delay: 10000 },
      { sensorId: 'sensor_back_pir', newState: 'on', delay: 15000 }
    ],
    expected: {
      eventType: 'break_in_attempt',
      severity: 'HIGH',
      notificationLevel: 'HIGH',
      trackCount: 1
    }
  },
  
  B3: {
    name: '前窗玻璃破碎+人员',
    category: 'break-in',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_front_glass', newState: 'on', delay: 0 },
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 3000, flags: ['person_detected'] }
    ],
    expected: {
      eventType: 'break_in_attempt',
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  },
  
  B4: {
    name: '后窗玻璃破碎+人员',
    category: 'break-in',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_back_glass', newState: 'on', delay: 0 },
      { sensorId: 'sensor_back_cam_mid', newState: 'on', delay: 5000, flags: ['person_detected'] }
    ],
    expected: {
      eventType: 'break_in_attempt',
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  },
  
  B5: {
    name: '玻璃破碎+室内PIR（无摄像头）',
    category: 'break-in',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_front_glass', newState: 'on', delay: 0 },
      { sensorId: 'sensor_front_pir', newState: 'on', delay: 20000 }
    ],
    expected: {
      eventType: 'break_in_attempt',
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  },
  
  B6: {
    name: '在家模式门磁+PIR（正常）',
    category: 'break-in',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_back_door', newState: 'open', delay: 0 },
      { sensorId: 'sensor_back_pir', newState: 'on', delay: 3000 }
    ],
    expected: {
      // HOME mode + door + PIR without suspicious flags = normal family activity
      // R1 requires NIGHT/AWAY mode, so this should be suppressed
      shouldSuppress: true,
      notificationLevel: 'NONE'
    }
  },
  
  // =========================================================================
  // Perimeter Damage Tests
  // =========================================================================
  P1: {
    name: '前窗玻璃破碎（无人）',
    category: 'perimeter',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_front_glass', newState: 'on', delay: 0 }
      // 注意：没有 CAMERA_PERSON
    ],
    expected: {
      eventType: 'perimeter_damage',
      severity: 'HIGH',
      notificationLevel: 'HIGH'  // Glass break always HIGH - safety concern
    }
  },
  
  P2: {
    name: '后窗玻璃破碎（无人）',
    category: 'perimeter',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_back_glass', newState: 'on', delay: 0 }
    ],
    expected: {
      eventType: 'perimeter_damage',
      severity: 'HIGH',
      notificationLevel: 'HIGH'  // Glass break always HIGH - safety concern
    }
  },
  
  P3: {
    name: '在家玻璃破碎',
    category: 'perimeter',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_front_glass', newState: 'on', delay: 0 }
    ],
    expected: {
      eventType: 'perimeter_damage',
      severity: 'MEDIUM',  // HOME mode = lower severity
      notificationLevel: 'HIGH'  // Glass break always HIGH notification - safety concern
    }
  },
  
  // =========================================================================
  // Suspicious Person Tests
  // =========================================================================
  S1: {
    name: '后院徘徊（loitering flag）',
    category: 'suspicious-person',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'], dwellSec: 30 }
    ],
    expected: {
      eventType: 'suspicious_person',
      severity: 'HIGH',
      notificationLevel: 'HIGH',
      minDwell: 20
    }
  },
  
  S2: {
    name: '后院夜间徘徊（多摄像头）',
    category: 'suspicious-person',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_mid', newState: 'on', delay: 20000, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 45000, flags: ['person_detected'] }
    ],
    expected: {
      eventType: 'suspicious_person',
      severity: 'HIGH',
      notificationLevel: 'HIGH',
      trackCount: 1
    }
  },
  
  S3: {
    name: '前门窥探',
    category: 'suspicious-person',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_doorbell_cam', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'] },
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 10000, flags: ['person_detected'] }
      // 注意：没有开门
    ],
    expected: {
      eventType: 'suspicious_person',
      // R7 severity upgrade: AWAY mode + RESTRICTED zone = HIGH
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  },
  
  S4: {
    name: '车道到后院移动',
    category: 'suspicious-person',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_driveway_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 30000, flags: ['person_detected'] }
    ],
    expected: {
      eventType: 'suspicious_person',
      // R8 base severity is MEDIUM, but it doesn't have severityUpgrade
      // However ML scorer should boost it due to NIGHT + PRIVATE zone
      severity: 'MEDIUM',
      notificationLevel: 'HIGH',
      pathContains: ['DRIVEWAY', 'BACK_YARD']
    }
  },
  
  S5: {
    name: '前院短暂经过',
    category: 'suspicious-person',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'], dwellSec: 5 }
    ],
    expected: {
      // No event should be created - just a brief pass in HOME mode, no flags
      shouldSuppress: true,
      notificationLevel: 'NONE'
    }
  },
  
  // =========================================================================
  // Suspicious Vehicle Tests
  // =========================================================================
  V1: {
    name: '车道长时间停留',
    category: 'suspicious-vehicle',
    houseMode: 'NIGHT',
    events: [
      // Use loitering flag to simulate long stay detection by camera AI
      { sensorId: 'sensor_driveway_cam_v', newState: 'on', delay: 0, flags: ['vehicle_detected', 'loitering_candidate'], dwellSec: 180 }
    ],
    expected: {
      eventType: 'suspicious_vehicle',
      severity: 'HIGH',  // R10B upgrades to HIGH in NIGHT mode
      notificationLevel: 'HIGH',
      minDwell: 120
    }
  },
  
  V2: {
    name: '车道短暂停留',
    category: 'suspicious-vehicle',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_driveway_cam_v', newState: 'on', delay: 0, flags: ['vehicle_detected'], dwellSec: 30 }
    ],
    expected: {
      // Short stay in HOME mode, no loitering flag = normal activity
      shouldSuppress: true,
      notificationLevel: 'NONE'
    }
  },
  
  V3: {
    name: '车辆多次经过',
    category: 'suspicious-vehicle',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_driveway_cam_v', newState: 'on', delay: 0, flags: ['vehicle_detected', 'repeated', 'seen_before'] }
    ],
    expected: {
      eventType: 'suspicious_vehicle',
      severity: 'MEDIUM',
      notificationLevel: 'NORMAL'
    }
  },
  
  // =========================================================================
  // Package Event Tests
  // =========================================================================
  K1: {
    name: '包裹投递',
    category: 'package',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_front_cam_pkg', newState: 'present', delay: 5000, flags: ['item_forgotten', 'package_detected'] }
    ],
    expected: {
      eventType: 'package_delivered',
      severity: 'LOW',
      notificationLevel: 'NORMAL'
    }
  },
  
  K2: {
    name: '正常取件',
    category: 'package',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_front_cam_pkg', newState: 'not_present', delay: 3000, flags: ['item_taken'] }
    ],
    expected: {
      eventType: 'package_taken',
      severity: 'LOW',
      notificationLevel: 'NORMAL'
    }
  },
  
  K3: {
    name: '可疑取件（离家夜间）',
    category: 'package',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_front_cam_pkg', newState: 'not_present', delay: 3000, flags: ['item_taken'] }
    ],
    expected: {
      eventType: 'package_taken',
      severity: 'MEDIUM',
      // AWAY mode + package taken = HIGH (potential theft)
      notificationLevel: 'HIGH'
    }
  },
  
  // =========================================================================
  // Track Merge Tests
  // =========================================================================
  T1: {
    name: '单人多摄像头追踪（合并）',
    category: 'track',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_driveway_cam', newState: 'on', delay: 0, flags: ['person_detected'], externalTrackId: 'track-001' },
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 20000, flags: ['person_detected'], externalTrackId: 'track-001' },
      { sensorId: 'sensor_doorbell_cam', newState: 'on', delay: 40000, flags: ['person_detected'], externalTrackId: 'track-001' }
    ],
    expected: {
      trackCount: 1,
      pathContains: ['DRIVEWAY', 'PORCH', 'FRONT_DOOR']
    }
  },
  
  T2: {
    name: '同一人绕房（合并）',
    category: 'track',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 30000, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_mid', newState: 'on', delay: 60000, flags: ['person_detected'] }
    ],
    expected: {
      trackCount: 1,
      eventType: 'suspicious_person',
      severity: 'HIGH'
    }
  },
  
  T4: {
    name: '间隔过长（分离）',
    category: 'track',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_front_cam', newState: 'on', delay: 0, flags: ['person_detected'] },
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 150000, flags: ['person_detected'] } // 2.5分钟后
    ],
    expected: {
      trackCount: 2  // 应该是两个独立Track
    }
  },
  
  // =========================================================================
  // House Mode Tests
  // =========================================================================
  M1: {
    name: 'DISARMED模式-后院徘徊',
    category: 'mode',
    houseMode: 'DISARMED',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'], dwellSec: 30 }
    ],
    expected: {
      shouldSuppress: true,
      notificationLevel: 'NONE'
    }
  },
  
  M2: {
    name: 'HOME模式-后院徘徊',
    category: 'mode',
    houseMode: 'HOME',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'], dwellSec: 30 }
    ],
    expected: {
      eventType: 'suspicious_person',
      severity: 'MEDIUM'
    }
  },
  
  M3: {
    name: 'AWAY模式-后院徘徊',
    category: 'mode',
    houseMode: 'AWAY',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'], dwellSec: 30 }
    ],
    expected: {
      eventType: 'suspicious_person',
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  },
  
  M4: {
    name: 'NIGHT模式-后院徘徊',
    category: 'mode',
    houseMode: 'NIGHT',
    events: [
      { sensorId: 'sensor_back_cam_top', newState: 'on', delay: 0, flags: ['person_detected', 'loitering_candidate'], dwellSec: 30 }
    ],
    expected: {
      eventType: 'suspicious_person',
      severity: 'HIGH',
      notificationLevel: 'HIGH'
    }
  }
};

// ============================================================================
// 测试执行器
// ============================================================================

class E2ETestRunner {
  constructor() {
    this.testData = null;
    this.results = [];
  }

  async setup() {
    console.log('\n🔧 Setting up test environment...');
    
    // 创建测试用户和Circle
    const user = await prisma.user.upsert({
      where: { email: 'e2e-test@neighborguard.com' },
      update: {},
      create: {
        id: uuidv4(),
        email: 'e2e-test@neighborguard.com',
        displayName: 'E2E Test User'
      }
    });

    const circle = await prisma.circle.upsert({
      where: { id: 'e2e-test-circle' },
      update: { ownerId: user.id },
      create: {
        id: 'e2e-test-circle',
        ownerId: user.id,
        displayName: 'E2E Test Circle'
      }
    });

    // 创建 Home
    const home = await prisma.home.upsert({
      where: { circleId: circle.id },
      update: { houseMode: 'HOME' },
      create: {
        id: uuidv4(),
        circleId: circle.id,
        displayName: 'E2E Test Home',
        houseMode: 'HOME'
      }
    });

    // 创建 Member
    let member = await prisma.circleMember.findFirst({
      where: { circleId: circle.id, userId: user.id }
    });
    if (!member) {
      member = await prisma.circleMember.create({
        data: {
          id: uuidv4(),
          circleId: circle.id,
          userId: user.id,
          role: 'OWNER',
          displayName: 'Test Owner'
        }
      });
    }

    // 创建 Integration (required for sensors)
    let integration = await prisma.integration.findFirst({
      where: { circleId: circle.id, type: 'HOME_ASSISTANT' }
    });
    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          id: uuidv4(),
          circleId: circle.id,
          type: 'HOME_ASSISTANT',
          name: 'E2E Test HA',
          isActive: true,
          webhookToken: uuidv4() // Must be unique
        }
      });
    }

    // 创建 Zones - use zoneType as the unique identifier within circle
    const zoneIdMap = {}; // Map config zoneId to actual DB zoneId
    
    for (const zoneConfig of HOME_CONFIG.zones) {
      // First try to find existing zone by circleId + zoneType
      let zone = await prisma.zone.findFirst({
        where: {
          circleId: circle.id,
          zoneType: zoneConfig.zoneType
        }
      });

      if (zone) {
        // Update existing zone
        zone = await prisma.zone.update({
          where: { id: zone.id },
          data: {
            displayName: zoneConfig.displayName,
            privacyLevel: zoneConfig.privacyLevel,
            isEntryPoint: zoneConfig.isEntryPoint,
            zoneGroup: zoneConfig.zoneGroup
          }
        });
      } else {
        // Create new zone with generated UUID
        zone = await prisma.zone.create({
          data: {
            id: uuidv4(),
            circleId: circle.id,
            zoneType: zoneConfig.zoneType,
            displayName: zoneConfig.displayName,
            zoneGroup: zoneConfig.zoneGroup,
            privacyLevel: zoneConfig.privacyLevel,
            isEntryPoint: zoneConfig.isEntryPoint
          }
        });
      }
      
      // Store mapping from config ID to actual DB ID
      zoneIdMap[zoneConfig.id] = zone.id;
    }

    // 创建 Sensors - use the zoneIdMap to get correct zone IDs
    for (const sensorConfig of HOME_CONFIG.sensors) {
      const actualZoneId = zoneIdMap[sensorConfig.zoneId];
      
      // Try to find by externalId within circle (unique identifier from HA)
      const externalId = `ha.${sensorConfig.id}`; // Simulated HA entity_id
      
      let sensor = await prisma.sensor.findFirst({
        where: { 
          circleId: circle.id,
          externalId: externalId
        }
      });

      if (sensor) {
        await prisma.sensor.update({
          where: { id: sensor.id },
          data: {
            sensorType: sensorConfig.sensorType,
            zoneId: actualZoneId,
            name: sensorConfig.name
          }
        });
      } else {
        await prisma.sensor.create({
          data: {
            id: uuidv4(),
            circleId: circle.id,
            integrationId: integration.id,
            externalId: externalId,
            zoneId: actualZoneId,
            name: sensorConfig.name,
            sensorType: sensorConfig.sensorType,
            isEnabled: true
          }
        });
      }
    }
    
    // Store sensor config ID to actual DB ID mapping for test scenarios
    const sensorMap = {};
    const sensors = await prisma.sensor.findMany({
      where: { circleId: circle.id }
    });
    for (const s of sensors) {
      // Find config by matching externalId pattern
      const configId = s.externalId.replace('ha.', '');
      const config = HOME_CONFIG.sensors.find(c => c.id === configId);
      if (config) {
        sensorMap[config.id] = s.id;
      }
    }

    this.testData = { user, circle, home, member, integration, zoneIdMap, sensorMap };
    console.log('   ✅ Test environment ready');
    console.log(`   Circle: ${circle.id}`);
    console.log(`   Home: ${home.id}`);
    console.log(`   Integration: ${integration.id}`);
    console.log(`   Zones: ${Object.keys(zoneIdMap).length}`);
    console.log(`   Sensors: ${Object.keys(sensorMap).length}`);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    // 删除测试数据（按顺序）
    await prisma.eventFeedback.deleteMany({ where: { circleId: 'e2e-test-circle' } });
    await prisma.eventMLFeature.deleteMany({ where: { circleId: 'e2e-test-circle' } });
    await prisma.event.deleteMany({ where: { circleId: 'e2e-test-circle' } });
    await prisma.sensorEvent.deleteMany({ where: { circleId: 'e2e-test-circle' } });
    await prisma.track.deleteMany({ where: { circleId: 'e2e-test-circle' } });
    
    console.log('   ✅ Cleaned up events, tracks, sensor events');
  }

  async runScenario(scenarioId, scenario) {
    console.log(`\n📋 ${scenarioId}: ${scenario.name}`);
    console.log(`   Mode: ${scenario.houseMode}, Category: ${scenario.category}`);

    const result = {
      id: scenarioId,
      name: scenario.name,
      category: scenario.category,
      passed: false,
      checks: [],
      error: null
    };

    try {
      // 清理之前的测试数据
      await this.cleanup();

      // 设置 House Mode
      await prisma.home.update({
        where: { circleId: 'e2e-test-circle' },
        data: { houseMode: scenario.houseMode }
      });

      // 模拟传感器事件序列
      const fusionResults = [];
      let baseTime = new Date();

      for (const event of scenario.events) {
        const sensorConfig = HOME_CONFIG.sensors.find(s => s.id === event.sensorId);
        if (!sensorConfig) {
          throw new Error(`Sensor config not found: ${event.sensorId}`);
        }

        // Get actual sensor ID from database
        const actualSensorId = this.testData.sensorMap[event.sensorId];
        if (!actualSensorId) {
          throw new Error(`Sensor not found in DB: ${event.sensorId}`);
        }

        const occurredAt = new Date(baseTime.getTime() + (event.delay || 0));

        // 构建 rawPayload
        const rawPayload = {
          flags: event.flags || [],
          classificationHints: [],
          externalTrackId: event.externalTrackId || null
        };

        // 添加 classification hints based on sensor type
        if (sensorConfig.sensorType === 'CAMERA_PERSON') rawPayload.classificationHints.push('person');
        if (sensorConfig.sensorType === 'CAMERA_VEHICLE') rawPayload.classificationHints.push('vehicle');
        if (sensorConfig.sensorType === 'CAMERA_PACKAGE') rawPayload.classificationHints.push('package');

        // 调用 FusionEngine with actual sensor ID from database
        const fusionResult = await fusionEngine.ingestSensorEvent({
          circleId: 'e2e-test-circle',
          sensorId: actualSensorId,
          newState: event.newState,
          oldState: event.oldState || 'off',
          occurredAt,
          rawPayload
        });

        fusionResults.push(fusionResult);

        // 模拟 dwell time (如果指定)
        if (event.dwellSec) {
          // 更新 Track 的 dwell time
          if (fusionResult.trackId) {
            await prisma.track.update({
              where: { id: fusionResult.trackId },
              data: { 
                dwellSecondsPrivate: event.dwellSec,
                endTime: new Date(occurredAt.getTime() + event.dwellSec * 1000)
              }
            });
          }
        }
      }

      // 获取生成的 Events 和 Tracks
      const events = await prisma.event.findMany({
        where: { circleId: 'e2e-test-circle' },
        orderBy: { createdAt: 'desc' }
      });

      const tracks = await prisma.track.findMany({
        where: { circleId: 'e2e-test-circle' }
      });

      // 验证结果
      const expected = scenario.expected;
      
      // Check: Event Type
      if (expected.eventType) {
        const lastEvent = events[0];
        const typeMatch = lastEvent?.eventType === expected.eventType;
        result.checks.push({
          name: 'Event Type',
          expected: expected.eventType,
          actual: lastEvent?.eventType || 'NO_EVENT',
          passed: typeMatch
        });
      }

      // Check: Severity
      if (expected.severity) {
        const lastEvent = events[0];
        const severityMatch = lastEvent?.severity === expected.severity;
        result.checks.push({
          name: 'Severity',
          expected: expected.severity,
          actual: lastEvent?.severity || 'N/A',
          passed: severityMatch
        });
      }

      // Check: Notification Level
      if (expected.notificationLevel) {
        const lastFusion = fusionResults[fusionResults.length - 1];
        const levelMatch = lastFusion?.notificationLevel === expected.notificationLevel;
        result.checks.push({
          name: 'Notification Level',
          expected: expected.notificationLevel,
          actual: lastFusion?.notificationLevel || 'N/A',
          passed: levelMatch
        });
      }

      // Check: Track Count
      if (expected.trackCount !== undefined) {
        const trackMatch = tracks.length === expected.trackCount;
        result.checks.push({
          name: 'Track Count',
          expected: expected.trackCount,
          actual: tracks.length,
          passed: trackMatch
        });
      }

      // Check: Should Suppress
      if (expected.shouldSuppress) {
        const lastEvent = events[0];
        const suppressed = !lastEvent || lastEvent.mlSuppressed === true;
        result.checks.push({
          name: 'Should Suppress',
          expected: true,
          actual: suppressed,
          passed: suppressed
        });
      }

      // Check: Path Contains
      if (expected.pathContains && tracks.length > 0) {
        const pathSummary = tracks[0].pathSummary || '';
        const pathMatch = expected.pathContains.every(zone => 
          pathSummary.toUpperCase().includes(zone.toUpperCase())
        );
        result.checks.push({
          name: 'Path Contains',
          expected: expected.pathContains.join(' → '),
          actual: pathSummary,
          passed: pathMatch
        });
      }

      // Check: Min Dwell
      if (expected.minDwell && tracks.length > 0) {
        const dwell = tracks[0].dwellSecondsPrivate || 0;
        const dwellMatch = dwell >= expected.minDwell;
        result.checks.push({
          name: 'Min Dwell Time',
          expected: `>= ${expected.minDwell}s`,
          actual: `${dwell}s`,
          passed: dwellMatch
        });
      }

      // 整体结果
      result.passed = result.checks.every(c => c.passed);

      // 打印结果
      for (const check of result.checks) {
        const icon = check.passed ? '✅' : '❌';
        console.log(`   ${icon} ${check.name}: ${check.actual} (expected: ${check.expected})`);
      }

    } catch (error) {
      result.error = error.message;
      console.log(`   ❌ Error: ${error.message}`);
    }

    this.results.push(result);
    return result;
  }

  async runAllTests(filter = null) {
    console.log('\n' + '='.repeat(70));
    console.log('🏠 NeighborGuard E2E Tests - Your Home Sensor Setup');
    console.log('='.repeat(70));

    await this.setup();

    const scenarios = Object.entries(TEST_SCENARIOS);
    let filtered = scenarios;

    if (filter) {
      if (filter.startsWith('--scenario=')) {
        const id = filter.replace('--scenario=', '');
        filtered = scenarios.filter(([k]) => k === id);
      } else if (filter.startsWith('--category=')) {
        const cat = filter.replace('--category=', '');
        filtered = scenarios.filter(([, v]) => v.category === cat);
      }
    }

    console.log(`\n📊 Running ${filtered.length} test scenarios...\n`);

    for (const [id, scenario] of filtered) {
      await this.runScenario(id, scenario);
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    // By category
    const categories = {};
    for (const result of this.results) {
      if (!categories[result.category]) {
        categories[result.category] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        categories[result.category].passed++;
      } else {
        categories[result.category].failed++;
      }
    }

    console.log('\nBy Category:');
    for (const [cat, stats] of Object.entries(categories)) {
      const icon = stats.failed === 0 ? '✅' : '⚠️';
      console.log(`  ${icon} ${cat}: ${stats.passed}/${stats.passed + stats.failed} passed`);
    }

    console.log(`\n总计: ${passed}/${total} 通过 (${Math.round(passed/total*100)}%)`);
    
    if (failed > 0) {
      console.log('\n❌ 失败的测试:');
      for (const result of this.results.filter(r => !r.passed)) {
        console.log(`  - ${result.id}: ${result.name}`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
        for (const check of result.checks.filter(c => !c.passed)) {
          console.log(`    ✗ ${check.name}: got ${check.actual}, expected ${check.expected}`);
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    
    if (passed === total) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`⚠️ ${failed} test(s) failed. Please review.`);
    }
  }
}

// ============================================================================
// 主执行
// ============================================================================

async function main() {
  const runner = new E2ETestRunner();
  const filter = process.argv[2] || null;

  try {
    await runner.runAllTests(filter);
  } catch (error) {
    console.error('\n❌ Test runner error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
