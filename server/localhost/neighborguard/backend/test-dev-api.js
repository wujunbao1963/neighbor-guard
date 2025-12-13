// ============================================================================
// Dev Simulation API Test
// Run with: node test-dev-api.js
// Tests the simulation endpoints
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');

// Simple HTTP client simulation (in-process)
async function callDevAPI(method, path, body) {
  const devRoutes = require('./src/routes/dev');
  
  const req = {
    method,
    params: {},
    body: body || {}
  };
  
  // Extract params from path
  const paramMatch = path.match(/\/state\/(.+)/);
  if (paramMatch) {
    req.params.circleId = paramMatch[1];
  }
  
  let responseData = null;
  let responseStatus = 200;
  
  const res = {
    status: (code) => { responseStatus = code; return res; },
    json: (data) => { responseData = data; return res; }
  };
  
  const next = (err) => {
    if (err) {
      responseStatus = 500;
      responseData = { error: err.message };
    }
  };

  // Find the matching route handler
  for (const layer of devRoutes.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = method.toLowerCase();
      
      if (layer.route.methods[routeMethod]) {
        // Check path match
        if (routePath === path || 
            (routePath === '/scenarios' && path === '/scenarios') ||
            (routePath === '/simulate/sensor-event' && path === '/simulate/sensor-event') ||
            (routePath === '/simulate/scenario' && path === '/simulate/scenario') ||
            (routePath === '/reset' && path === '/reset') ||
            (routePath === '/state/:circleId' && path.startsWith('/state/'))) {
          
          // Run middleware first
          for (const mw of devRoutes.stack) {
            if (!mw.route && mw.handle) {
              await new Promise((resolve) => {
                mw.handle(req, res, resolve);
              });
              if (responseStatus === 403) return { status: responseStatus, data: responseData };
            }
          }
          
          // Run handler
          await layer.route.stack[0].handle(req, res, next);
          return { status: responseStatus, data: responseData };
        }
      }
    }
  }
  
  return { status: 404, data: { error: 'Route not found' } };
}

async function runTests() {
  console.log('🔧 Setting up...\n');

  // Ensure test data exists
  const user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
  if (!user) {
    console.log('❌ Please run test-fusion.js first to create test data');
    return;
  }

  const circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });
  const circleId = circle.id;

  console.log('='.repeat(60));
  console.log('🧪 DEV SIMULATION API TESTS');
  console.log('='.repeat(60));

  // Test 1: List scenarios
  console.log('\n📋 Test 1: GET /api/dev/scenarios');
  const result1 = await callDevAPI('GET', '/scenarios');
  console.log('   Status:', result1.status);
  console.log('   Scenarios available:', result1.data?.scenarios?.length || 0);
  const scenarioNames = result1.data?.scenarios?.map(s => s.id).join(', ');
  console.log('   Names:', scenarioNames);
  const test1Pass = result1.status === 200 && result1.data?.scenarios?.length > 0;
  console.log(`   Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 2: Reset data
  console.log('\n📋 Test 2: POST /api/dev/reset');
  const result2 = await callDevAPI('POST', '/reset', { circleId });
  console.log('   Status:', result2.status);
  console.log('   Deleted:', JSON.stringify(result2.data?.deleted));
  const test2Pass = result2.status === 200 && result2.data?.success;
  console.log(`   Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 3: Run scenario - night_backdoor_breakin
  console.log('\n📋 Test 3: POST /api/dev/simulate/scenario (night_backdoor_breakin)');
  const result3 = await callDevAPI('POST', '/simulate/scenario', { 
    scenario: 'night_backdoor_breakin', 
    circleId 
  });
  console.log('   Status:', result3.status);
  console.log('   Scenario:', result3.data?.scenario?.name);
  console.log('   Events simulated:', result3.data?.summary?.eventsSimulated);
  console.log('   Rule matched:', result3.data?.summary?.ruleMatched);
  console.log('   Security Event created:', result3.data?.summary?.securityEventCreated);
  console.log('   Notification level:', result3.data?.summary?.notificationLevel);
  
  const test3Pass = result3.status === 200 && 
                    result3.data?.summary?.ruleMatched === 'R1_BREAKIN_DOOR_PIR' &&
                    result3.data?.summary?.securityEventCreated === true;
  console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 4: Get state
  console.log('\n📋 Test 4: GET /api/dev/state/:circleId');
  const result4 = await callDevAPI('GET', `/state/${circleId}`);
  console.log('   Status:', result4.status);
  console.log('   House mode:', result4.data?.state?.home?.houseMode);
  console.log('   Zones:', result4.data?.state?.zones?.length);
  console.log('   Sensors:', result4.data?.state?.sensors?.length);
  console.log('   Recent events:', result4.data?.state?.recentEvents?.length);
  const test4Pass = result4.status === 200 && result4.data?.state;
  console.log(`   Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 5: Reset and run suppressed scenario
  console.log('\n📋 Test 5: Run home_pir_suppressed scenario');
  await callDevAPI('POST', '/reset', { circleId });
  const result5 = await callDevAPI('POST', '/simulate/scenario', { 
    scenario: 'home_pir_suppressed', 
    circleId 
  });
  console.log('   Status:', result5.status);
  console.log('   House mode:', result5.data?.scenario?.houseMode);
  console.log('   Rule matched:', result5.data?.summary?.ruleMatched || 'none');
  console.log('   Security Event created:', result5.data?.summary?.securityEventCreated);
  
  const test5Pass = result5.status === 200 && 
                    result5.data?.summary?.securityEventCreated === false;
  console.log(`   Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Test 6: Glass break scenario (should work even in HOME mode)
  console.log('\n📋 Test 6: Run glass_break_alert scenario');
  await callDevAPI('POST', '/reset', { circleId });
  const result6 = await callDevAPI('POST', '/simulate/scenario', { 
    scenario: 'glass_break_alert', 
    circleId 
  });
  console.log('   Status:', result6.status);
  console.log('   House mode:', result6.data?.scenario?.houseMode);
  console.log('   Rule matched:', result6.data?.summary?.ruleMatched);
  console.log('   Security Event created:', result6.data?.summary?.securityEventCreated);
  
  const test6Pass = result6.status === 200 && 
                    result6.data?.summary?.ruleMatched === 'R2_BREAKIN_GLASS' &&
                    result6.data?.summary?.securityEventCreated === true;
  console.log(`   Result: ${test6Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DEV API TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = [test1Pass, test2Pass, test3Pass, test4Pass, test5Pass, test6Pass].filter(Boolean).length;
  console.log(`   Passed: ${passed}/6`);
  console.log(`   ${passed === 6 ? '🎉 All tests passed!' : '⚠️ Some tests failed'}`);
  console.log('='.repeat(60) + '\n');
}

runTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
