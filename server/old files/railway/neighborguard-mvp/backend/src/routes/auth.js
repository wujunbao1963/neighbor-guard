// ============================================================================
// Authentication Routes
// Phase 2: Email verification code login
// ============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { ZONE_TYPES, getZoneTypesForHouseType } = require('../config/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const CODE_EXPIRES_MINUTES = parseInt(process.env.AUTH_CODE_EXPIRES_MINUTES) || 10;
const CODE_MAX_ATTEMPTS = parseInt(process.env.AUTH_CODE_MAX_ATTEMPTS) || 5;

// Fixed test code for development/testing (set in .env or here)
const TEST_MODE = process.env.AUTH_TEST_MODE === 'true';
const TEST_CODE = process.env.AUTH_TEST_CODE || '587585';

// ============================================================================
// POST /api/auth/request-code - Request verification code
// ============================================================================
router.post('/request-code', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AppError('邮箱格式不正确', 400, 'INVALID_EMAIL');
    }

    // No whitelist check - anyone can register!
    // (Whitelist is now optional, only used for notes/tracking)

    // Use fixed test code or generate random code
    const code = TEST_MODE ? TEST_CODE : Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_EXPIRES_MINUTES * 60 * 1000);

    // Invalidate previous codes
    await prisma.authCode.updateMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { expiresAt: new Date() }
    });

    // Create new code
    await prisma.authCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        expiresAt
      }
    });

    // Log code info
    if (TEST_MODE) {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📧 验证码 (测试模式 - 固定验证码)                               ║
║                                                               ║
║  邮箱: ${normalizedEmail.padEnd(50)}║
║  验证码: ${TEST_CODE}                                        ║
║  有效期: ${CODE_EXPIRES_MINUTES} 分钟                                            ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    } else if (process.env.DEV_SKIP_EMAIL === 'true') {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📧 验证码 (开发模式)                                           ║
║                                                               ║
║  邮箱: ${normalizedEmail.padEnd(50)}║
║  验证码: ${code}                                               ║
║  有效期: ${CODE_EXPIRES_MINUTES} 分钟                                            ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    } else {
      // TODO: Send actual email in production
      console.log(`Would send email to ${normalizedEmail} with code ${code}`);
    }

    res.json({
      success: true,
      message: '验证码已发送',
      expiresIn: CODE_EXPIRES_MINUTES * 60
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/login - Verify code and login
// ============================================================================
router.post('/login', async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      throw new AppError('请提供邮箱和验证码', 400, 'MISSING_CREDENTIALS');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find valid code
    const authCode = await prisma.authCode.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!authCode) {
      throw new AppError('验证码无效或已过期', 401, 'CODE_INVALID');
    }

    // Check attempts
    if (authCode.attempts >= CODE_MAX_ATTEMPTS) {
      throw new AppError('验证码尝试次数过多，请重新获取', 401, 'TOO_MANY_ATTEMPTS');
    }

    // Verify code
    const isValid = await bcrypt.compare(code, authCode.codeHash);
    
    if (!isValid) {
      // Increment attempts
      await prisma.authCode.update({
        where: { id: authCode.id },
        data: { attempts: { increment: 1 } }
      });
      throw new AppError('验证码错误', 401, 'CODE_WRONG');
    }

    // Mark code as used
    await prisma.authCode.update({
      where: { id: authCode.id },
      data: { usedAt: new Date() }
    });

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    const isNewUser = !user;

    if (!user) {
      // Create new user - use email prefix as display name
      const displayName = normalizedEmail.split('@')[0];

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          displayName,
          emailVerified: true,
          isActive: true
        }
      });
      
      console.log(`✅ 新用户注册: ${normalizedEmail}`);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES }
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    
    // Parse refresh expiry
    const refreshDays = parseInt(JWT_REFRESH_EXPIRES) || 7;
    const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    // Save refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
        deviceInfo: req.headers['user-agent'] || 'unknown'
      }
    });

    // Get user's circles
    const memberships = await prisma.circleMember.findMany({
      where: {
        userId: user.id,
        leftAt: null
      },
      include: {
        circle: {
          include: {
            home: true
          }
        }
      }
    });

    const circles = memberships.map(m => ({
      id: m.circle.id,
      displayName: m.circle.displayName,
      role: m.role,
      home: m.circle.home ? {
        displayName: m.circle.home.displayName,
        houseType: m.circle.home.houseType
      } : null
    }));

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        phone: user.phone
      },
      circles,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: JWT_ACCESS_EXPIRES
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/refresh - Refresh access token
// ============================================================================
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('请提供刷新令牌', 400, 'REFRESH_TOKEN_REQUIRED');
    }

    // Find valid refresh tokens for comparison
    const tokens = await prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    // Find matching token
    let validToken = null;
    for (const token of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isMatch) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      throw new AppError('刷新令牌无效或已过期', 401, 'REFRESH_TOKEN_INVALID');
    }

    if (!validToken.user.isActive || validToken.user.deletedAt) {
      throw new AppError('用户已被禁用', 401, 'USER_DISABLED');
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: validToken.user.id, email: validToken.user.email },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES }
    );

    res.json({
      success: true,
      accessToken,
      expiresIn: JWT_ACCESS_EXPIRES
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/logout - Revoke refresh token
// ============================================================================
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Find and revoke the token
      const tokens = await prisma.refreshToken.findMany({
        where: {
          revokedAt: null
        }
      });

      for (const token of tokens) {
        const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
        if (isMatch) {
          await prisma.refreshToken.update({
            where: { id: token.id },
            data: { revokedAt: new Date() }
          });
          break;
        }
      }
    }

    res.json({
      success: true,
      message: '已退出登录'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/auth/me - Get current user
// ============================================================================
router.get('/me', authenticate, async (req, res, next) => {
  try {
    // Get user's circles
    const memberships = await prisma.circleMember.findMany({
      where: {
        userId: req.user.id,
        leftAt: null
      },
      include: {
        circle: {
          include: {
            home: true,
            _count: {
              select: {
                members: { where: { leftAt: null } },
                events: { where: { deletedAt: null } }
              }
            }
          }
        }
      }
    });

    const circles = memberships.map(m => ({
      id: m.circle.id,
      displayName: m.circle.displayName,
      role: m.role,
      memberDisplayName: m.displayName,
      home: m.circle.home ? {
        id: m.circle.home.id,
        displayName: m.circle.home.displayName,
        houseType: m.circle.home.houseType,
        city: m.circle.home.city
      } : null,
      memberCount: m.circle._count.members,
      eventCount: m.circle._count.events
    }));

    res.json({
      success: true,
      user: req.user,
      circles
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/auth/me - Update current user profile
// ============================================================================
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { displayName, phone, avatarUrl } = req.body;

    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        phone: true
      }
    });

    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ADMIN APIs - Protected by user authentication + admin role
// ============================================================================

// Default super admin email (set in .env)
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@neighborguard.app';

// Middleware to verify admin role
const verifyAdmin = async (req, res, next) => {
  try {
    // First check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' }
      });
    }

    // Get user with admin role
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, adminRole: true }
    });

    if (!user || !user.adminRole) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '需要管理员权限' }
      });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to verify super admin role
const verifySuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, adminRole: true }
    });

    if (!user || user.adminRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '需要超级管理员权限' }
      });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// GET /api/auth/admin/me - Get current admin info
// ============================================================================
router.get('/admin/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true, 
        email: true, 
        displayName: true,
        adminRole: true 
      }
    });

    if (!user || !user.adminRole) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '不是管理员' }
      });
    }

    res.json({
      success: true,
      admin: user
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/add-homeowner - Add whitelist + auto create homeowner
// ============================================================================
router.post('/admin/add-homeowner', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { email, displayName, homeName, houseType, city } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        circleMemberships: {
          where: { role: 'OWNER' }
        }
      }
    });

    // If user exists and already owns a circle/home, reject
    if (existingUser && existingUser.circleMemberships.length > 0) {
      throw new AppError('该用户已是屋主', 400, 'ALREADY_HOMEOWNER');
    }

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Add to whitelist if not exists
      const existingWhitelist = await tx.emailWhitelist.findUnique({
        where: { email: normalizedEmail }
      });
      
      let whitelist;
      if (!existingWhitelist) {
        whitelist = await tx.emailWhitelist.create({
          data: {
            email: normalizedEmail,
            isActive: true
          }
        });
      } else {
        whitelist = existingWhitelist;
        // Ensure it's active
        if (!existingWhitelist.isActive) {
          await tx.emailWhitelist.update({
            where: { email: normalizedEmail },
            data: { isActive: true }
          });
        }
      }

      // 2. Create user or use existing
      let user;
      if (existingUser) {
        user = existingUser;
        // Update display name if provided
        if (displayName && displayName !== existingUser.displayName) {
          user = await tx.user.update({
            where: { id: existingUser.id },
            data: { displayName }
          });
        }
      } else {
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            displayName: displayName || normalizedEmail.split('@')[0],
            isActive: true
          }
        });
      }

      const homeDisplayName = homeName || `${user.displayName}的家`;

      // 3. Create circle
      const circle = await tx.circle.create({
        data: {
          displayName: homeDisplayName,
          ownerId: user.id
        }
      });

      // 4. Create home
      const home = await tx.home.create({
        data: {
          displayName: homeDisplayName,
          houseType: houseType || 'DETACHED',
          city: city || '',
          circleId: circle.id
        }
      });

      // 5. Add user as OWNER member
      const membership = await tx.circleMember.create({
        data: {
          circleId: circle.id,
          userId: user.id,
          role: 'OWNER'
        }
      });

      // 6. Create default zones based on house type (using code-based config)
      const zoneConfigs = getZoneTypesForHouseType(houseType || 'DETACHED');

      for (const config of zoneConfigs) {
        await tx.zone.create({
          data: {
            circleId: circle.id,
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

      return { whitelist, user, home, circle, membership };
    });

    console.log(`✅ 新屋主已创建: ${normalizedEmail}`);

    res.json({
      success: true,
      message: '屋主创建成功',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName
        },
        home: {
          id: result.home.id,
          displayName: result.home.displayName
        },
        circle: {
          id: result.circle.id,
          displayName: result.circle.displayName
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/add-whitelist - Add email to whitelist only (no home)
// ============================================================================
router.post('/admin/add-whitelist', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { email, notes } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already exists
    const existing = await prisma.emailWhitelist.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      throw new AppError('该邮箱已在白名单中', 400, 'EMAIL_EXISTS');
    }

    const whitelist = await prisma.emailWhitelist.create({
      data: {
        email: normalizedEmail,
        notes: notes || null,
        isActive: true
      }
    });

    res.json({
      success: true,
      message: '已添加到白名单',
      whitelist: {
        email: whitelist.email,
        isActive: whitelist.isActive,
        createdAt: whitelist.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/auth/admin/whitelist - List all whitelist emails
// ============================================================================
router.get('/admin/whitelist', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const whitelist = await prisma.emailWhitelist.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const whitelistWithUsers = await Promise.all(
      whitelist.map(async (w) => {
        const user = await prisma.user.findUnique({
          where: { email: w.email },
          select: {
            id: true,
            displayName: true,
            isActive: true,
            adminRole: true
          }
        });
        return {
          email: w.email,
          notes: w.notes,
          isActive: w.isActive,
          createdAt: w.createdAt,
          user: user || null
        };
      })
    );

    res.json({
      success: true,
      whitelist: whitelistWithUsers
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/auth/admin/whitelist/:email - Remove from whitelist
// ============================================================================
router.delete('/admin/whitelist/:email', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    // Check if this is super admin email - cannot delete
    if (email === SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new AppError('不能删除超级管理员', 403, 'CANNOT_DELETE_SUPER_ADMIN');
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (user?.adminRole === 'SUPER_ADMIN') {
      throw new AppError('不能删除超级管理员', 403, 'CANNOT_DELETE_SUPER_ADMIN');
    }

    await prisma.emailWhitelist.delete({
      where: { email }
    });

    res.json({
      success: true,
      message: '已从白名单移除'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '邮箱不在白名单中' }
      });
    }
    next(error);
  }
});

// ============================================================================
// GET /api/auth/admin/admins - List all admins (super admin only)
// ============================================================================
router.get('/admin/admins', authenticate, verifySuperAdmin, async (req, res, next) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        adminRole: { not: null }
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      admins
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/set-admin - Set user as admin (super admin only)
// ============================================================================
router.post('/admin/set-admin', authenticate, verifySuperAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    if (user.adminRole === 'SUPER_ADMIN') {
      throw new AppError('该用户已是超级管理员', 400, 'ALREADY_SUPER_ADMIN');
    }

    if (user.adminRole === 'ADMIN') {
      throw new AppError('该用户已是管理员', 400, 'ALREADY_ADMIN');
    }

    const updatedUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { adminRole: 'ADMIN' },
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true
      }
    });

    res.json({
      success: true,
      message: '已设置为管理员',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/remove-admin - Remove admin role (super admin only)
// ============================================================================
router.post('/admin/remove-admin', authenticate, verifySuperAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    if (user.adminRole === 'SUPER_ADMIN') {
      throw new AppError('不能移除超级管理员权限', 403, 'CANNOT_REMOVE_SUPER_ADMIN');
    }

    if (!user.adminRole) {
      throw new AppError('该用户不是管理员', 400, 'NOT_ADMIN');
    }

    const updatedUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { adminRole: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true
      }
    });

    res.json({
      success: true,
      message: '已移除管理员权限',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/init-super-admin - Initialize super admin (one-time setup)
// ============================================================================
router.post('/admin/init-super-admin', async (req, res, next) => {
  try {
    // Check if super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { adminRole: 'SUPER_ADMIN' }
    });

    if (existingSuperAdmin) {
      throw new AppError('超级管理员已存在', 400, 'SUPER_ADMIN_EXISTS');
    }

    const normalizedEmail = SUPER_ADMIN_EMAIL.toLowerCase().trim();

    // Add to whitelist if not exists
    await prisma.emailWhitelist.upsert({
      where: { email: normalizedEmail },
      update: { isActive: true },
      create: { email: normalizedEmail, isActive: true, notes: '超级管理员' }
    });

    // Create or update user as super admin
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: { adminRole: 'SUPER_ADMIN' },
      create: {
        email: normalizedEmail,
        displayName: 'Super Admin',
        adminRole: 'SUPER_ADMIN',
        isActive: true
      }
    });

    console.log(`✅ 超级管理员已初始化: ${normalizedEmail}`);

    res.json({
      success: true,
      message: '超级管理员初始化成功',
      admin: {
        email: user.email,
        displayName: user.displayName,
        adminRole: user.adminRole
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/whitelist - Add email to whitelist
// ============================================================================
router.post('/admin/whitelist', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { email, notes } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already exists
    const existing = await prisma.emailWhitelist.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      throw new AppError('该邮箱已在白名单中', 400, 'EMAIL_EXISTS');
    }

    const whitelist = await prisma.emailWhitelist.create({
      data: {
        email: normalizedEmail,
        notes: notes || null,
        isActive: true
      }
    });

    res.json({
      success: true,
      message: '已添加到白名单',
      whitelist: {
        email: whitelist.email,
        notes: whitelist.notes,
        isActive: whitelist.isActive,
        createdAt: whitelist.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/admins - Add admin (super admin only)
// ============================================================================
router.post('/admin/admins', authenticate, verifySuperAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('请提供用户ID或邮箱', 400, 'EMAIL_REQUIRED');
    }

    // Find user by email or id
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: email },
          { email: email.toLowerCase().trim() }
        ]
      }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    if (user.adminRole === 'SUPER_ADMIN') {
      throw new AppError('该用户已是超级管理员', 400, 'ALREADY_SUPER_ADMIN');
    }

    if (user.adminRole === 'ADMIN') {
      throw new AppError('该用户已是管理员', 400, 'ALREADY_ADMIN');
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { adminRole: 'ADMIN' },
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true
      }
    });

    res.json({
      success: true,
      message: '已设置为管理员',
      admin: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/auth/admin/admins/:userId - Remove admin (super admin only)
// ============================================================================
router.delete('/admin/admins/:userId', authenticate, verifySuperAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    if (user.adminRole === 'SUPER_ADMIN') {
      throw new AppError('不能移除超级管理员权限', 403, 'CANNOT_REMOVE_SUPER_ADMIN');
    }

    if (!user.adminRole) {
      throw new AppError('该用户不是管理员', 400, 'NOT_ADMIN');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { adminRole: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true
      }
    });

    res.json({
      success: true,
      message: '已移除管理员权限',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/auth/admin/users - Get all users (admin can view)
// ============================================================================
router.get('/admin/users', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        adminRole: true,
        isActive: true,
        createdAt: true,
        circleMemberships: {
          where: { leftAt: null },
          select: {
            role: true,
            circle: {
              select: {
                id: true,
                displayName: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to include ownership info
    const usersWithInfo = users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      adminRole: u.adminRole,
      isActive: u.isActive,
      createdAt: u.createdAt,
      isOwner: u.circleMemberships.some(m => m.role === 'OWNER'),
      ownedCircles: u.circleMemberships
        .filter(m => m.role === 'OWNER')
        .map(m => ({ id: m.circle.id, displayName: m.circle.displayName })),
      memberOf: u.circleMemberships
        .filter(m => m.role !== 'OWNER')
        .map(m => ({ id: m.circle.id, displayName: m.circle.displayName, role: m.role }))
    }));

    res.json({
      success: true,
      users: usersWithInfo
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/make-homeowner - Make a user become homeowner (create home + circle)
// ============================================================================
router.post('/admin/make-homeowner', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { userId, homeName, houseType, city } = req.body;

    if (!userId) {
      throw new AppError('请提供用户ID', 400, 'USER_ID_REQUIRED');
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        circleMemberships: {
          where: { role: 'OWNER', leftAt: null }
        }
      }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    // Check if already an owner
    if (user.circleMemberships.length > 0) {
      throw new AppError('该用户已是屋主', 400, 'ALREADY_HOMEOWNER');
    }

    // Create home + circle in transaction
    const result = await prisma.$transaction(async (tx) => {
      const homeDisplayName = homeName || `${user.displayName}的家`;

      // Create circle
      const circle = await tx.circle.create({
        data: {
          displayName: homeDisplayName,
          ownerId: user.id
        }
      });

      // Create home
      const home = await tx.home.create({
        data: {
          displayName: homeDisplayName,
          houseType: houseType || 'DETACHED',
          city: city || '',
          circleId: circle.id
        }
      });

      // Add user as OWNER member
      await tx.circleMember.create({
        data: {
          circleId: circle.id,
          userId: user.id,
          role: 'OWNER'
        }
      });

      // Create zones based on house type (using code-based config)
      const zoneConfigs = getZoneTypesForHouseType(houseType || 'DETACHED');
      console.log(`📍 Creating ${zoneConfigs.length} zones for house type: ${houseType || 'DETACHED'}`);

      for (const config of zoneConfigs) {
        const zone = await tx.zone.create({
          data: {
            circleId: circle.id,
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
        console.log(`   ✅ Zone created: ${zone.displayName} (${zone.zoneType})`);
      }

      return { circle, home };
    });

    console.log(`✅ 用户 ${user.email} 已设为屋主`);

    res.json({
      success: true,
      message: '已设为屋主',
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName
        },
        circle: {
          id: result.circle.id,
          displayName: result.circle.displayName
        },
        home: {
          id: result.home.id,
          displayName: result.home.displayName
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/auth/admin/circles - Get all circles (admin only)
// ============================================================================
router.get('/admin/circles', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const circles = await prisma.circle.findMany({
      where: { deletedAt: null },
      include: {
        home: {
          select: { displayName: true, city: true }
        },
        owner: {
          select: { displayName: true, email: true }
        },
        _count: {
          select: { members: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      circles: circles.map(c => ({
        id: c.id,
        displayName: c.displayName,
        home: c.home,
        owner: c.owner,
        memberCount: c._count.members
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/auth/admin/add-member - Add user to a circle as member (admin only)
// ============================================================================
router.post('/admin/add-member', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { email, circleId, role, displayName } = req.body;

    if (!email || !circleId || !role) {
      throw new AppError('请提供邮箱、圈子ID和角色', 400, 'MISSING_FIELDS');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate role
    const validRoles = ['HOUSEHOLD', 'NEIGHBOR', 'RELATIVE', 'OBSERVER'];
    if (!validRoles.includes(role)) {
      throw new AppError('无效的角色', 400, 'INVALID_ROLE');
    }

    // Check circle exists
    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      include: { home: true }
    });

    if (!circle || circle.deletedAt) {
      throw new AppError('圈子不存在', 404, 'CIRCLE_NOT_FOUND');
    }

    // Create in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Add to whitelist if not exists
      const existingWhitelist = await tx.emailWhitelist.findUnique({
        where: { email: normalizedEmail }
      });
      
      if (!existingWhitelist) {
        await tx.emailWhitelist.create({
          data: {
            email: normalizedEmail,
            isActive: true,
            notes: `Added as ${role} to ${circle.displayName}`
          }
        });
      }

      // 2. Create user if not exists
      let user = await tx.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            displayName: displayName || normalizedEmail.split('@')[0],
            isActive: true
          }
        });
      }

      // 3. Check if already member
      const existingMember = await tx.circleMember.findFirst({
        where: {
          circleId,
          userId: user.id,
          leftAt: null
        }
      });

      if (existingMember) {
        throw new AppError('该用户已是圈子成员', 400, 'ALREADY_MEMBER');
      }

      // 4. Add as member
      const membership = await tx.circleMember.create({
        data: {
          circleId,
          userId: user.id,
          role,
          displayName: displayName || user.displayName
        }
      });

      return { user, membership };
    });

    res.json({
      success: true,
      message: '成员添加成功',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName
        },
        membership: {
          role: result.membership.role,
          circleName: circle.displayName
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/auth/admin/users/:userId - Delete a user (admin only)
// ============================================================================
router.delete('/admin/users/:userId', authenticate, verifyAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        circleMemberships: {
          where: { leftAt: null },
          include: {
            circle: true
          }
        }
      }
    });

    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    // Cannot delete super admin
    if (user.adminRole === 'SUPER_ADMIN') {
      throw new AppError('不能删除超级管理员', 403, 'CANNOT_DELETE_SUPER_ADMIN');
    }

    // Cannot delete yourself
    if (user.id === req.user.id) {
      throw new AppError('不能删除自己', 403, 'CANNOT_DELETE_SELF');
    }

    // Check if user owns any circles
    const ownedCircles = user.circleMemberships.filter(m => m.role === 'OWNER');
    
    // Delete in transaction
    await prisma.$transaction(async (tx) => {
      // 1. If user owns circles, delete them (or transfer ownership?)
      for (const membership of ownedCircles) {
        // Delete all events in the circle
        await tx.event.deleteMany({
          where: { circleId: membership.circleId }
        });
        
        // Delete all zones in the circle
        await tx.zone.deleteMany({
          where: { circleId: membership.circleId }
        });
        
        // Delete all memberships in the circle
        await tx.circleMember.deleteMany({
          where: { circleId: membership.circleId }
        });
        
        // Delete the home
        await tx.home.deleteMany({
          where: { circleId: membership.circleId }
        });
        
        // Delete the circle
        await tx.circle.delete({
          where: { id: membership.circleId }
        });
      }

      // 2. Remove user from other circles
      await tx.circleMember.deleteMany({
        where: { userId: user.id }
      });

      // 3. Delete auth codes
      await tx.authCode.deleteMany({
        where: { email: user.email }
      });

      // 4. Delete refresh tokens
      await tx.refreshToken.deleteMany({
        where: { userId: user.id }
      });

      // 5. Remove from whitelist
      await tx.emailWhitelist.deleteMany({
        where: { email: user.email }
      });

      // 6. Delete user
      await tx.user.delete({
        where: { id: user.id }
      });
    });

    console.log(`🗑️ 用户已删除: ${user.email}`);

    res.json({
      success: true,
      message: '用户已删除',
      deletedUser: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
