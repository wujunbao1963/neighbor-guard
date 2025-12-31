// ============================================================================
// Zone Routes
// Phase 3: Zone configuration management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember, requireCanManageHome } = require('../middleware/auth');
const { ZONE_TYPES, getZoneTypesForHouseType } = require('../config/constants');

// ============================================================================
// GET /api/zones/:circleId - Get all zones for a circle
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { enabledOnly, group } = req.query;

    const where = { circleId };
    
    if (enabledOnly === 'true') {
      where.isEnabled = true;
    }
    
    if (group) {
      where.zoneGroup = group;
    }

    const zones = await prisma.zone.findMany({
      where,
      orderBy: { displayOrder: 'asc' }
    });

    // Group zones by zoneGroup
    const grouped = zones.reduce((acc, zone) => {
      if (!acc[zone.zoneGroup]) {
        acc[zone.zoneGroup] = [];
      }
      acc[zone.zoneGroup].push(zone);
      return acc;
    }, {});

    res.json({
      success: true,
      zones,
      grouped,
      counts: {
        total: zones.length,
        enabled: zones.filter(z => z.isEnabled).length,
        disabled: zones.filter(z => !z.isEnabled).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/zones/:circleId/:zoneId - Get single zone
// ============================================================================
router.get('/:circleId/:zoneId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, zoneId } = req.params;

    const zone = await prisma.zone.findFirst({
      where: { id: zoneId, circleId },
      include: {
        _count: {
          select: { events: { where: { deletedAt: null } } }
        }
      }
    });

    if (!zone) {
      throw new AppError('防区不存在', 404, 'ZONE_NOT_FOUND');
    }

    res.json({
      success: true,
      zone: {
        ...zone,
        eventCount: zone._count.events
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/zones/:circleId/:zoneId - Update zone settings
// ============================================================================
router.put('/:circleId/:zoneId', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId, zoneId } = req.params;
    const { displayName, isEnabled, displayOrder, description } = req.body;

    // Verify zone exists and belongs to circle
    const zone = await prisma.zone.findFirst({
      where: { id: zoneId, circleId }
    });

    if (!zone) {
      throw new AppError('防区不存在', 404, 'ZONE_NOT_FOUND');
    }

    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.zone.update({
      where: { id: zoneId },
      data: updateData
    });

    res.json({
      success: true,
      zone: updated
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/zones/:circleId/batch - Batch update zones
// ============================================================================
router.put('/:circleId/batch', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { zones } = req.body;

    if (!Array.isArray(zones)) {
      throw new AppError('zones必须是数组', 400, 'INVALID_INPUT');
    }

    // Verify all zones belong to circle
    const zoneIds = zones.map(z => z.id);
    const existingZones = await prisma.zone.findMany({
      where: { id: { in: zoneIds }, circleId }
    });

    if (existingZones.length !== zoneIds.length) {
      throw new AppError('部分防区不存在或不属于该圈子', 400, 'INVALID_ZONES');
    }

    // Update zones in transaction
    await prisma.$transaction(
      zones.map(zone => 
        prisma.zone.update({
          where: { id: zone.id },
          data: {
            ...(zone.displayName !== undefined && { displayName: zone.displayName }),
            ...(zone.isEnabled !== undefined && { isEnabled: zone.isEnabled }),
            ...(zone.displayOrder !== undefined && { displayOrder: zone.displayOrder }),
            ...(zone.description !== undefined && { description: zone.description })
          }
        })
      )
    );

    // Fetch updated zones
    const updatedZones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      zones: updatedZones,
      updated: zones.length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/zones/:circleId/reorder - Reorder zones
// ============================================================================
router.post('/:circleId/reorder', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { zoneIds } = req.body;

    if (!Array.isArray(zoneIds)) {
      throw new AppError('zoneIds必须是数组', 400, 'INVALID_INPUT');
    }

    // Verify all zones belong to circle
    const existingZones = await prisma.zone.findMany({
      where: { id: { in: zoneIds }, circleId }
    });

    if (existingZones.length !== zoneIds.length) {
      throw new AppError('部分防区不存在或不属于该圈子', 400, 'INVALID_ZONES');
    }

    // Update display order
    await prisma.$transaction(
      zoneIds.map((id, index) => 
        prisma.zone.update({
          where: { id },
          data: { displayOrder: index + 1 }
        })
      )
    );

    // Fetch updated zones
    const zones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      zones
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/zones/:circleId/enable-all - Enable all zones
// ============================================================================
router.post('/:circleId/enable-all', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;

    await prisma.zone.updateMany({
      where: { circleId },
      data: { isEnabled: true }
    });

    const zones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      zones,
      message: `已启用全部 ${zones.length} 个防区`
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/zones/:circleId/disable-all - Disable all zones
// ============================================================================
router.post('/:circleId/disable-all', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;

    await prisma.zone.updateMany({
      where: { circleId },
      data: { isEnabled: false }
    });

    const zones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      zones,
      message: `已禁用全部 ${zones.length} 个防区`
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/zones/:circleId/reset-defaults - Reset zones to defaults
// ============================================================================
router.post('/:circleId/reset-defaults', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;

    // Get home to find house type
    const home = await prisma.home.findUnique({
      where: { circleId }
    });

    if (!home) {
      throw new AppError('房屋信息不存在', 404, 'HOME_NOT_FOUND');
    }

    // Get zone configs (from code-based config)
    const zoneConfigs = getZoneTypesForHouseType(home.houseType);
    const configMap = new Map(zoneConfigs.map(c => [c.value, c]));

    // Reset each zone to defaults
    const zones = await prisma.zone.findMany({
      where: { circleId }
    });

    await prisma.$transaction(
      zones.map(zone => {
        const config = configMap.get(zone.zoneType);
        if (!config) return prisma.zone.update({ where: { id: zone.id }, data: {} });
        
        return prisma.zone.update({
          where: { id: zone.id },
          data: {
            displayName: config.label,
            isEnabled: config.defaultEnabled,
            displayOrder: config.displayOrder,
            description: config.description
          }
        });
      })
    );

    const updatedZones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      zones: updatedZones,
      message: '防区设置已重置为默认值'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/zones/:circleId/init - Initialize zones for a circle (if empty)
// ============================================================================
router.post('/:circleId/init', authenticate, requireCircleMember({ roles: ['OWNER', 'HOUSEHOLD'] }), async (req, res, next) => {
  try {
    const { circleId } = req.params;

    // Check if zones already exist
    const existingZones = await prisma.zone.count({
      where: { circleId }
    });

    if (existingZones > 0) {
      return res.json({
        success: true,
        message: '防区已存在，无需初始化',
        zonesCount: existingZones
      });
    }

    // Get home to determine house type
    const home = await prisma.home.findUnique({
      where: { circleId }
    });

    const houseType = home?.houseType || 'DETACHED';
    const zoneConfigs = getZoneTypesForHouseType(houseType);

    console.log(`📍 Initializing ${zoneConfigs.length} zones for circle ${circleId} (${houseType})`);

    // Create zones
    for (const config of zoneConfigs) {
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

    // Fetch created zones
    const zones = await prisma.zone.findMany({
      where: { circleId },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      message: `已创建 ${zones.length} 个防区`,
      zones
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
