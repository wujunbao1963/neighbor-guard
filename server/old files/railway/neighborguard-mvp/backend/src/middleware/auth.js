// ============================================================================
// Authentication Middleware
// Phase 2: JWT verification and role checking
// ============================================================================

const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { AppError } = require('./errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// ============================================================================
// Verify JWT Token
// ============================================================================
const authenticate = async (req, res, next) => {
  try {
    // Support token from header or query parameter (for downloads)
    let token;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      // Allow token in query for file downloads
      token = req.query.token;
    }
    
    if (!token) {
      throw new AppError('未提供认证令牌', 401, 'NO_TOKEN');
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('令牌已过期', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('无效的令牌', 401, 'INVALID_TOKEN');
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        adminRole: true,
        isActive: true,
        deletedAt: true
      }
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new AppError('用户不存在或已禁用', 401, 'USER_INVALID');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// Optional Authentication (doesn't fail if no token)
// ============================================================================
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });
      if (user && user.isActive && !user.deletedAt) {
        req.user = user;
      }
    } catch (err) {
      // Ignore token errors for optional auth
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// Check Circle Membership
// ============================================================================
const requireCircleMember = (allowedRoles = null) => {
  return async (req, res, next) => {
    try {
      const circleId = req.params.circleId;
      
      if (!circleId) {
        throw new AppError('缺少Circle ID', 400, 'MISSING_CIRCLE_ID');
      }

      const membership = await prisma.circleMember.findFirst({
        where: {
          circleId,
          userId: req.user.id,
          leftAt: null
        },
        include: {
          circle: true
        }
      });

      if (!membership) {
        throw new AppError('你不是该圈子的成员', 403, 'NOT_MEMBER');
      }

      if (membership.circle.deletedAt) {
        throw new AppError('该圈子已被删除', 404, 'CIRCLE_DELETED');
      }

      // Check role if specified
      if (allowedRoles && !allowedRoles.includes(membership.role)) {
        throw new AppError('权限不足', 403, 'INSUFFICIENT_ROLE');
      }

      req.circleMember = membership;
      req.circle = membership.circle;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// ============================================================================
// Shorthand: Require Owner role
// ============================================================================
const requireCircleOwner = requireCircleMember(['OWNER']);

// ============================================================================
// Shorthand: Require Owner or Household (can create events)
// ============================================================================
const requireCanCreateEvent = requireCircleMember(['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE']);

// ============================================================================
// Shorthand: Require Owner or Household (can manage home settings)
// ============================================================================
const requireCanManageHome = requireCircleMember(['OWNER', 'HOUSEHOLD']);

module.exports = {
  authenticate,
  optionalAuth,
  requireCircleMember,
  requireCircleOwner,
  requireCanCreateEvent,
  requireCanManageHome
};
