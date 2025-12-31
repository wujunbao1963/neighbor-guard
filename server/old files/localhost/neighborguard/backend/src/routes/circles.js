// ============================================================================
// Circle Routes
// Phase 3: Circle CRUD and Member Management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember, requireCircleOwner } = require('../middleware/auth');
const { getZoneTypesForHouseType } = require('../config/constants');

// ============================================================================
// GET /api/circles - Get all circles for current user
// ============================================================================
router.get('/', authenticate, async (req, res, next) => {
  try {
    const memberships = await prisma.circleMember.findMany({
      where: {
        userId: req.user.id,
        leftAt: null
      },
      include: {
        circle: {
          include: {
            home: true,
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true }
                }
              }
            },
            _count: {
              select: {
                events: { where: { deletedAt: null, status: { in: ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'] } } }
              }
            }
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    const circles = memberships.map(m => ({
      id: m.circle.id,
      displayName: m.circle.displayName,
      myRole: m.role,
      myDisplayName: m.displayName,
      home: m.circle.home ? {
        id: m.circle.home.id,
        displayName: m.circle.home.displayName,
        houseType: m.circle.home.houseType,
        city: m.circle.home.city,
        addressLine1: m.circle.home.addressLine1
      } : null,
      members: m.circle.members.map(mem => ({
        id: mem.id,
        userId: mem.userId,
        displayName: mem.displayName || mem.user.displayName,
        avatarUrl: mem.user.avatarUrl,
        role: mem.role
      })),
      activeEventCount: m.circle._count.events,
      createdAt: m.circle.createdAt
    }));

    res.json({
      success: true,
      circles
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/circles/:circleId - Get single circle details
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;

    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        home: true,
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: { 
                id: true, 
                email: true, 
                displayName: true, 
                avatarUrl: true,
                phone: true
              }
            }
          },
          orderBy: [
            { role: 'asc' },
            { joinedAt: 'asc' }
          ]
        },
        zones: {
          orderBy: { displayOrder: 'asc' }
        },
        _count: {
          select: {
            events: { where: { deletedAt: null } }
          }
        }
      }
    });

    if (!circle) {
      throw new AppError('圈子不存在', 404, 'CIRCLE_NOT_FOUND');
    }

    res.json({
      success: true,
      circle: {
        id: circle.id,
        displayName: circle.displayName,
        myRole: req.circleMember.role,
        home: circle.home,
        members: circle.members.map(m => ({
          id: m.id,
          userId: m.userId,
          email: m.user.email,
          displayName: m.displayName || m.user.displayName,
          avatarUrl: m.user.avatarUrl,
          phone: m.user.phone,
          role: m.role,
          notifyOnHighSeverity: m.notifyOnHighSeverity,
          notifyOnMediumSeverity: m.notifyOnMediumSeverity,
          notifyOnLowSeverity: m.notifyOnLowSeverity,
          joinedAt: m.joinedAt
        })),
        zones: circle.zones,
        eventCount: circle._count.events,
        createdAt: circle.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/circles - Create new circle
// ============================================================================
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { 
      displayName, 
      homeDisplayName,
      houseType = 'DETACHED',
      city = '',
      region = '',
      postalCode = '',
      addressLine1 = ''
    } = req.body;

    if (!displayName) {
      throw new AppError('请提供圈子名称', 400, 'NAME_REQUIRED');
    }

    // Create circle with home and owner membership in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create circle
      const circle = await tx.circle.create({
        data: {
          displayName,
          ownerId: req.user.id
        }
      });

      // 2. Create home
      const home = await tx.home.create({
        data: {
          circleId: circle.id,
          displayName: homeDisplayName || displayName,
          houseType,
          city,
          region,
          postalCode,
          addressLine1
        }
      });

      // 3. Add owner as member
      const membership = await tx.circleMember.create({
        data: {
          circleId: circle.id,
          userId: req.user.id,
          role: 'OWNER',
          displayName: req.user.displayName
        }
      });

      // 4. Initialize zones based on house type (using code-based config)
      const zoneConfigs = getZoneTypesForHouseType(houseType);

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

      return { circle, home, membership, zoneCount: zoneConfigs.length };
    });

    res.status(201).json({
      success: true,
      circle: {
        id: result.circle.id,
        displayName: result.circle.displayName,
        home: result.home,
        zoneCount: result.zoneCount
      },
      message: `圈子创建成功，已初始化 ${result.zoneCount} 个防区`
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/circles/:circleId - Update circle
// ============================================================================
router.put('/:circleId', authenticate, requireCircleOwner, async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { displayName } = req.body;

    const circle = await prisma.circle.update({
      where: { id: circleId },
      data: { displayName }
    });

    res.json({
      success: true,
      circle
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/circles/:circleId - Delete circle (soft delete)
// ============================================================================
router.delete('/:circleId', authenticate, requireCircleOwner, async (req, res, next) => {
  try {
    const { circleId } = req.params;

    await prisma.circle.update({
      where: { id: circleId },
      data: { deletedAt: new Date() }
    });

    res.json({
      success: true,
      message: '圈子已删除'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/circles/:circleId/members - Add member to circle
// ============================================================================
router.post('/:circleId/members', authenticate, requireCircleOwner, async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { email, role = 'NEIGHBOR', displayName } = req.body;

    if (!email) {
      throw new AppError('请提供邮箱地址', 400, 'EMAIL_REQUIRED');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user - must already be registered in the system
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new AppError('该用户未注册，请让对方先登录系统完成注册', 404, 'USER_NOT_FOUND');
    }

    // Check if already a member
    const existingMember = await prisma.circleMember.findUnique({
      where: {
        circleId_userId: { circleId, userId: user.id }
      }
    });

    if (existingMember) {
      if (!existingMember.leftAt) {
        throw new AppError('该用户已是圈子成员', 409, 'ALREADY_MEMBER');
      }
      // Reactivate membership
      const member = await prisma.circleMember.update({
        where: { id: existingMember.id },
        data: {
          role,
          displayName: displayName || user.displayName,
          leftAt: null
        },
        include: {
          user: { select: { id: true, email: true, displayName: true, avatarUrl: true } }
        }
      });

      return res.json({
        success: true,
        member: {
          id: member.id,
          userId: member.userId,
          email: member.user.email,
          displayName: member.displayName || member.user.displayName,
          role: member.role
        },
        message: '成员已重新加入'
      });
    }

    // Create new membership
    const member = await prisma.circleMember.create({
      data: {
        circleId,
        userId: user.id,
        role,
        displayName: displayName || user.displayName
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, avatarUrl: true } }
      }
    });

    res.status(201).json({
      success: true,
      member: {
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        displayName: member.displayName || member.user.displayName,
        role: member.role
      },
      message: '成员添加成功'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/circles/:circleId/members/:memberId - Update member
// ============================================================================
router.put('/:circleId/members/:memberId', authenticate, requireCircleOwner, async (req, res, next) => {
  try {
    const { circleId, memberId } = req.params;
    const { 
      role, 
      displayName,
      notifyOnHighSeverity,
      notifyOnMediumSeverity,
      notifyOnLowSeverity
    } = req.body;

    // Get member
    const member = await prisma.circleMember.findFirst({
      where: { id: memberId, circleId, leftAt: null }
    });

    if (!member) {
      throw new AppError('成员不存在', 404, 'MEMBER_NOT_FOUND');
    }

    // Cannot change owner's role
    if (member.role === 'OWNER' && role && role !== 'OWNER') {
      throw new AppError('不能更改屋主的角色', 400, 'CANNOT_CHANGE_OWNER_ROLE');
    }

    const updateData = {};
    if (role !== undefined && member.role !== 'OWNER') updateData.role = role;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (notifyOnHighSeverity !== undefined) updateData.notifyOnHighSeverity = notifyOnHighSeverity;
    if (notifyOnMediumSeverity !== undefined) updateData.notifyOnMediumSeverity = notifyOnMediumSeverity;
    if (notifyOnLowSeverity !== undefined) updateData.notifyOnLowSeverity = notifyOnLowSeverity;

    const updated = await prisma.circleMember.update({
      where: { id: memberId },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, displayName: true, avatarUrl: true } }
      }
    });

    res.json({
      success: true,
      member: {
        id: updated.id,
        userId: updated.userId,
        email: updated.user.email,
        displayName: updated.displayName || updated.user.displayName,
        role: updated.role,
        notifyOnHighSeverity: updated.notifyOnHighSeverity,
        notifyOnMediumSeverity: updated.notifyOnMediumSeverity,
        notifyOnLowSeverity: updated.notifyOnLowSeverity
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/circles/:circleId/members/:memberId - Remove member
// ============================================================================
router.delete('/:circleId/members/:memberId', authenticate, requireCircleOwner, async (req, res, next) => {
  try {
    const { circleId, memberId } = req.params;

    const member = await prisma.circleMember.findFirst({
      where: { id: memberId, circleId, leftAt: null }
    });

    if (!member) {
      throw new AppError('成员不存在', 404, 'MEMBER_NOT_FOUND');
    }

    if (member.role === 'OWNER') {
      throw new AppError('不能移除屋主', 400, 'CANNOT_REMOVE_OWNER');
    }

    await prisma.circleMember.update({
      where: { id: memberId },
      data: { leftAt: new Date() }
    });

    res.json({
      success: true,
      message: '成员已移除'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/circles/:circleId/leave - Leave circle (self)
// ============================================================================
router.post('/:circleId/leave', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;

    if (req.circleMember.role === 'OWNER') {
      throw new AppError('屋主不能离开自己的圈子，请先转让或删除圈子', 400, 'OWNER_CANNOT_LEAVE');
    }

    await prisma.circleMember.update({
      where: { id: req.circleMember.id },
      data: { leftAt: new Date() }
    });

    res.json({
      success: true,
      message: '已离开圈子'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
