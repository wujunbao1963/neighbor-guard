// ============================================================================
// Webhook Routes
// Phase 2: Uses FusionEngine for intelligent event creation
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { fusionEngine } = require('../services/fusionEngine');

// Helper: Guess sensor type from entity_id
function guessSensorType(entityId) {
  const id = entityId.toLowerCase();
  if (id.includes('door') || id.includes('window') || id.includes('contact')) return 'DOOR_CONTACT';
  if (id.includes('motion') || id.includes('pir') || id.includes('occupancy')) return 'PIR';
  if (id.includes('glass') || id.includes('break')) return 'GLASS_BREAK';
  if (id.includes('vibration') || id.includes('shock')) return 'VIBRATION';
  if (id.includes('smoke') || id.includes('fire')) return 'SMOKE';
  if (id.includes('water') || id.includes('leak') || id.includes('flood')) return 'WATER_LEAK';
  return 'OTHER';
}

// ============================================================================
// POST /api/webhooks/ha/:token - Receive Home Assistant event
// ============================================================================
router.post('/ha/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const payload = req.body;

    console.log('[Webhook] Received HA event:', JSON.stringify(payload, null, 2));

    // 1. Validate webhook token and get integration
    const integration = await prisma.integration.findUnique({
      where: { webhookToken: token },
      include: {
        circle: {
          include: {
            home: true
          }
        }
      }
    });

    if (!integration) {
      console.log('[Webhook] Invalid token:', token);
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid webhook token', code: 'INVALID_TOKEN' }
      });
    }

    if (!integration.isActive) {
      console.log('[Webhook] Integration inactive:', integration.id);
      return res.status(403).json({
        success: false,
        error: { message: 'Integration is inactive', code: 'INTEGRATION_INACTIVE' }
      });
    }

    const circle = integration.circle;

    // 2. Parse the payload
    // Support multiple formats:
    // Format A (simple): { deviceId, state, ... }
    // Format B (HA native): { entity_id, new_state: { state }, ... }
    const deviceId = payload.deviceId || payload.entity_id;
    const newState = payload.state || payload.new_state?.state;
    const oldState = payload.oldState || payload.old_state?.state;
    const eventTime = payload.occurredAt || payload.time_fired || new Date().toISOString();

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing deviceId or entity_id', code: 'MISSING_DEVICE_ID' }
      });
    }

    // 3. Find or create sensor
    let sensor = await prisma.sensor.findFirst({
      where: {
        integrationId: integration.id,
        externalId: deviceId
      },
      include: { zone: true }
    });

    // Auto-create sensor if not exists
    if (!sensor) {
      console.log('[Webhook] Auto-creating sensor for:', deviceId);
      sensor = await prisma.sensor.create({
        data: {
          circleId: circle.id,
          integrationId: integration.id,
          externalId: deviceId,
          name: payload.friendlyName || deviceId,
          sensorType: guessSensorType(deviceId),
          status: 'ONLINE'
        },
        include: { zone: true }
      });

      // Update integration device count
      await prisma.integration.update({
        where: { id: integration.id },
        data: { deviceCount: { increment: 1 } }
      });
    }

    // 4. Pass to FusionEngine for intelligent processing
    const fusionResult = await fusionEngine.ingestSensorEvent({
      circleId: circle.id,
      sensorId: sensor.id,
      newState,
      oldState,
      occurredAt: new Date(eventTime),
      rawPayload: payload
    });

    console.log('[Webhook] Fusion result:', fusionResult);

    // 5. Update integration last sync
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() }
    });

    // 6. TODO: Send push notifications based on fusionResult.notificationLevel
    // if (fusionResult.notificationLevel !== 'NONE' && fusionResult.createdSecurityEventId) {
    //   await notificationService.sendEventNotification(fusionResult.createdSecurityEventId, fusionResult.notificationLevel);
    // }

    // 7. Return response
    if (fusionResult.suppressed) {
      return res.json({
        success: true,
        message: 'Event processed but suppressed',
        sensorEventId: fusionResult.sensorEventId,
        suppressReason: fusionResult.suppressReason,
        sensor: { id: sensor.id, name: sensor.name }
      });
    }

    if (fusionResult.createdSecurityEventId || fusionResult.updatedSecurityEventId) {
      return res.status(201).json({
        success: true,
        message: fusionResult.createdSecurityEventId ? 'Security event created' : 'Security event updated',
        sensorEventId: fusionResult.sensorEventId,
        trackId: fusionResult.trackId,
        securityEventId: fusionResult.createdSecurityEventId || fusionResult.updatedSecurityEventId,
        ruleMatched: fusionResult.ruleMatched,
        notificationLevel: fusionResult.notificationLevel,
        sensor: { id: sensor.id, name: sensor.name }
      });
    }

    // Sensor event recorded but no security event (e.g., not a trigger state)
    res.json({
      success: true,
      message: 'Sensor event recorded',
      sensorEventId: fusionResult.sensorEventId,
      sensor: { id: sensor.id, name: sensor.name }
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    next(error);
  }
});

// ============================================================================
// GET /api/webhooks/ha/:token/test - Test webhook endpoint
// ============================================================================
router.get('/ha/:token/test', async (req, res) => {
  const { token } = req.params;
  
  const integration = await prisma.integration.findUnique({
    where: { webhookToken: token },
    select: { id: true, name: true, isActive: true }
  });

  if (!integration) {
    return res.status(404).json({ success: false, message: 'Invalid token' });
  }

  res.json({
    success: true,
    message: 'Webhook endpoint is working (Phase 2 - FusionEngine)',
    integration: {
      id: integration.id,
      name: integration.name,
      isActive: integration.isActive
    }
  });
});

module.exports = router;
