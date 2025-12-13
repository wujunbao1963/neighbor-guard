// ============================================================================
// NeighborGuard MVP - Database Seed Data
// Phase 1: Complete seed with test users
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================================================================
// Zone Types Configuration (18 types)
// ============================================================================
const ZONE_TYPES = [
  // Front Zone (前区) - 3
  { value: 'FRONT_DOOR', label: '前门', labelEn: 'Front Door', zoneGroup: 'front', icon: '🚪', description: '房屋对外主要出入口', descriptionEn: 'Main entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: true, displayOrder: 1 },
  { value: 'FRONT_YARD', label: '前院', labelEn: 'Front Yard', zoneGroup: 'front', icon: '🌿', description: '前门前方的院子', descriptionEn: 'Front yard', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 2 },
  { value: 'FRONT_STREET', label: '门前街道', labelEn: 'Front Street', zoneGroup: 'front', icon: '🛣️', description: '房屋正前方的街道', descriptionEn: 'Street in front', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 3 },
  
  // Side Zone (侧区) - 3
  { value: 'SIDE_YARD', label: '侧院/侧通道', labelEn: 'Side Yard', zoneGroup: 'side', icon: '🏡', description: '房屋侧面的过道', descriptionEn: 'Side passage', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 4 },
  { value: 'SIDE_DOOR', label: '侧门', labelEn: 'Side Door', zoneGroup: 'side', icon: '🚪', description: '房屋侧面的门', descriptionEn: 'Side door', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 5 },
  { value: 'SIDE_DRIVEWAY', label: '侧区车道', labelEn: 'Side Driveway', zoneGroup: 'side', icon: '🛣️', description: '房屋侧面的车道', descriptionEn: 'Side driveway', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 6 },
  
  // Back Zone (后区) - 3
  { value: 'BACK_YARD', label: '后院', labelEn: 'Back Yard', zoneGroup: 'back', icon: '🌳', description: '房子后方的院子', descriptionEn: 'Backyard', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: false, isHighValueArea: false, displayOrder: 7 },
  { value: 'BACK_DOOR', label: '后门', labelEn: 'Back Door', zoneGroup: 'back', icon: '🚪', description: '房屋后方的门', descriptionEn: 'Back door', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 8 },
  { value: 'BACK_STREET', label: '后街/后巷', labelEn: 'Back Alley', zoneGroup: 'back', icon: '🛣️', description: '房屋后方的街道', descriptionEn: 'Back alley', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 9 },
  
  // Garage Zone (车库区) - 2
  { value: 'GARAGE_DRIVEWAY', label: '车库车道', labelEn: 'Garage Driveway', zoneGroup: 'garage', icon: '🚗', description: '通往车库的车道', descriptionEn: 'Driveway to garage', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 10 },
  { value: 'GARAGE_DOOR', label: '车库门', labelEn: 'Garage Door', zoneGroup: 'garage', icon: '🏠', description: '车库门入口', descriptionEn: 'Garage entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: true, isHighValueArea: true, displayOrder: 11 },
  
  // Special Zone (特殊区域) - 7
  { value: 'BASEMENT', label: '地下室入口', labelEn: 'Basement', zoneGroup: 'special', icon: '🏚️', description: '地下室的入口或窗户', descriptionEn: 'Basement entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 12 },
  { value: 'BUILDING_ENTRANCE', label: '楼宇大门', labelEn: 'Building Entrance', zoneGroup: 'special', icon: '🏢', description: '公寓楼宇主入口', descriptionEn: 'Building main entrance', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: true, displayOrder: 13 },
  { value: 'SHARED_HALLWAY', label: '共用走廊', labelEn: 'Shared Hallway', zoneGroup: 'special', icon: '🚶', description: '楼内的共用走廊', descriptionEn: 'Shared hallway', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 14 },
  { value: 'UNIT_DOOR', label: '单元门', labelEn: 'Unit Door', zoneGroup: 'special', icon: '🚪', description: '公寓单元的门', descriptionEn: 'Unit door', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: false, isHighValueArea: true, displayOrder: 15 },
  { value: 'PARKING_AREA', label: '停车区', labelEn: 'Parking Area', zoneGroup: 'special', icon: '🅿️', description: '停车场/车位', descriptionEn: 'Parking lot', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: true, isHighValueArea: false, displayOrder: 16 },
  { value: 'BALCONY', label: '阳台/露台', labelEn: 'Balcony', zoneGroup: 'special', icon: '🪟', description: '阳台或露台区域', descriptionEn: 'Balcony', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 17 },
  { value: 'OTHER', label: '其他区域', labelEn: 'Other', zoneGroup: 'special', icon: '📍', description: '其他未分类的区域', descriptionEn: 'Other areas', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 18 }
];

// ============================================================================
// Event Types Configuration (7 types)
// ============================================================================
const EVENT_TYPES = [
  { value: 'break_in_attempt', label: '试图入室', labelEn: 'Break-in Attempt', icon: '🚨', severity: 'HIGH', description: '有人试图非法进入', descriptionEn: 'Someone attempting to enter', allowedZones: ['FRONT_DOOR', 'SIDE_DOOR', 'BACK_DOOR', 'GARAGE_DOOR', 'BASEMENT', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'BALCONY'], displayOrder: 1 },
  { value: 'perimeter_damage', label: '门窗/玻璃破坏', labelEn: 'Perimeter Damage', icon: '🧱', severity: 'HIGH', description: '门窗或玻璃被破坏', descriptionEn: 'Doors/windows damaged', allowedZones: ['FRONT_DOOR', 'BACK_DOOR', 'SIDE_DOOR', 'GARAGE_DOOR', 'BASEMENT', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'BALCONY', 'BACK_YARD'], displayOrder: 2 },
  { value: 'suspicious_person', label: '可疑人员', labelEn: 'Suspicious Person', icon: '⚠️', severity: 'MEDIUM', description: '发现可疑人员', descriptionEn: 'Suspicious person observed', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'FRONT_STREET', 'SIDE_YARD', 'SIDE_DOOR', 'SIDE_DRIVEWAY', 'BACK_YARD', 'BACK_DOOR', 'BACK_STREET', 'GARAGE_DRIVEWAY', 'GARAGE_DOOR', 'PARKING_AREA', 'BUILDING_ENTRANCE', 'SHARED_HALLWAY', 'UNIT_DOOR', 'BALCONY', 'OTHER'], displayOrder: 3 },
  { value: 'suspicious_vehicle', label: '可疑车辆', labelEn: 'Suspicious Vehicle', icon: '🚗', severity: 'MEDIUM', description: '发现可疑车辆', descriptionEn: 'Suspicious vehicle observed', allowedZones: ['FRONT_STREET', 'BACK_STREET', 'GARAGE_DRIVEWAY', 'SIDE_DRIVEWAY', 'PARKING_AREA'], displayOrder: 4 },
  { value: 'unusual_noise', label: '异常声响/人影', labelEn: 'Unusual Noise', icon: '🔊', severity: 'MEDIUM', description: '听到异常声响', descriptionEn: 'Unusual sounds observed', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'FRONT_STREET', 'SIDE_YARD', 'SIDE_DOOR', 'BACK_YARD', 'BACK_DOOR', 'BACK_STREET', 'GARAGE_DOOR', 'GARAGE_DRIVEWAY', 'BASEMENT', 'BUILDING_ENTRANCE', 'SHARED_HALLWAY', 'UNIT_DOOR', 'PARKING_AREA', 'BALCONY', 'OTHER'], displayOrder: 5 },
  { value: 'package_event', label: '门口包裹', labelEn: 'Package Event', icon: '📦', severity: 'LOW', description: '包裹相关事件', descriptionEn: 'Package related event', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'GARAGE_DOOR', 'OTHER'], displayOrder: 6 },
  { value: 'custom', label: '自定义安全事件', labelEn: 'Custom Event', icon: '✏️', severity: 'LOW', description: '其他安全事件', descriptionEn: 'Other security events', allowedZones: [], displayOrder: 7 }
];

// ============================================================================
// Test Users Data (你提供的测试数据)
// ============================================================================
const TEST_USERS = [
  { email: 'wujunbao@test.com', displayName: '吴军保' },
  { email: 'zhanghao@test.com', displayName: '张豪' },
  { email: 'cuixuewei@test.com', displayName: '崔雪薇' },
  { email: 'wugehui@test.com', displayName: '吴革会' },
  { email: 'wangguifang@test.com', displayName: '王桂芳' }
];

// Circle configurations with member roles
const TEST_CIRCLES = [
  {
    displayName: '圈子 323',
    homeInfo: {
      displayName: '吴军保家',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T2X 1A1',
      addressLine1: '323 Maple Street NW',
      houseType: 'DETACHED'
    },
    members: [
      { email: 'wujunbao@test.com', role: 'OWNER' },
      { email: 'zhanghao@test.com', role: 'HOUSEHOLD' },   // 同住人
      { email: 'cuixuewei@test.com', role: 'NEIGHBOR' },   // 邻居
      { email: 'wugehui@test.com', role: 'NEIGHBOR' },
      { email: 'wangguifang@test.com', role: 'NEIGHBOR' }
    ]
  },
  {
    displayName: '圈子 509',
    homeInfo: {
      displayName: '崔雪薇家',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T2X 2B2',
      addressLine1: '509 Oak Avenue NW',
      houseType: 'DETACHED'
    },
    members: [
      { email: 'cuixuewei@test.com', role: 'OWNER' },
      { email: 'wugehui@test.com', role: 'HOUSEHOLD' },    // 同住人
      { email: 'wujunbao@test.com', role: 'NEIGHBOR' },    // 邻居
      { email: 'zhanghao@test.com', role: 'NEIGHBOR' },
      { email: 'wangguifang@test.com', role: 'NEIGHBOR' }
    ]
  },
  {
    displayName: '圈子 313',
    homeInfo: {
      displayName: '王桂芳家',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T2X 3C3',
      addressLine1: '313 Pine Road NW',
      houseType: 'DETACHED'
    },
    members: [
      { email: 'wangguifang@test.com', role: 'OWNER' },
      { email: 'wujunbao@test.com', role: 'NEIGHBOR' },
      { email: 'zhanghao@test.com', role: 'NEIGHBOR' },
      { email: 'cuixuewei@test.com', role: 'NEIGHBOR' },
      { email: 'wugehui@test.com', role: 'NEIGHBOR' }
    ]
  }
];

// ============================================================================
// Helper: Initialize zones for a circle based on house type
// ============================================================================
async function initializeZonesForCircle(circleId, houseType) {
  const applicableZones = ZONE_TYPES.filter(z => 
    z.supportedHouseTypes.includes(houseType)
  );

  for (const config of applicableZones) {
    await prisma.zone.create({
      data: {
        circleId,
        zoneType: config.value,
        displayName: config.label,
        zoneGroup: config.zoneGroup,
        icon: config.icon,
        description: config.description,
        isEnabled: config.defaultEnabled,
        displayOrder: config.displayOrder,
        isPublicFacing: config.isPublicFacing,
        isHighValueArea: config.isHighValueArea
      }
    });
  }

  return applicableZones.length;
}

// ============================================================================
// Main Seed Function
// ============================================================================
async function main() {
  console.log('🌱 Starting database seed...\n');

  // 1. Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.eventMedia.deleteMany();
  await prisma.eventNote.deleteMany();
  await prisma.event.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.home.deleteMany();
  await prisma.circleMember.deleteMany();
  await prisma.circle.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.emailWhitelist.deleteMany();
  await prisma.zoneTypeConfig.deleteMany();
  await prisma.eventTypeConfig.deleteMany();
  console.log('   ✅ Data cleared\n');

  // 2. Seed Zone Type Configs
  console.log('📍 Seeding Zone Type Configurations...');
  for (const zone of ZONE_TYPES) {
    await prisma.zoneTypeConfig.create({ data: zone });
  }
  console.log(`   ✅ Created ${ZONE_TYPES.length} zone types\n`);

  // 3. Seed Event Type Configs
  console.log('📋 Seeding Event Type Configurations...');
  for (const eventType of EVENT_TYPES) {
    await prisma.eventTypeConfig.create({ data: eventType });
  }
  console.log(`   ✅ Created ${EVENT_TYPES.length} event types\n`);

  // 4. Create Users and add to whitelist
  console.log('👤 Creating test users...');
  const userMap = {};
  for (const userData of TEST_USERS) {
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        displayName: userData.displayName,
        isActive: true,
        emailVerified: true
      }
    });
    userMap[userData.email] = user;

    // Add to whitelist
    await prisma.emailWhitelist.create({
      data: {
        email: userData.email,
        notes: `Test user: ${userData.displayName}`
      }
    });

    console.log(`   ✅ Created user: ${userData.displayName} (${userData.email})`);
  }
  console.log('');

  // 5. Create Circles with Homes, Members, and Zones
  console.log('🏠 Creating circles with homes and members...\n');
  
  for (const circleConfig of TEST_CIRCLES) {
    // Find owner
    const ownerEmail = circleConfig.members.find(m => m.role === 'OWNER').email;
    const owner = userMap[ownerEmail];

    // Create circle
    const circle = await prisma.circle.create({
      data: {
        displayName: circleConfig.displayName,
        ownerId: owner.id
      }
    });
    console.log(`   📌 Created: ${circleConfig.displayName}`);

    // Create home
    await prisma.home.create({
      data: {
        circleId: circle.id,
        displayName: circleConfig.homeInfo.displayName,
        city: circleConfig.homeInfo.city,
        region: circleConfig.homeInfo.region,
        postalCode: circleConfig.homeInfo.postalCode,
        addressLine1: circleConfig.homeInfo.addressLine1,
        houseType: circleConfig.homeInfo.houseType,
        country: 'CA',
        hasDriveway: true,
        hasBackYard: true,
        hasBackAlley: false
      }
    });
    console.log(`      🏡 Home: ${circleConfig.homeInfo.displayName}`);

    // Add members
    for (const memberConfig of circleConfig.members) {
      const user = userMap[memberConfig.email];
      await prisma.circleMember.create({
        data: {
          circleId: circle.id,
          userId: user.id,
          role: memberConfig.role,
          displayName: user.displayName
        }
      });
      console.log(`      👤 Member: ${user.displayName} (${memberConfig.role})`);
    }

    // Initialize zones
    const zoneCount = await initializeZonesForCircle(circle.id, circleConfig.homeInfo.houseType);
    console.log(`      📍 Zones: ${zoneCount} zones initialized`);
    console.log('');
  }

  // 6. Summary
  const counts = {
    users: await prisma.user.count(),
    circles: await prisma.circle.count(),
    homes: await prisma.home.count(),
    members: await prisma.circleMember.count(),
    zones: await prisma.zone.count(),
    whitelist: await prisma.emailWhitelist.count(),
    zoneTypes: await prisma.zoneTypeConfig.count(),
    eventTypes: await prisma.eventTypeConfig.count()
  };

  console.log('═══════════════════════════════════════════════════');
  console.log('🎉 Database seed completed!\n');
  console.log('📊 Summary:');
  console.log(`   Users:        ${counts.users}`);
  console.log(`   Whitelist:    ${counts.whitelist}`);
  console.log(`   Circles:      ${counts.circles}`);
  console.log(`   Homes:        ${counts.homes}`);
  console.log(`   Members:      ${counts.members}`);
  console.log(`   Zones:        ${counts.zones}`);
  console.log(`   Zone Types:   ${counts.zoneTypes}`);
  console.log(`   Event Types:  ${counts.eventTypes}`);
  console.log('═══════════════════════════════════════════════════\n');

  console.log('🔑 Test Login Emails:');
  TEST_USERS.forEach(u => {
    console.log(`   ${u.displayName}: ${u.email}`);
  });
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
