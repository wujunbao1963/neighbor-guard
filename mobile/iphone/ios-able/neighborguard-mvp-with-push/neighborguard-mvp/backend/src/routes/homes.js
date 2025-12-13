// ============================================================================
// Home Routes
// Phase 3: Home settings management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember, requireCanManageHome } = require('../middleware/auth');
const { getZoneTypesForHouseType } = require('../config/constants');

// ============================================================================
// GET /api/homes/:circleId - Get home details
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;

    const home = await prisma.home.findUnique({
      where: { circleId }
    });

    if (!home) {
      throw new AppError('房屋信息不存在', 404, 'HOME_NOT_FOUND');
    }

    res.json({
      success: true,
      home
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/homes/:circleId - Update home settings
// ============================================================================
router.put('/:circleId', authenticate, requireCanManageHome, async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const {
      displayName,
      country,
      region,
      city,
      postalCode,
      addressLine1,
      addressLine2,
      houseType,
      hasDriveway,
      hasBackYard,
      hasBackAlley,
      occupancyPattern
    } = req.body;

    // Get current home
    const currentHome = await prisma.home.findUnique({
      where: { circleId }
    });

    if (!currentHome) {
      throw new AppError('房屋信息不存在', 404, 'HOME_NOT_FOUND');
    }

    // Check if house type is changing
    const houseTypeChanging = houseType && houseType !== currentHome.houseType;

    // Build update data for Home
    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (country !== undefined) updateData.country = country;
    if (region !== undefined) updateData.region = region;
    if (city !== undefined) updateData.city = city;
    if (postalCode !== undefined) updateData.postalCode = postalCode;
    if (addressLine1 !== undefined) updateData.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) updateData.addressLine2 = addressLine2;
    if (houseType !== undefined) updateData.houseType = houseType;
    if (hasDriveway !== undefined) updateData.hasDriveway = hasDriveway;
    if (hasBackYard !== undefined) updateData.hasBackYard = hasBackYard;
    if (hasBackAlley !== undefined) updateData.hasBackAlley = hasBackAlley;
    if (occupancyPattern !== undefined) updateData.occupancyPattern = occupancyPattern;

    let zonesUpdated = false;
    let result;

    if (houseTypeChanging) {
      // Update home and reinitialize zones in transaction
      result = await prisma.$transaction(async (tx) => {
        // Update home
        const home = await tx.home.update({
          where: { circleId },
          data: updateData
        });

        // Also update Circle displayName if home displayName changed
        if (displayName !== undefined) {
          await tx.circle.update({
            where: { id: circleId },
            data: { displayName }
          });
        }

        // Reinitialize zones
        const zoneResult = await reinitializeZones(tx, circleId, houseType);
        
        return { home, zoneResult };
      });
      zonesUpdated = true;
    } else {
      // Just update home and circle
      result = await prisma.$transaction(async (tx) => {
        const home = await tx.home.update({
          where: { circleId },
          data: updateData
        });

        // Also update Circle displayName if home displayName changed
        if (displayName !== undefined) {
          await tx.circle.update({
            where: { id: circleId },
            data: { displayName }
          });
        }

        return { home };
      });
    }

    res.json({
      success: true,
      home: result.home,
      zonesUpdated,
      zoneInfo: zonesUpdated ? result.zoneResult : null
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Helper: Reinitialize zones when house type changes
// ============================================================================
async function reinitializeZones(tx, circleId, newHouseType) {
  // Get current zones
  const currentZones = await tx.zone.findMany({
    where: { circleId }
  });

  // Get zone configs for new house type (from code-based config)
  const newZoneConfigs = getZoneTypesForHouseType(newHouseType);

  const newZoneTypes = new Set(newZoneConfigs.map(c => c.value));
  const currentZoneMap = new Map(currentZones.map(z => [z.zoneType, z]));

  let kept = 0;
  let added = 0;
  let removed = 0;

  // Remove zones that are not supported by new house type
  for (const zone of currentZones) {
    if (!newZoneTypes.has(zone.zoneType)) {
      await tx.zone.delete({ where: { id: zone.id } });
      removed++;
    }
  }

  // Add or update zones for new house type
  for (const config of newZoneConfigs) {
    const existing = currentZoneMap.get(config.value);
    
    if (existing) {
      // Keep existing zone with its settings
      kept++;
    } else {
      // Add new zone
      await tx.zone.create({
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
      added++;
    }
  }

  return { kept, added, removed, total: newZoneConfigs.length };
}

module.exports = router;
