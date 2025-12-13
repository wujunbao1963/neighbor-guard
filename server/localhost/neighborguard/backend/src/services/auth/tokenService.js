// ============================================================================
// Token Service
// JWT and refresh token management
// ============================================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { AuthenticationError } = require('../../utils/errors');
const { authLogger } = require('../../utils/logger');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 7;

class TokenService {
  /**
   * Generate access token
   * @param {Object} user - User object with id and email
   * @returns {string} JWT access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES }
    );
  }

  /**
   * Generate refresh token and save to database
   * @param {string} userId - User ID
   * @param {string} deviceInfo - Device/browser info
   * @returns {Promise<{token: string, expiresAt: Date}>}
   */
  async generateRefreshToken(userId, deviceInfo = 'unknown') {
    const token = crypto.randomBytes(40).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        deviceInfo
      }
    });

    authLogger.debug('Refresh token created', { userId });
    return { token, expiresAt };
  }

  /**
   * Generate both access and refresh tokens
   * @param {Object} user - User object
   * @param {string} deviceInfo - Device info
   * @returns {Promise<Object>}
   */
  async generateTokenPair(user, deviceInfo = 'unknown') {
    const accessToken = this.generateAccessToken(user);
    const { token: refreshToken, expiresAt } = await this.generateRefreshToken(user.id, deviceInfo);

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_ACCESS_EXPIRES,
      refreshExpiresAt: expiresAt
    };
  }

  /**
   * Verify access token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   * @throws {AuthenticationError}
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token expired');
      }
      throw new AuthenticationError('Invalid token');
    }
  }

  /**
   * Verify refresh token and return user
   * @param {string} userId - User ID
   * @param {string} token - Refresh token
   * @returns {Promise<Object>} User object
   * @throws {AuthenticationError}
   */
  async verifyRefreshToken(userId, token) {
    const refreshTokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    // Check each token (there could be multiple devices)
    for (const rt of refreshTokens) {
      const isValid = await bcrypt.compare(token, rt.tokenHash);
      if (isValid) {
        const user = await prisma.user.findUnique({
          where: { id: userId }
        });
        
        if (!user || !user.isActive) {
          throw new AuthenticationError('User account is inactive');
        }
        
        return user;
      }
    }

    throw new AuthenticationError('Invalid refresh token');
  }

  /**
   * Rotate refresh token (revoke old, create new)
   * @param {string} userId - User ID
   * @param {string} oldToken - Current refresh token
   * @param {string} deviceInfo - Device info
   * @returns {Promise<Object>} New token pair
   */
  async rotateRefreshToken(userId, oldToken, deviceInfo = 'unknown') {
    // Verify old token first
    const user = await this.verifyRefreshToken(userId, oldToken);

    // Revoke old token
    await this.revokeRefreshToken(userId, oldToken);

    // Generate new pair
    return this.generateTokenPair(user, deviceInfo);
  }

  /**
   * Revoke a specific refresh token
   * @param {string} userId - User ID
   * @param {string} token - Refresh token to revoke
   */
  async revokeRefreshToken(userId, token) {
    const refreshTokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null
      }
    });

    for (const rt of refreshTokens) {
      const isMatch = await bcrypt.compare(token, rt.tokenHash);
      if (isMatch) {
        await prisma.refreshToken.update({
          where: { id: rt.id },
          data: { revokedAt: new Date() }
        });
        authLogger.debug('Refresh token revoked', { userId, tokenId: rt.id });
        return;
      }
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   * @param {string} userId - User ID
   * @returns {Promise<{count: number}>}
   */
  async revokeAllRefreshTokens(userId) {
    const result = await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    authLogger.info('All refresh tokens revoked', { userId, count: result.count });
    return result;
  }

  /**
   * Clean up expired tokens (run periodically)
   * @returns {Promise<{count: number}>}
   */
  async cleanupExpiredTokens() {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } }
        ]
      }
    });

    if (result.count > 0) {
      authLogger.info('Cleaned up expired tokens', { count: result.count });
    }
    return result;
  }

  /**
   * Get active sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getActiveSessions(userId) {
    return prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        deviceInfo: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

// Export singleton
module.exports = new TokenService();
