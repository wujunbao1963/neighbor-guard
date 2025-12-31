// ============================================================================
// Sensor Routes
// Phase 1B: Sensor Management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember } = require('../middleware/auth');

// ============================================================================
// GET /api/sensors/:circleId - Get all sensors for a circle
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { integrationId, zoneId, isEnabled } = req.query;

    const where = { circleId };
    if (integrationId) where.integrationId = integrationId;
    if (zoneId) where.zoneId = zoneId;
    if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true';

    const sensors = await prisma.sensor.findMany({
      where,
      include: {
        zone: {
          select: { id: true, displayName: true, icon: true }
        },
        integration: {
          select: { id: true, name: true, type: true }
        }
      },
      orderBy: [{ zoneId: 'asc' }, { name: 'asc' }]
    });

    res.json({
      success: true,
      sensors: sensors.map(s => ({
        id: s.id,
        externalId: s.externalId,
        name: s.name,
        sensorType: s.sensorType,
        status: s.status,
        lastState: s.lastState,
        lastStateAt: s.lastStateAt,
        batteryLevel: s.batteryLevel,
        isEnabled: s.isEnabled,
        zone: s.zone ? {
          id: s.zone.id,
          displayName: s.zone.displayName,
          icon: s.zone.icon
        } : null,
        integration: {
          id: s.integration.id,
          name: s.integration.name,
          type: s.integration.type
        },
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/sensors/:circleId - Create new sensor mapping
// ============================================================================
router.post('/:circleId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { integrationId, externalId, name, sensorType, zoneId } = req.body;

    if (!integrationId || !externalId || !name) {
      throw new AppError('请提供集成ID、外部ID和名称', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // Verify integration belongs to this circle
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, circleId }
    });

    if (!integration) {
      throw new AppError('集成不存在', 404, 'INTEGRATION_NOT_FOUND');
    }

    // Verify zone if provided
    if (zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: zoneId, circleId }
      });
      if (!zone) {
        throw new AppError('防区不存在', 404, 'ZONE_NOT_FOUND');
      }
    }

    // Check if sensor already exists
    const existing = await prisma.sensor.findUnique({
      where: {
        integrationId_externalId: {
          integrationId,
          externalId
        }
      }
    });

    if (existing) {
      throw new AppError('该传感器已存在', 409, 'SENSOR_EXISTS');
    }

    const sensor = await prisma.sensor.create({
      data: {
        circleId,
        integrationId,
        externalId,
        name,
        sensorType: sensorType || 'OTHER',
        zoneId
      },
      include: {
        zone: {
          select: { id: true, displayName: true, icon: true }
        },
        integration: {
          select: { id: true, name: true }
        }
      }
    });

    // Update integration device count
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        deviceCount: { increment: 1 }
      }
    });

    res.status(201).json({
      success: true,
      sensor: {
        id: sensor.id,
        externalId: sensor.externalId,
        name: sensor.name,
        sensorType: sensor.sensorType,
        status: sensor.status,
        isEnabled: sensor.isEnabled,
        zone: sensor.zone ? {
          id: sensor.zone.id,
          displayName: sensor.zone.displayName,
          icon: sensor.zone.icon
        } : null,
        integration: {
          id: sensor.integration.id,
          name: sensor.integration.name
        }
      },
      message: '传感器添加成功'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/sensors/:circleId/:sensorId - Update sensor
// ============================================================================
router.put('/:circleId/:sensorId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, sensorId } = req.params;
    const { name, sensorType, zoneId, isEnabled } = req.body;

    const sensor = await prisma.sensor.findFirst({
      where: { id: sensorId, circleId }
    });

    if (!sensor) {
      throw new AppError('传感器不存在', 404, 'SENSOR_NOT_FOUND');
    }

    // Verify zone if provided
    if (zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: zoneId, circleId }
      });
      if (!zone) {
        throw new AppError('防区不存在', 404, 'ZONE_NOT_FOUND');
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (sensorType !== undefined) updateData.sensorType = sensorType;
    if (zoneId !== undefined) updateData.zoneId = zoneId;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

    const updated = await prisma.sensor.update({
      where: { id: sensorId },
      data: updateData,
      include: {
        zone: {
          select: { id: true, displayName: true, icon: true }
        }
      }
    });

    res.json({
      success: true,
      sensor: {
        id: updated.id,
        externalId: updated.externalId,
        name: updated.name,
        sensorType: updated.sensorType,
        status: updated.status,
        isEnabled: updated.isEnabled,
        zone: updated.zone ? {
          id: updated.zone.id,
          displayName: updated.zone.displayName,
          icon: updated.zone.icon
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/sensors/:circleId/:sensorId - Delete sensor
// ============================================================================
router.delete('/:circleId/:sensorId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, sensorId } = req.params;

    const sensor = await prisma.sensor.findFirst({
      where: { id: sensorId, circleId }
    });

    if (!sensor) {
      throw new AppError('传感器不存在', 404, 'SENSOR_NOT_FOUND');
    }

    await prisma.sensor.delete({
      where: { id: sensorId }
    });

    // Update integration device count
    await prisma.integration.update({
      where: { id: sensor.integrationId },
      data: {
        deviceCount: { decrement: 1 }
      }
    });

    res.json({
      success: true,
      message: '传感器已删除'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
