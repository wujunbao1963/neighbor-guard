// ============================================================================
// Phase 2.1: ML Scoring Test Script - PRD Aligned
// Run with: node test-ml-scoring.js
// ============================================================================

require('dotenv').config();
const { notificationScorer, CONFIG } = require('./src/services/notificationScorer');
const { notificationPolicy, NOTIFICATION_LEVELS } = require('./src/services/notificationPolicy');

async function runTests() {
  console.log('\n🧠 ML SCORING TESTS (PRD Aligned)');
  console.log('='.repeat(60));

  const testCircleId = 'test-circle-123';
  const testHomeId = 'test-home-123';
  const results = [];

  // ============================================================================
  // Test 1: Break-in attempt (glass break + person)
  // ============================================================================
  console.log('\n📋 Test 1: Break-in (glass break) → always HIGH priority');
  
  const glassBreakResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'break_in_attempt',
    severity: 'HIGH',
    houseMode: 'DISARMED',
    fusionRule: 'R2_BREAKIN_GLASS_PERSON',
    sensorCount: 2,
    hasGlassBreak: true,
    hasCameraPerson: true,
    maxPrivacyLevel: 'PRIVATE'
  });

  console.log(`   Score: ${glassBreakResult.score}`);
  console.log(`   Method: ${glassBreakResult.method}`);
  const test1Pass = glassBreakResult.score === 1.0;
  results.push(test1Pass);
  console.log(`   Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 2: Break-in pattern (door + PIR in RESTRICTED zone)
  // ============================================================================
  console.log('\n📋 Test 2: Break-in (door + PIR) → high score');
  
  const breakInResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'break_in_attempt',
    severity: 'HIGH',
    houseMode: 'NIGHT',
    fusionRule: 'R1_BREAKIN_DOOR_PIR',
    sensorCount: 2,
    hasDoorContact: true,
    hasInsideMotion: true,
    hasPrivateZone: true,
    maxPrivacyLevel: 'RESTRICTED'
  });

  console.log(`   Score: ${breakInResult.score.toFixed(2)}`);
  const test2Pass = breakInResult.score >= 0.9;
  results.push(test2Pass);
  console.log(`   Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 3: Suspicious person in backyard (PRIVATE zone)
  // ============================================================================
  console.log('\n📋 Test 3: Suspicious person in PRIVATE zone');
  
  const suspiciousPersonResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    houseMode: 'AWAY',
    fusionRule: 'R6_SUSPICIOUS_PERSON_DWELL',
    sensorCount: 1,
    hasCameraPerson: true,
    hasPrivateZone: true,
    maxPrivacyLevel: 'PRIVATE',
    dwellPrivateSec: 30
  });

  console.log(`   Score: ${suspiciousPersonResult.score.toFixed(2)}`);
  console.log(`   Privacy level: ${suspiciousPersonResult.maxPrivacyLevel}`);
  const test3Pass = suspiciousPersonResult.score >= 0.6;
  results.push(test3Pass);
  console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 4: Suspicious vehicle in driveway
  // ============================================================================
  console.log('\n📋 Test 4: Suspicious vehicle in driveway');
  
  const suspiciousVehicleResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'suspicious_vehicle',
    severity: 'MEDIUM',
    houseMode: 'NIGHT',
    fusionRule: 'R9_SUSPICIOUS_VEHICLE_DWELL',
    sensorCount: 1,
    hasVehicle: true,
    maxPrivacyLevel: 'SEMI_PRIVATE',
    dwellPrivateSec: 180
  });

  console.log(`   Score: ${suspiciousVehicleResult.score.toFixed(2)}`);
  const test4Pass = suspiciousVehicleResult.score >= 0.5;
  results.push(test4Pass);
  console.log(`   Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 5: Privacy level comparison (PUBLIC vs RESTRICTED)
  // ============================================================================
  console.log('\n📋 Test 5: Privacy level impact - PUBLIC vs RESTRICTED');
  
  const publicZoneResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    houseMode: 'HOME',
    sensorCount: 1,
    maxPrivacyLevel: 'PUBLIC',
    hasPrivateZone: false
  });

  const restrictedZoneResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    houseMode: 'HOME',
    sensorCount: 1,
    maxPrivacyLevel: 'RESTRICTED',
    hasPrivateZone: true
  });

  console.log(`   PUBLIC zone score: ${publicZoneResult.score.toFixed(2)}`);
  console.log(`   RESTRICTED zone score: ${restrictedZoneResult.score.toFixed(2)}`);
  const test5Pass = restrictedZoneResult.score > publicZoneResult.score + 0.15;
  results.push(test5Pass);
  console.log(`   Difference: ${(restrictedZoneResult.score - publicZoneResult.score).toFixed(2)}`);
  console.log(`   Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 6: Package delivered event
  // ============================================================================
  console.log('\n📋 Test 6: Package delivered event');
  
  const packageDeliveredResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'package_delivered',
    severity: 'LOW',
    houseMode: 'AWAY',
    fusionRule: 'R12_PACKAGE_DELIVERED',
    sensorCount: 1,
    maxPrivacyLevel: 'SEMI_PRIVATE'
  });

  console.log(`   Score: ${packageDeliveredResult.score.toFixed(2)}`);
  const test6Pass = packageDeliveredResult.score >= 0.3 && packageDeliveredResult.score < 0.7;
  results.push(test6Pass);
  console.log(`   Result: ${test6Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 7: Safety event (fire) - always maximum priority
  // ============================================================================
  console.log('\n📋 Test 7: Safety event (fire) → always maximum');
  
  const fireResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'fire_detected',
    severity: 'HIGH',
    houseMode: 'DISARMED', // Even when disarmed!
    fusionRule: 'R14_FIRE_DETECTED',
    sensorCount: 1,
    maxPrivacyLevel: 'RESTRICTED'
  });

  // Fire should always get high score regardless of mode
  const policyResult = notificationPolicy.decide({
    score: 0.1, // Even with artificially low score
    eventType: 'fire_detected',
    severity: 'HIGH',
    houseMode: 'DISARMED',
    fusionRule: 'R14_FIRE_DETECTED'
  });

  console.log(`   Policy level: ${policyResult.level}`);
  console.log(`   Was overridden: ${policyResult.wasOverridden}`);
  const test7Pass = policyResult.level === 'HIGH';
  results.push(test7Pass);
  console.log(`   Result: ${test7Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 8: Perimeter damage (glass break without person)
  // ============================================================================
  console.log('\n📋 Test 8: Perimeter damage (glass only, no person)');
  
  const perimeterResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'perimeter_damage',
    severity: 'MEDIUM',
    houseMode: 'AWAY',
    fusionRule: 'R4_PERIMETER_GLASS_ONLY',
    sensorCount: 1,
    hasGlassBreak: true,
    hasCameraPerson: false,
    maxPrivacyLevel: 'SEMI_PRIVATE'
  });

  console.log(`   Score: ${perimeterResult.score.toFixed(2)}`);
  const test8Pass = perimeterResult.score >= 0.7;
  results.push(test8Pass);
  console.log(`   Result: ${test8Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 9: Motion alert in DISARMED mode → suppressed
  // ============================================================================
  console.log('\n📋 Test 9: Motion in DISARMED mode → suppressed');
  
  const motionDisarmedResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'motion_detected',
    severity: 'LOW',
    houseMode: 'DISARMED',
    sensorCount: 1,
    hasInsideMotion: true,
    maxPrivacyLevel: 'SEMI_PRIVATE'
  });

  const motionPolicy = notificationPolicy.decide({
    score: motionDisarmedResult.score,
    eventType: 'motion_detected',
    severity: 'LOW',
    houseMode: 'DISARMED'
  });

  console.log(`   Score: ${motionDisarmedResult.score.toFixed(2)}`);
  console.log(`   Policy level: ${motionPolicy.level}`);
  const test9Pass = motionPolicy.level === 'NONE';
  results.push(test9Pass);
  console.log(`   Result: ${test9Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Test 10: Unusual noise at night
  // ============================================================================
  console.log('\n📋 Test 10: Unusual noise at NIGHT');
  
  const noiseResult = await notificationScorer.predict({
    circleId: testCircleId,
    homeId: testHomeId,
    eventType: 'unusual_noise',
    severity: 'LOW',
    houseMode: 'NIGHT',
    fusionRule: 'R11_UNUSUAL_NOISE',
    sensorCount: 1,
    maxPrivacyLevel: 'PRIVATE'
  });

  console.log(`   Score: ${noiseResult.score.toFixed(2)}`);
  const test10Pass = noiseResult.score >= 0.4;
  results.push(test10Pass);
  console.log(`   Result: ${test10Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 ML SCORING TEST SUMMARY (PRD Aligned)');
  console.log('='.repeat(60));
  
  const passCount = results.filter(Boolean).length;
  const allPassed = results.every(Boolean);
  
  console.log(`   Passed: ${passCount}/${results.length}`);
  console.log(`   ${allPassed ? '🎉 All tests passed!' : '⚠️ Some tests failed'}`);
  console.log('='.repeat(60));

  // ============================================================================
  // Display PRD event types
  // ============================================================================
  console.log('\n📊 PRD Event Types Supported:');
  console.log('   1. break_in_attempt    - Door/glass + indoor activity');
  console.log('   2. perimeter_damage    - Glass/vibration without entry');
  console.log('   3. suspicious_person   - Person loitering in private zone');
  console.log('   4. suspicious_vehicle  - Vehicle loitering');
  console.log('   5. unusual_noise       - Audio events');
  console.log('   6. package_delivered   - Package at door');
  console.log('   6. package_taken       - Package removed');
  console.log('   + fire_detected, co_detected, water_leak_detected (safety)');
}

runTests().catch(console.error);
