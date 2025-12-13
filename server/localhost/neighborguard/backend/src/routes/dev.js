// ============================================================================
// Dev Simulation Routes
// Phase 2: Test fusion scenarios without real hardware
// Only enabled in development mode
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { fusionEngine } = require('../services/fusionEngine');

// ============================================================================
// Middleware: Only allow in development
// ============================================================================
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: { message: 'Dev APIs disabled in production', code: 'DEV_DISABLED' }
    });
  }
  next();
});

// ============================================================================
// POST /api/dev/simulate/sensor-event
// Simulate a single sensor event
// ============================================================================
router.post('/simulate/sensor-event', async (req, res, next) => {
  try {
    const { circleId, sensorId, zoneKey, sensorType, newState, oldState, occurredAt } = req.body;

    // Validate required fields
    if (!circleId) {
      return res.status(400).json({
        success: false,
        error: { message: 'circleId is required', code: 'MISSING_CIRCLE_ID' }
      });
    }

    // Find or identify the sensor
    let sensor;
    
    if (sensorId) {
      sensor = await prisma.sensor.findUnique({ where: { id: sensorId } });
    } else if (zoneKey && sensorType) {
      // Find sensor by zone and type
      const zone = await prisma.zone.findFirst({
        where: { circleId, zoneType: zoneKey }
      });
      
      if (zone) {
        sensor = await prisma.sensor.findFirst({
          where: { circleId, zoneId: zone.id, sensorType }
        });
      }
    }

    if (!sensor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Sensor not found. Provide sensorId or valid zoneKey+sensorType', code: 'SENSOR_NOT_FOUND' }
      });
    }

    // Run through fusion engine
    const result = await fusionEngine.ingestSensorEvent({
      circleId,
      sensorId: sensor.id,
      newState: newState || 'on',
      oldState: oldState || 'off',
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      rawPayload: { simulated: true, ...req.body }
    });

    res.json({
      success: true,
      message: 'Sensor event simulated',
      sensor: { id: sensor.id, name: sensor.name, type: sensor.sensorType },
      fusionResult: result
    });

  } catch (error) {
    console.error('[Dev] Simulate sensor error:', error);
    next(error);
  }
});

// ============================================================================
// Predefined Scenarios
// ============================================================================
const SCENARIOS = {
  // T1: Night back door break-in
  night_backdoor_breakin: {
    name: 'Night Back Door Break-in',
    description: 'Door opens, then PIR triggers in NIGHT mode',
    houseMode: 'NIGHT',
    events: [
      { zoneKey: 'BACK_DOOR', sensorType: 'DOOR_CONTACT', state: 'open', delayMs: 0 },
      { zoneKey: 'LIVING_ROOM', sensorType: 'PIR', state: 'on', delayMs: 3000 }
    ],
    expectedRule: 'R1_BREAKIN_DOOR_PIR',
    expectedSeverity: 'HIGH'
  },

  // T2: Night backyard suspicious person
  night_backyard_suspicious: {
    name: 'Night Backyard Suspicious Person',
    description: 'Motion in private backyard zone',
    houseMode: 'NIGHT',
    events: [
      { zoneKey: 'BACK_YARD', sensorType: 'PIR', state: 'on', delayMs: 0 },
      { zoneKey: 'BACK_YARD', sensorType: 'PIR', state: 'on', delayMs: 5000 },
      { zoneKey: 'BACK_YARD', sensorType: 'PIR', state: 'on', delayMs: 10000 }
    ],
    expectedRule: 'R3_SUSPICIOUS_PERSON',
    expectedSeverity: 'HIGH'
  },

  // T3: Glass break
  glass_break_alert: {
    name: 'Glass Break Alert',
    description: 'Glass break sensor triggers - always alerts',
    houseMode: 'HOME',
    events: [
      { zoneKey: 'LIVING_ROOM', sensorType: 'GLASS_BREAK', state: 'triggered', delayMs: 0 }
    ],
    expectedRule: 'R2_BREAKIN_GLASS',
    expectedSeverity: 'HIGH'
  },

  // T4: HOME mode PIR - should be suppressed
  home_pir_suppressed: {
    name: 'HOME Mode PIR (Suppressed)',
    description: 'Single PIR in HOME mode - no alert',
    houseMode: 'HOME',
    events: [
      { zoneKey: 'LIVING_ROOM', sensorType: 'PIR', state: 'on', delayMs: 0 }
    ],
    expectedRule: null,
    expectedSuppressed: true
  },

  // T5: DISARMED mode door - should be suppressed
  disarmed_door_suppressed: {
    name: 'DISARMED Mode Door (Suppressed)',
    description: 'Door opens in DISARMED mode - no alert',
    houseMode: 'DISARMED',
    events: [
      { zoneKey: 'FRONT_DOOR', sensorType: 'DOOR_CONTACT', state: 'open', delayMs: 0 }
    ],
    expectedRule: null,
    expectedSuppressed: true
  },

  // T6: AWAY mode full intrusion sequence
  away_full_intrusion: {
    name: 'AWAY Mode Full Intrusion',
    description: 'Complete intrusion path: driveway → front door → living room',
    houseMode: 'AWAY',
    events: [
      { zoneKey: 'GARAGE_DRIVEWAY', sensorType: 'PIR', state: 'on', delayMs: 0 },
      { zoneKey: 'FRONT_DOOR', sensorType: 'DOOR_CONTACT', state: 'open', delayMs: 5000 },
      { zoneKey: 'LIVING_ROOM', sensorType: 'PIR', state: 'on', delayMs: 8000 }
    ],
    expectedRule: 'R1_BREAKIN_DOOR_PIR',
    expectedSeverity: 'HIGH'
  }
};

// ============================================================================
// POST /api/dev/simulate/scenario
// Run a predefined scenario
// ============================================================================
router.post('/simulate/scenario', async (req, res, next) => {
  try {
    const { scenario, circleId } = req.body;

    if (!scenario || !SCENARIOS[scenario]) {
      return res.status(400).json({
        success: false,
        error: { 
          message: 'Invalid scenario', 
          code: 'INVALID_SCENARIO',
          availableScenarios: Object.keys(SCENARIOS)
        }
      });
    }

    if (!circleId) {
      return res.status(400).json({
        success: false,
        error: { message: 'circleId is required', code: 'MISSING_CIRCLE_ID' }
      });
    }

    const scenarioConfig = SCENARIOS[scenario];
    console.log(`[Dev] Running scenario: ${scenarioConfig.name}`);

    // Set house mode
    const home = await prisma.home.findUnique({ where: { circleId } });
    if (!home) {
      return res.status(404).json({
        success: false,
        error: { message: 'Home not found for circle', code: 'HOME_NOT_FOUND' }
      });
    }

    const previousMode = home.houseMode;
    await prisma.home.update({
      where: { circleId },
      data: { houseMode: scenarioConfig.houseMode }
    });

    // Close any existing open tracks
    await prisma.track.updateMany({
      where: { circleId, isClosed: false },
      data: { isClosed: true }
    });

    // Run events in sequence
    const results = [];
    const baseTime = Date.now();

    for (const event of scenarioConfig.events) {
      // Find sensor
      const zone = await prisma.zone.findFirst({
        where: { circleId, zoneType: event.zoneKey }
      });

      if (!zone) {
        results.push({
          zoneKey: event.zoneKey,
          error: 'Zone not found'
        });
        continue;
      }

      let sensor = await prisma.sensor.findFirst({
        where: { circleId, zoneId: zone.id, sensorType: event.sensorType }
      });

      if (!sensor) {
        results.push({
          zoneKey: event.zoneKey,
          sensorType: event.sensorType,
          error: 'Sensor not found'
        });
        continue;
      }

      // Simulate with timestamp offset
      const eventTime = new Date(baseTime + event.delayMs);
      
      const fusionResult = await fusionEngine.ingestSensorEvent({
        circleId,
        sensorId: sensor.id,
        newState: event.state,
        oldState: 'off',
        occurredAt: eventTime,
        rawPayload: { simulated: true, scenario, event }
      });

      results.push({
        zoneKey: event.zoneKey,
        sensorType: event.sensorType,
        sensorId: sensor.id,
        timestamp: eventTime.toISOString(),
        fusionResult
      });
    }

    // Restore previous mode (optional - comment out to keep scenario mode)
    // await prisma.home.update({ where: { circleId }, data: { houseMode: previousMode } });

    // Get final event if created
    const lastResult = results[results.length - 1];
    let createdEvent = null;
    if (lastResult?.fusionResult?.createdSecurityEventId) {
      createdEvent = await prisma.event.findUnique({
        where: { id: lastResult.fusionResult.createdSecurityEventId },
        include: { zone: true }
      });
    }

    res.json({
      success: true,
      scenario: {
        id: scenario,
        name: scenarioConfig.name,
        description: scenarioConfig.description,
        houseMode: scenarioConfig.houseMode,
        expectedRule: scenarioConfig.expectedRule,
        expectedSeverity: scenarioConfig.expectedSeverity
      },
      results,
      securityEvent: createdEvent ? {
        id: createdEvent.id,
        title: createdEvent.title,
        eventType: createdEvent.eventType,
        severity: createdEvent.severity,
        zone: createdEvent.zone?.displayName,
        fusionRule: createdEvent.fusionRule,
        pathSummary: createdEvent.pathSummary
      } : null,
      summary: {
        eventsSimulated: results.length,
        ruleMatched: lastResult?.fusionResult?.ruleMatched || null,
        securityEventCreated: !!lastResult?.fusionResult?.createdSecurityEventId,
        notificationLevel: lastResult?.fusionResult?.notificationLevel || 'NONE'
      }
    });

  } catch (error) {
    console.error('[Dev] Scenario error:', error);
    next(error);
  }
});

// ============================================================================
// GET /api/dev/scenarios
// List available scenarios
// ============================================================================
router.get('/scenarios', (req, res) => {
  const scenarios = Object.entries(SCENARIOS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    houseMode: config.houseMode,
    eventCount: config.events.length,
    expectedRule: config.expectedRule
  }));

  res.json({
    success: true,
    scenarios
  });
});

// ============================================================================
// POST /api/dev/reset
// Reset test data (clear events, tracks, sensor events)
// ============================================================================
router.post('/reset', async (req, res, next) => {
  try {
    const { circleId } = req.body;

    if (!circleId) {
      return res.status(400).json({
        success: false,
        error: { message: 'circleId is required', code: 'MISSING_CIRCLE_ID' }
      });
    }

    // Delete in order (foreign key constraints)
    const deletedEvents = await prisma.event.deleteMany({ where: { circleId } });
    const deletedSensorEvents = await prisma.sensorEvent.deleteMany({ where: { circleId } });
    const deletedTracks = await prisma.track.deleteMany({ where: { circleId } });

    // Reset home to DISARMED
    await prisma.home.updateMany({
      where: { circleId },
      data: { houseMode: 'DISARMED' }
    });

    res.json({
      success: true,
      message: 'Test data reset',
      deleted: {
        events: deletedEvents.count,
        sensorEvents: deletedSensorEvents.count,
        tracks: deletedTracks.count
      }
    });

  } catch (error) {
    console.error('[Dev] Reset error:', error);
    next(error);
  }
});

// ============================================================================
// GET /api/dev/state/:circleId
// Get current state for debugging
// ============================================================================
router.get('/state/:circleId', async (req, res, next) => {
  try {
    const { circleId } = req.params;

    const home = await prisma.home.findUnique({ where: { circleId } });
    const zones = await prisma.zone.findMany({ 
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });
    const sensors = await prisma.sensor.findMany({ 
      where: { circleId },
      include: { zone: true }
    });
    const openTracks = await prisma.track.findMany({ 
      where: { circleId, isClosed: false }
    });
    const recentEvents = await prisma.event.findMany({ 
      where: { circleId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { zone: true }
    });
    const recentSensorEvents = await prisma.sensorEvent.findMany({
      where: { circleId },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      include: { sensor: true, zone: true }
    });

    res.json({
      success: true,
      state: {
        home: home ? {
          id: home.id,
          houseMode: home.houseMode,
          nightModeAuto: home.nightModeAuto
        } : null,
        zones: zones.map(z => ({
          id: z.id,
          zoneType: z.zoneType,
          displayName: z.displayName,
          privacyLevel: z.privacyLevel,
          isEnabled: z.isEnabled
        })),
        sensors: sensors.map(s => ({
          id: s.id,
          name: s.name,
          sensorType: s.sensorType,
          zone: s.zone?.zoneType,
          lastState: s.lastState,
          isEnabled: s.isEnabled
        })),
        openTracks: openTracks.map(t => ({
          id: t.id,
          pathSummary: t.pathSummary,
          startTime: t.startTime,
          endTime: t.endTime
        })),
        recentEvents: recentEvents.map(e => ({
          id: e.id,
          title: e.title,
          eventType: e.eventType,
          severity: e.severity,
          zone: e.zone?.displayName,
          fusionRule: e.fusionRule,
          createdAt: e.createdAt
        })),
        recentSensorEvents: recentSensorEvents.map(se => ({
          id: se.id,
          sensor: se.sensor?.name,
          zone: se.zone?.zoneType,
          newState: se.newState,
          occurredAt: se.occurredAt
        }))
      }
    });

  } catch (error) {
    console.error('[Dev] State error:', error);
    next(error);
  }
});

module.exports = router;
