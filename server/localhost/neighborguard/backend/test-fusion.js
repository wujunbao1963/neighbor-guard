// ============================================================================
// FusionEngine Test Script
// Run with: node test-fusion.js
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');
const { fusionEngine, FUSION_RULES } = require('./src/services/fusionEngine');
const { v4: uuidv4 } = require('uuid');

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');

  // 1. Create test user
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      id: uuidv4(),
      email: 'test@example.com',
      displayName: 'Test User'
    }
  });
  console.log('   ✅ User:', user.email);

  // 2. Create circle
  const circle = await prisma.circle.upsert({
    where: { id: 'test-circle-001' },
    update: {},
    create: {
      id: 'test-circle-001',
      ownerId: user.id,
      displayName: 'Test Home Circle'
    }
  });
  console.log('   ✅ Circle:', circle.displayName);

  // 3. Create home with NIGHT mode
  const home = await prisma.home.upsert({
    where: { circleId: circle.id },
    update: { houseMode: 'NIGHT' },
    create: {
      id: uuidv4(),
      circleId: circle.id,
      displayName: 'Test Home',
      houseMode: 'NIGHT'
    }
  });
  console.log('   ✅ Home:', home.displayName, '(Mode:', home.houseMode + ')');

  // 4. Create circle member (owner)
  const member = await prisma.circleMember.upsert({
    where: { circleId_userId: { circleId: circle.id, userId: user.id } },
    update: {},
    create: {
      id: uuidv4(),
      circleId: circle.id,
      userId: user.id,
      role: 'OWNER'
    }
  });
  console.log('   ✅ Member:', member.role);

  // 5. Create zones with proper zone types and privacy levels
  const zones = [
    // Entry zones - HIGH VALUE
    { zoneType: 'BACK_DOOR', displayName: 'Back Door', privacyLevel: 'RESTRICTED', zoneGroup: 'back', icon: '🚪', isHighValueArea: true },
    { zoneType: 'FRONT_DOOR', displayName: 'Front Door', privacyLevel: 'SEMI_PRIVATE', zoneGroup: 'front', icon: '🚪', isHighValueArea: true },
    { zoneType: 'GARAGE_DOOR', displayName: 'Garage Door', privacyLevel: 'SEMI_PRIVATE', zoneGroup: 'garage', icon: '🏠', isHighValueArea: true },
    // Outdoor zones
    { zoneType: 'BACK_YARD', displayName: 'Backyard', privacyLevel: 'PRIVATE', zoneGroup: 'back', icon: '🌳', isHighValueArea: false },
    { zoneType: 'FRONT_YARD', displayName: 'Front Yard', privacyLevel: 'SEMI_PRIVATE', zoneGroup: 'front', icon: '🌿', isHighValueArea: false },
    { zoneType: 'GARAGE_DRIVEWAY', displayName: 'Driveway', privacyLevel: 'SEMI_PRIVATE', zoneGroup: 'garage', icon: '🚗', isHighValueArea: false },
    // Interior zones
    { zoneType: 'LIVING_ROOM', displayName: 'Living Room', privacyLevel: 'RESTRICTED', zoneGroup: 'interior', icon: '🛋️', isHighValueArea: false },
  ];

  const createdZones = {};
  for (const z of zones) {
    const zone = await prisma.zone.upsert({
      where: { circleId_zoneType: { circleId: circle.id, zoneType: z.zoneType } },
      update: { privacyLevel: z.privacyLevel, displayName: z.displayName, icon: z.icon },
      create: {
        id: uuidv4(),
        circleId: circle.id,
        zoneType: z.zoneType,
        displayName: z.displayName,
        zoneGroup: z.zoneGroup,
        privacyLevel: z.privacyLevel,
        icon: z.icon || '📍',
        isEnabled: true,
        isHighValueArea: z.isHighValueArea || false
      }
    });
    createdZones[z.zoneType] = zone;
  }
  console.log('   ✅ Zones:', Object.keys(createdZones).join(', '));

  // 6. Create integration
  const integration = await prisma.integration.upsert({
    where: { webhookToken: 'test-webhook-token' },
    update: {},
    create: {
      id: uuidv4(),
      circleId: circle.id,
      name: 'Test Home Assistant',
      type: 'HOME_ASSISTANT',
      webhookToken: 'test-webhook-token',
      isActive: true
    }
  });
  console.log('   ✅ Integration:', integration.name);

  // 7. Create sensors
  const sensors = [
    { externalId: 'binary_sensor.back_door', name: 'Back Door Sensor', sensorType: 'DOOR_CONTACT', zoneType: 'BACK_DOOR' },
    { externalId: 'binary_sensor.living_room_pir', name: 'Living Room PIR', sensorType: 'PIR', zoneType: 'LIVING_ROOM' },
    { externalId: 'binary_sensor.backyard_pir', name: 'Backyard PIR', sensorType: 'PIR', zoneType: 'BACK_YARD' },
    { externalId: 'binary_sensor.front_window_glass', name: 'Front Window Glass', sensorType: 'GLASS_BREAK', zoneType: 'LIVING_ROOM' },
    { externalId: 'binary_sensor.front_door', name: 'Front Door Sensor', sensorType: 'DOOR_CONTACT', zoneType: 'FRONT_DOOR' },
    { externalId: 'binary_sensor.driveway_pir', name: 'Driveway PIR', sensorType: 'PIR', zoneType: 'GARAGE_DRIVEWAY' },
  ];

  const createdSensors = {};
  for (const s of sensors) {
    const sensor = await prisma.sensor.upsert({
      where: { integrationId_externalId: { integrationId: integration.id, externalId: s.externalId } },
      update: {},
      create: {
        id: uuidv4(),
        circleId: circle.id,
        integrationId: integration.id,
        zoneId: createdZones[s.zoneType]?.id,
        externalId: s.externalId,
        name: s.name,
        sensorType: s.sensorType,
        isEnabled: true
      }
    });
    createdSensors[s.externalId] = sensor;
  }
  console.log('   ✅ Sensors:', Object.keys(createdSensors).length);

  return { user, circle, home, member, zones: createdZones, integration, sensors: createdSensors };
}

async function cleanupTestEvents(circleId) {
  // Clean up previous test data
  await prisma.event.deleteMany({ where: { circleId } });
  await prisma.sensorEvent.deleteMany({ where: { circleId } });
  await prisma.track.deleteMany({ where: { circleId } });
  console.log('   🧹 Cleaned up previous test events\n');
}

async function runTests(testData) {
  const { circle, sensors } = testData;

  console.log('='.repeat(60));
  console.log('🧪 FUSION ENGINE TESTS');
  console.log('='.repeat(60));

  // Test 1: Night back door break-in (door + PIR)
  console.log('\n📋 Test 1: Night Back Door Break-in (R1)');
  console.log('   Scenario: Back door opens, then living room PIR triggers');
  
  const t1_time = new Date();
  
  // Door opens
  const result1a = await fusionEngine.ingestSensorEvent({
    circleId: circle.id,
    sensorId: sensors['binary_sensor.back_door'].id,
    newState: 'open',
    oldState: 'closed',
    occurredAt: t1_time
  });
  console.log('   Door event:', result1a.sensorEventId ? '✅ created' : '❌ failed');

  // PIR triggers 5 seconds later
  const result1b = await fusionEngine.ingestSensorEvent({
    circleId: circle.id,
    sensorId: sensors['binary_sensor.living_room_pir'].id,
    newState: 'on',
    oldState: 'off',
    occurredAt: new Date(t1_time.getTime() + 5000)
  });
  
  console.log('   PIR event:', result1b.sensorEventId ? '✅ created' : '❌ failed');
  console.log('   Track:', result1b.trackId ? '✅ created/updated' : '⚠️ none');
  console.log('   Rule matched:', result1b.ruleMatched || 'none');
  console.log('   Security Event:', result1b.createdSecurityEventId ? '✅ created' : (result1b.updatedSecurityEventId ? '✅ updated' : '⚠️ none'));
  console.log('   Notification:', result1b.notificationLevel);
  
  const test1Pass = result1b.ruleMatched === 'R1_BREAKIN_DOOR_PIR' && result1b.notificationLevel === 'HIGH';
  console.log(`   Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 2: Single PIR in HOME mode should be suppressed
  console.log('\n📋 Test 2: Single PIR in HOME mode (should be suppressed)');
  
  // Change to HOME mode
  await prisma.home.update({
    where: { circleId: circle.id },
    data: { houseMode: 'HOME' }
  });

  // Clean tracks for fresh test
  await prisma.track.updateMany({
    where: { circleId: circle.id },
    data: { isClosed: true }
  });

  const result2 = await fusionEngine.ingestSensorEvent({
    circleId: circle.id,
    sensorId: sensors['binary_sensor.backyard_pir'].id,
    newState: 'on',
    oldState: 'off',
    occurredAt: new Date()
  });
  
  console.log('   PIR event:', result2.sensorEventId ? '✅ created' : '❌ failed');
  console.log('   Suppressed:', result2.suppressed ? '✅ yes' : '❌ no');
  console.log('   Reason:', result2.suppressReason || 'none');
  
  const test2Pass = result2.suppressed && result2.suppressReason === 'NO_RULE_MATCHED';
  console.log(`   Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 3: DISARMED mode should suppress most events
  console.log('\n📋 Test 3: Door open in DISARMED mode (should be suppressed)');
  
  await prisma.home.update({
    where: { circleId: circle.id },
    data: { houseMode: 'DISARMED' }
  });

  await prisma.track.updateMany({
    where: { circleId: circle.id },
    data: { isClosed: true }
  });

  const result3 = await fusionEngine.ingestSensorEvent({
    circleId: circle.id,
    sensorId: sensors['binary_sensor.back_door'].id,
    newState: 'open',
    oldState: 'closed',
    occurredAt: new Date()
  });
  
  console.log('   Door event:', result3.sensorEventId ? '✅ created' : '❌ failed');
  console.log('   Suppressed:', result3.suppressed ? '✅ yes' : '❌ no');
  console.log('   Reason:', result3.suppressReason || 'none');
  
  const test3Pass = result3.suppressed && result3.suppressReason === 'DISARMED_MODE';
  console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 4: Glass break should trigger even in DISARMED
  console.log('\n📋 Test 4: Glass break in DISARMED mode (should still alert)');
  
  await prisma.track.updateMany({
    where: { circleId: circle.id },
    data: { isClosed: true }
  });

  const result4 = await fusionEngine.ingestSensorEvent({
    circleId: circle.id,
    sensorId: sensors['binary_sensor.front_window_glass'].id,
    newState: 'triggered',
    oldState: 'clear',
    occurredAt: new Date()
  });
  
  console.log('   Glass break event:', result4.sensorEventId ? '✅ created' : '❌ failed');
  console.log('   Rule matched:', result4.ruleMatched || 'none');
  console.log('   Security Event:', result4.createdSecurityEventId ? '✅ created' : '⚠️ none');
  console.log('   Notification:', result4.notificationLevel, '(NORMAL expected in DISARMED)');
  
  // Glass break in DISARMED should match R2 and create event
  // Notification is NORMAL (not HIGH) because DISARMED mode dampens notifications
  const test4Pass = result4.ruleMatched === 'R2_BREAKIN_GLASS' && result4.createdSecurityEventId;
  console.log(`   Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = [test1Pass, test2Pass, test3Pass, test4Pass].filter(Boolean).length;
  console.log(`   Passed: ${passed}/4`);
  console.log(`   ${passed === 4 ? '🎉 All tests passed!' : '⚠️ Some tests failed'}`);
  console.log('='.repeat(60) + '\n');
}

async function showDatabaseState(circleId) {
  console.log('\n📊 Database State:');
  
  const tracks = await prisma.track.findMany({ where: { circleId } });
  console.log(`   Tracks: ${tracks.length}`);
  
  const sensorEvents = await prisma.sensorEvent.findMany({ where: { circleId } });
  console.log(`   SensorEvents: ${sensorEvents.length}`);
  
  const events = await prisma.event.findMany({ 
    where: { circleId },
    include: { zone: true }
  });
  console.log(`   Security Events: ${events.length}`);
  
  if (events.length > 0) {
    console.log('\n   Security Events Created:');
    for (const e of events) {
      console.log(`   - ${e.title}`);
      console.log(`     Type: ${e.eventType}, Severity: ${e.severity}`);
      console.log(`     Zone: ${e.zone?.displayName}, Rule: ${e.fusionRule}`);
      console.log(`     Path: ${e.pathSummary || 'N/A'}`);
    }
  }
}

async function main() {
  try {
    const testData = await setupTestData();
    await cleanupTestEvents(testData.circle.id);
    await runTests(testData);
    await showDatabaseState(testData.circle.id);
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
