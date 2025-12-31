// ============================================================================
// Device Routes - Push notification token management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// POST /api/devices/register - Register device token
// ============================================================================
router.post('/register', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token, platform = 'IOS', deviceName, appVersion } = req.body;
    
    console.log(`\n📱 Device Registration Request:`);
    console.log(`   userId: ${userId}`);
    console.log(`   token: ${token ? token.substring(0, 20) + '...' : 'MISSING'}`);
    console.log(`   platform: ${platform}`);
    console.log(`   deviceName: ${deviceName}`);
    console.log(`   appVersion: ${appVersion}`);
    
    if (!token) {
      console.log(`   ❌ Token missing, rejecting`);
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Device token is required' }
      });
    }
    
    // Upsert the device token
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        deviceName,
        appVersion,
        isActive: true,
        lastUsedAt: new Date()
      },
      create: {
        userId,
        token,
        platform,
        deviceName,
        appVersion,
        isActive: true
      }
    });
    
    console.log(`   ✅ Device registered: ${deviceToken.id}`);
    
    // Count total tokens for this user
    const tokenCount = await prisma.deviceToken.count({
      where: { userId, isActive: true }
    });
    console.log(`   Total active tokens for user: ${tokenCount}\n`);
    
    res.json({
      success: true,
      message: 'Device token registered',
      deviceId: deviceToken.id
    });
  } catch (error) {
    console.error(`   ❌ Registration error:`, error.message);
    next(error);
  }
});

// ============================================================================
// POST /api/devices/unregister - Unregister device token
// ============================================================================
router.post('/unregister', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Device token is required' }
      });
    }
    
    // Mark token as inactive
    const result = await prisma.deviceToken.updateMany({
      where: {
        token,
        userId
      },
      data: {
        isActive: false
      }
    });
    
    if (result.count > 0) {
      console.log(`✅ Device unregistered for user ${userId}`);
    }
    
    res.json({
      success: true,
      message: 'Device token unregistered'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/devices/debug - List all registered tokens (for debugging)
// ============================================================================
router.get('/debug', authenticate, async (req, res, next) => {
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: { displayName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const summary = tokens.map(t => ({
      user: t.user.displayName,
      email: t.user.email,
      token: t.token.substring(0, 20) + '...',
      platform: t.platform,
      deviceName: t.deviceName,
      lastUsed: t.lastUsedAt,
      created: t.createdAt
    }));
    
    console.log(`📱 Debug: ${tokens.length} active device tokens`);
    
    res.json({
      success: true,
      count: tokens.length,
      tokens: summary
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
