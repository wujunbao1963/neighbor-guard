// ============================================================================
// Integration Routes
// Phase 1B: Home Assistant Integration Management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember } = require('../middleware/auth');
const crypto = require('crypto');

// ============================================================================
// GET /api/integrations/:circleId - Get all integrations for a circle
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;

    const integrations = await prisma.integration.findMany({
      where: { circleId },
      include: {
        _count: {
          select: { sensors: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      integrations: integrations.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        webhookToken: i.webhookToken,
        webhookUrl: `${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/webhooks/ha/${i.webhookToken}`,
        baseUrl: i.baseUrl,
        isActive: i.isActive,
        lastSyncAt: i.lastSyncAt,
        deviceCount: i._count.sensors,
        createdAt: i.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/integrations/:circleId - Create new integration
// ============================================================================
router.post('/:circleId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { name, type = 'HOME_ASSISTANT', baseUrl, accessToken } = req.body;

    if (!name) {
      throw new AppError('请提供集成名称', 400, 'NAME_REQUIRED');
    }

    const integration = await prisma.integration.create({
      data: {
        circleId,
        name,
        type,
        baseUrl,
        accessToken,
        webhookToken: crypto.randomUUID()
      }
    });

    res.status(201).json({
      success: true,
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        webhookToken: integration.webhookToken,
        webhookUrl: `${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/webhooks/ha/${integration.webhookToken}`,
        baseUrl: integration.baseUrl,
        isActive: integration.isActive,
        createdAt: integration.createdAt
      },
      message: '集成创建成功'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/integrations/:circleId/:integrationId - Update integration
// ============================================================================
router.put('/:circleId/:integrationId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, integrationId } = req.params;
    const { name, baseUrl, accessToken, isActive } = req.body;

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, circleId }
    });

    if (!integration) {
      throw new AppError('集成不存在', 404, 'INTEGRATION_NOT_FOUND');
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (accessToken !== undefined) updateData.accessToken = accessToken;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.integration.update({
      where: { id: integrationId },
      data: updateData
    });

    res.json({
      success: true,
      integration: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        webhookToken: updated.webhookToken,
        baseUrl: updated.baseUrl,
        isActive: updated.isActive
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/integrations/:circleId/:integrationId - Delete integration
// ============================================================================
router.delete('/:circleId/:integrationId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, integrationId } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, circleId }
    });

    if (!integration) {
      throw new AppError('集成不存在', 404, 'INTEGRATION_NOT_FOUND');
    }

    await prisma.integration.delete({
      where: { id: integrationId }
    });

    res.json({
      success: true,
      message: '集成已删除'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/integrations/:circleId/:integrationId/regenerate-token
// ============================================================================
router.post('/:circleId/:integrationId/regenerate-token', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, integrationId } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, circleId }
    });

    if (!integration) {
      throw new AppError('集成不存在', 404, 'INTEGRATION_NOT_FOUND');
    }

    const newToken = crypto.randomUUID();

    const updated = await prisma.integration.update({
      where: { id: integrationId },
      data: { webhookToken: newToken }
    });

    res.json({
      success: true,
      webhookToken: updated.webhookToken,
      webhookUrl: `${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/webhooks/ha/${updated.webhookToken}`,
      message: 'Webhook Token 已重新生成'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
