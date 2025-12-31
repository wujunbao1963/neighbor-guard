// ============================================================================
// Phase 2: ML Feedback Test Script
// Run with: node test-ml-feedback.js
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');
const { v4: uuidv4 } = require('uuid');

async function runTests() {
  console.log('\n🧠 ML FEEDBACK TESTS');
  console.log('='.repeat(60));

  try {
    // 1. Find or create test user and circle
    console.log('\n📋 Setting up test data...');
    
    let user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: 'test@example.com',
          displayName: 'Test User'
        }
      });
      console.log('   Created test user');
    }

    let circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });
    if (!circle) {
      circle = await prisma.circle.create({
        data: {
          id: uuidv4(),
          ownerId: user.id,
          displayName: 'Test Circle'
        }
      });
      console.log('   Created test circle');
    }

    // Create a home if needed
    let home = await prisma.home.findUnique({ where: { circleId: circle.id } });
    if (!home) {
      home = await prisma.home.create({
        data: {
          id: uuidv4(),
          circleId: circle.id,
          displayName: 'Test Home'
        }
      });
      console.log('   Created test home');
    }

    // Create a zone if needed
    let zone = await prisma.zone.findFirst({ where: { circleId: circle.id } });
    if (!zone) {
      zone = await prisma.zone.create({
        data: {
          id: uuidv4(),
          circleId: circle.id,
          zoneType: 'FRONT_DOOR',
          displayName: 'Front Door',
          zoneGroup: 'front',
          privacyLevel: 'SEMI_PRIVATE'
        }
      });
      console.log('   Created test zone');
    }

    // Create a member if needed
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
      console.log('   Created test member');
    }

    console.log('   ✅ Test data ready');
    console.log(`   Circle: ${circle.id}`);
    console.log(`   User: ${user.id}`);

    // Clean up old test data
    console.log('\n📋 Cleaning up old test data...');
    await prisma.eventFeedback.deleteMany({ where: { circleId: circle.id } });
    await prisma.eventMLFeature.deleteMany({ where: { circleId: circle.id } });
    await prisma.event.deleteMany({ where: { circleId: circle.id, title: { startsWith: 'Test Event' } } });
    console.log('   ✅ Cleaned up old test data');

    // 2. Create test events
    console.log('\n📋 Test 1: Create test events for feedback');
    
    const events = [];
    for (let i = 0; i < 5; i++) {
      const event = await prisma.event.create({
        data: {
          id: uuidv4(),
          circleId: circle.id,
          zoneId: zone.id,
          creatorId: member.id,
          eventType: i % 2 === 0 ? 'suspicious_person' : 'break_in_attempt',
          title: `Test Event ${i + 1}`,
          severity: i === 0 ? 'HIGH' : 'MEDIUM',
          sourceType: 'FUSION',
          isSecurityEvent: true,
          occurredAt: new Date(Date.now() - i * 3600000) // Spread over hours
        }
      });
      events.push(event);
    }
    console.log(`   ✅ Created ${events.length} test events`);

    // 3. Test submitting feedback
    console.log('\n📋 Test 2: Submit feedback for events');
    
    // Mark first 2 events as FALSE_ALARM
    for (let i = 0; i < 2; i++) {
      await prisma.eventFeedback.upsert({
        where: {
          eventId_userId: { eventId: events[i].id, userId: user.id }
        },
        update: { label: 'FALSE_ALARM' },
        create: {
          id: uuidv4(),
          circleId: circle.id,
          eventId: events[i].id,
          userId: user.id,
          label: 'FALSE_ALARM',
          clientPlatform: 'test'
        }
      });
    }
    console.log('   ✅ Marked 2 events as FALSE_ALARM');

    // Mark next 2 events as USEFUL
    for (let i = 2; i < 4; i++) {
      await prisma.eventFeedback.upsert({
        where: {
          eventId_userId: { eventId: events[i].id, userId: user.id }
        },
        update: { label: 'USEFUL' },
        create: {
          id: uuidv4(),
          circleId: circle.id,
          eventId: events[i].id,
          userId: user.id,
          label: 'USEFUL',
          clientPlatform: 'test'
        }
      });
    }
    console.log('   ✅ Marked 2 events as USEFUL');

    // 4. Test fetching feedback
    console.log('\n📋 Test 3: Fetch feedback for specific event');
    
    const feedback = await prisma.eventFeedback.findUnique({
      where: {
        eventId_userId: { eventId: events[0].id, userId: user.id }
      }
    });
    
    const test3Pass = feedback && feedback.label === 'FALSE_ALARM';
    console.log(`   Feedback label: ${feedback?.label || 'NOT FOUND'}`);
    console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);

    // 5. Test aggregated stats
    console.log('\n📋 Test 4: Get aggregated feedback stats');
    
    const stats = await prisma.eventFeedback.groupBy({
      by: ['label'],
      where: { circleId: circle.id },
      _count: { label: true }
    });

    const falseAlarmCount = stats.find(s => s.label === 'FALSE_ALARM')?._count.label || 0;
    const usefulCount = stats.find(s => s.label === 'USEFUL')?._count.label || 0;
    const totalFeedback = falseAlarmCount + usefulCount;
    const falseAlarmRate = totalFeedback > 0 ? (falseAlarmCount / totalFeedback).toFixed(2) : 0;

    console.log(`   Total feedback: ${totalFeedback}`);
    console.log(`   False alarms: ${falseAlarmCount}`);
    console.log(`   Useful: ${usefulCount}`);
    console.log(`   False alarm rate: ${falseAlarmRate}`);
    
    const test4Pass = falseAlarmCount === 2 && usefulCount === 2;
    console.log(`   Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

    // 6. Test feedback by event type (using Prisma instead of raw SQL)
    console.log('\n📋 Test 5: Feedback stats by event type');
    
    const feedbacksWithEvents = await prisma.eventFeedback.findMany({
      where: { circleId: circle.id },
      include: { event: { select: { eventType: true } } }
    });

    const byEventType = {};
    for (const fb of feedbacksWithEvents) {
      const type = fb.event.eventType;
      if (!byEventType[type]) {
        byEventType[type] = { false_alarm_count: 0, useful_count: 0 };
      }
      if (fb.label === 'FALSE_ALARM') {
        byEventType[type].false_alarm_count++;
      } else {
        byEventType[type].useful_count++;
      }
    }

    console.log('   By event type:');
    for (const [type, counts] of Object.entries(byEventType)) {
      console.log(`     ${type}: FA=${counts.false_alarm_count}, Useful=${counts.useful_count}`);
    }
    const test5Pass = Object.keys(byEventType).length > 0;
    console.log(`   Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'}`);

    // 7. Test upsert (update existing feedback)
    console.log('\n📋 Test 6: Update existing feedback (upsert)');
    
    const updated = await prisma.eventFeedback.upsert({
      where: {
        eventId_userId: { eventId: events[0].id, userId: user.id }
      },
      update: { label: 'USEFUL', note: 'Changed my mind' },
      create: {
        id: uuidv4(),
        circleId: circle.id,
        eventId: events[0].id,
        userId: user.id,
        label: 'USEFUL'
      }
    });

    const test6Pass = updated.label === 'USEFUL' && updated.note === 'Changed my mind';
    console.log(`   Updated label: ${updated.label}`);
    console.log(`   Note: ${updated.note}`);
    console.log(`   Result: ${test6Pass ? '✅ PASS' : '❌ FAIL'}`);

    // 8. Test EventMLFeature creation
    console.log('\n📋 Test 7: Create EventMLFeature record');
    
    const mlFeature = await prisma.eventMLFeature.upsert({
      where: { eventId: events[0].id },
      update: {},
      create: {
        id: uuidv4(),
        eventId: events[0].id,
        circleId: circle.id,
        homeId: home.id,
        eventType: 'suspicious_person',
        sourceType: 'FUSION',
        severity: 'MEDIUM',
        houseMode: 'NIGHT',
        hourBucket: 22,
        weekday: 5,
        hasDoorContact: true,
        hasInsideMotion: true,
        hasCameraPerson: false,
        hasGlassBreak: false,
        sensorCount: 2,
        hasPrivateZone: true,
        dwellPrivateSec: 15,
        dwellTotalSec: 45,
        histFalseRateType: 0.35
      }
    });

    const test7Pass = mlFeature && mlFeature.eventType === 'suspicious_person';
    console.log(`   Created ML feature for event: ${mlFeature.eventId.slice(0, 8)}...`);
    console.log(`   House mode: ${mlFeature.houseMode}`);
    console.log(`   Hour bucket: ${mlFeature.hourBucket}`);
    console.log(`   Sensor count: ${mlFeature.sensorCount}`);
    console.log(`   Hist false rate: ${mlFeature.histFalseRateType}`);
    console.log(`   Result: ${test7Pass ? '✅ PASS' : '❌ FAIL'}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 ML FEEDBACK TEST SUMMARY');
    console.log('='.repeat(60));
    
    const allPassed = [test3Pass, test4Pass, test5Pass, test6Pass, test7Pass].every(Boolean);
    const passCount = [test3Pass, test4Pass, test5Pass, test6Pass, test7Pass].filter(Boolean).length;
    
    console.log(`   Passed: ${passCount}/5`);
    console.log(`   ${allPassed ? '🎉 All tests passed!' : '⚠️ Some tests failed'}`);
    console.log('='.repeat(60));

    // Final counts
    console.log('\n📊 Final Database State:');
    const finalFeedbackCount = await prisma.eventFeedback.count({ where: { circleId: circle.id } });
    const finalFeatureCount = await prisma.eventMLFeature.count({ where: { circleId: circle.id } });
    console.log(`   EventFeedbacks: ${finalFeedbackCount}`);
    console.log(`   EventMLFeatures: ${finalFeatureCount}`);

  } catch (error) {
    console.error('\n❌ Test error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runTests().catch(console.error);
