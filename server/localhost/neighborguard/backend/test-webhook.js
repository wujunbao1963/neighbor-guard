// ============================================================================
// Webhook Integration Test
// Run with: node test-webhook.js
// This tests the webhook endpoint with the FusionEngine
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');
const { v4: uuidv4 } = require('uuid');

// Simulate HTTP request to webhook
async function simulateWebhook(token, payload) {
  // We'll test by directly calling the route logic
  // In production, you'd use fetch() to hit the actual endpoint
  const webhooks = require('./src/routes/webhooks');
  
  // Create mock req/res
  const req = {
    params: { token },
    body: payload
  };
  
  let responseData = null;
  let responseStatus = 200;
  
  const res = {
    status: (code) => {
      responseStatus = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    }
  };
  
  const next = (err) => {
    if (err) {
      responseStatus = 500;
      responseData = { error: err.message };
    }
  };

  // Find the POST handler
  const postHandler = webhooks.stack.find(layer => 
    layer.route && layer.route.path === '/ha/:token' && layer.route.methods.post
  );
  
  if (postHandler) {
    await postHandler.route.stack[0].handle(req, res, next);
  }
  
  return { status: responseStatus, data: responseData };
}

async function runWebhookTests() {
  console.log('🔧 Setting up test data...\n');

  // Use existing test data from test-fusion.js
  const user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
  if (!user) {
    console.log('❌ Please run test-fusion.js first to create test data');
    return;
  }

  const circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });
  const integration = await prisma.integration.findFirst({ where: { circleId: circle.id } });
  
  // Set home to NIGHT mode for testing
  await prisma.home.update({
    where: { circleId: circle.id },
    data: { houseMode: 'NIGHT' }
  });

  // Clean up previous events
  await prisma.event.deleteMany({ where: { circleId: circle.id } });
  await prisma.sensorEvent.deleteMany({ where: { circleId: circle.id } });
  await prisma.track.deleteMany({ where: { circleId: circle.id } });

  console.log('   ✅ Using existing test data');
  console.log('   Webhook token:', integration.webhookToken);
  console.log('');

  console.log('='.repeat(60));
  console.log('🧪 WEBHOOK INTEGRATION TESTS');
  console.log('='.repeat(60));

  // Test 1: Valid webhook with door sensor (alone, should NOT create security event)
  console.log('\n📋 Test 1: Door sensor trigger via webhook (alone)');
  console.log('   Note: Single door event should NOT create security event');
  console.log('         It waits for follow-up sensor (PIR) to confirm break-in');
  
  const result1 = await simulateWebhook(integration.webhookToken, {
    entity_id: 'binary_sensor.back_door',
    new_state: { state: 'open' },
    old_state: { state: 'closed' },
    time_fired: new Date().toISOString()
  });
  
  console.log('   Status:', result1.status);
  console.log('   SensorEvent created:', result1.data?.sensorEventId ? '✅' : '❌');
  console.log('   Track created:', result1.data?.trackId || result1.data?.suppressReason);
  console.log('   Security Event:', result1.data?.securityEventId ? 'created' : 'none (expected)');
  
  // Single door event should be recorded but not create security event yet
  const test1Pass = result1.status === 200 && result1.data.success && result1.data.sensorEventId;
  console.log(`   Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 2: PIR sensor follows (should combine into same track)
  console.log('\n📋 Test 2: PIR sensor follows (same track)');
  
  const result2 = await simulateWebhook(integration.webhookToken, {
    entity_id: 'binary_sensor.living_room_pir',
    new_state: { state: 'on' },
    old_state: { state: 'off' },
    time_fired: new Date().toISOString()
  });
  
  console.log('   Status:', result2.status);
  console.log('   Track ID:', result2.data?.trackId);
  console.log('   Rule matched:', result2.data?.ruleMatched);
  console.log('   Security Event:', result2.data?.securityEventId ? 'created/updated' : 'none');
  const test2Pass = result2.data?.trackId && result2.data?.ruleMatched;
  console.log(`   Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 3: Invalid token
  console.log('\n📋 Test 3: Invalid webhook token');
  
  const result3 = await simulateWebhook('invalid-token-12345', {
    entity_id: 'sensor.test',
    new_state: { state: 'on' }
  });
  
  console.log('   Status:', result3.status);
  const test3Pass = result3.status === 401;
  console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 4: State clear (door closed) - should not create event
  console.log('\n📋 Test 4: Door closed (state clear)');
  
  // Close all tracks first
  await prisma.track.updateMany({
    where: { circleId: circle.id },
    data: { isClosed: true }
  });
  
  const result4 = await simulateWebhook(integration.webhookToken, {
    entity_id: 'binary_sensor.back_door',
    new_state: { state: 'closed' },
    old_state: { state: 'open' },
    time_fired: new Date().toISOString()
  });
  
  console.log('   Status:', result4.status);
  console.log('   Suppressed:', result4.data?.suppressReason || 'N/A');
  const test4Pass = result4.status === 200 && result4.data?.suppressReason === 'NOT_TRIGGER_STATE';
  console.log(`   Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 5: Auto-create new sensor
  console.log('\n📋 Test 5: Auto-create new sensor');
  
  const result5 = await simulateWebhook(integration.webhookToken, {
    entity_id: 'sensor.new_garage_door',
    friendlyName: 'Garage Door Sensor',
    new_state: { state: 'open' },
    time_fired: new Date().toISOString()
  });
  
  console.log('   Status:', result5.status);
  console.log('   New sensor:', result5.data?.sensor?.name);
  
  const newSensor = await prisma.sensor.findFirst({
    where: { externalId: 'sensor.new_garage_door' }
  });
  const test5Pass = newSensor && newSensor.name === 'Garage Door Sensor';
  console.log(`   Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 WEBHOOK TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = [test1Pass, test2Pass, test3Pass, test4Pass, test5Pass].filter(Boolean).length;
  console.log(`   Passed: ${passed}/5`);
  console.log(`   ${passed === 5 ? '🎉 All tests passed!' : '⚠️ Some tests failed'}`);
  console.log('='.repeat(60) + '\n');

  // Show final state
  const events = await prisma.event.findMany({ where: { circleId: circle.id } });
  const tracks = await prisma.track.findMany({ where: { circleId: circle.id } });
  const sensorEvents = await prisma.sensorEvent.findMany({ where: { circleId: circle.id } });
  
  console.log('📊 Final Database State:');
  console.log(`   Tracks: ${tracks.length}`);
  console.log(`   SensorEvents: ${sensorEvents.length}`);
  console.log(`   Security Events: ${events.length}`);
}

runWebhookTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
