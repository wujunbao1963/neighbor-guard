// ============================================================================
// Config Routes - Zone Types and Event Types
// Now using code-based configuration (no database dependency)
// ============================================================================

const express = require('express');
const router = express.Router();
const { ZONE_TYPES, EVENT_TYPES, HOUSE_TYPES, MEMBER_ROLES } = require('../config/constants');

// ============================================================================
// GET /api/config/zones - Get all zone type configurations
// ============================================================================
router.get('/zones', async (req, res, next) => {
  try {
    const { houseType } = req.query;

    let zoneTypes = [...ZONE_TYPES];

    // Filter by house type if provided
    if (houseType) {
      zoneTypes = zoneTypes.filter(z => 
        z.supportedHouseTypes.includes(houseType.toUpperCase())
      );
    }

    // Sort by display order
    zoneTypes.sort((a, b) => a.displayOrder - b.displayOrder);

    // Group by zone group
    const grouped = zoneTypes.reduce((acc, zone) => {
      if (!acc[zone.zoneGroup]) {
        acc[zone.zoneGroup] = [];
      }
      acc[zone.zoneGroup].push(zone);
      return acc;
    }, {});

    res.json({
      success: true,
      zoneTypes,
      grouped,
      groups: {
        front: { label: '前区', icon: '🏡', description: '房屋正面区域' },
        side: { label: '侧区', icon: '↔️', description: '房屋侧面区域' },
        back: { label: '后区', icon: '🌲', description: '房屋背面区域' },
        garage: { label: '车库区', icon: '🚗', description: '车库及车道' },
        special: { label: '特殊区域', icon: '⭐', description: '公寓/特殊位置' }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/event-types - Get all event type configurations
// ============================================================================
router.get('/event-types', async (req, res, next) => {
  try {
    res.json({
      success: true,
      eventTypes: EVENT_TYPES.map(et => ({
        value: et.value,
        label: et.label,
        labelEn: et.labelEn,
        icon: et.icon,
        severity: et.severity,
        description: et.description,
        descriptionEn: et.descriptionEn,
        allowedZones: et.allowedZones
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/event-zone-whitelist - Get event type to zone whitelist
// ============================================================================
router.get('/event-zone-whitelist', async (req, res, next) => {
  try {
    const whitelist = EVENT_TYPES.reduce((acc, et) => {
      acc[et.value] = et.allowedZones;
      return acc;
    }, {});

    res.json({
      success: true,
      whitelist
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/house-types - Get house type options
// ============================================================================
router.get('/house-types', async (req, res, next) => {
  try {
    res.json({
      success: true,
      houseTypes: HOUSE_TYPES
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/severities - Get severity options
// ============================================================================
router.get('/severities', async (req, res, next) => {
  try {
    res.json({
      success: true,
      severities: [
        { value: 'HIGH', label: '高风险', labelEn: 'High', color: '#ef4444', icon: '🚨' },
        { value: 'MEDIUM', label: '中风险', labelEn: 'Medium', color: '#f59e0b', icon: '⚠️' },
        { value: 'LOW', label: '低风险', labelEn: 'Low', color: '#22c55e', icon: '📋' }
      ]
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/statuses - Get event status options
// ============================================================================
router.get('/statuses', async (req, res, next) => {
  try {
    res.json({
      success: true,
      statuses: [
        { value: 'OPEN', label: '待处理', labelEn: 'Open', icon: '🔵' },
        { value: 'ACKED', label: '已确认', labelEn: 'Acknowledged', icon: '✓' },
        { value: 'WATCHING', label: '观察中', labelEn: 'Watching', icon: '👁️' },
        { value: 'RESOLVED_OK', label: '已安全解决', labelEn: 'Resolved', icon: '✅' },
        { value: 'RESOLVED_WARNING', label: '有损失', labelEn: 'Warning', icon: '⚠️' },
        { value: 'ESCALATED', label: '已报警', labelEn: 'Escalated', icon: '🚨' },
        { value: 'FALSE_ALARM', label: '误报', labelEn: 'False Alarm', icon: 'ℹ️' }
      ]
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/config/roles - Get member role options
// ============================================================================
router.get('/roles', async (req, res, next) => {
  try {
    res.json({
      success: true,
      roles: MEMBER_ROLES.map(r => ({
        value: r.value,
        label: r.label,
        labelEn: r.labelEn,
        canEdit: r.canEdit,
        canInvite: r.canInvite
      }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
