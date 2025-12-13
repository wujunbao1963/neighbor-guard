// ============================================================================
// User Service
// User account management
// ============================================================================

const prisma = require('../../config/database');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const { authLogger } = require('../../utils/logger');

class UserService {
  /**
   * Find user by email
   * @param {string} email - Email address
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    return prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   * @throws {NotFoundError}
   */
  async findById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  }

  /**
   * Find or create user by email
   * @param {string} email - Email address
   * @returns {Promise<{user: Object, isNew: boolean}>}
   */
  async findOrCreate(email) {
    const normalizedEmail = email.toLowerCase().trim();
    
    let user = await this.findByEmail(normalizedEmail);
    let isNew = false;

    if (!user) {
      const displayName = normalizedEmail.split('@')[0];
      
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          displayName,
          emailVerified: true,
          isActive: true
        }
      });

      isNew = true;
      authLogger.info('New user created', { userId: user.id, email: normalizedEmail });
    }

    return { user, isNew };
  }

  /**
   * Update user's last login time
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async updateLastLogin(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} data - Profile data
   * @returns {Promise<Object>}
   */
  async updateProfile(userId, data) {
    const allowedFields = ['displayName', 'avatarUrl', 'phone', 'timezone', 'locale'];
    const updateData = {};

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    authLogger.debug('User profile updated', { userId });
    return user;
  }

  /**
   * Get user with their circle memberships
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getUserWithCircles(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { leftAt: null },
          include: {
            circle: {
              include: {
                home: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  }

  /**
   * Get user's circles in simplified format
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getUserCircles(userId) {
    const memberships = await prisma.circleMember.findMany({
      where: {
        userId,
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

    return memberships.map(m => ({
      id: m.circle.id,
      displayName: m.circle.displayName,
      role: m.role,
      home: m.circle.home ? {
        displayName: m.circle.home.displayName,
        houseType: m.circle.home.houseType,
        houseMode: m.circle.home.houseMode
      } : null
    }));
  }

  /**
   * Deactivate user account
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async deactivate(userId) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false }
    });

    authLogger.info('User deactivated', { userId });
    return user;
  }

  /**
   * Reactivate user account
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async reactivate(userId) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true }
    });

    authLogger.info('User reactivated', { userId });
    return user;
  }

  /**
   * Delete user and all associated data
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async deleteUser(userId) {
    // This will cascade delete related records based on schema
    await prisma.user.delete({
      where: { id: userId }
    });

    authLogger.info('User deleted', { userId });
  }

  /**
   * Format user for API response (omit sensitive fields)
   * @param {Object} user - User object
   * @returns {Object}
   */
  formatForResponse(user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      timezone: user.timezone,
      locale: user.locale,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    };
  }
}

// Export singleton
module.exports = new UserService();
