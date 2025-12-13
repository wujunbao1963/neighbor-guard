// ============================================================================
// Auth Code Service
// Email verification code management
// ============================================================================

const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { ValidationError, AuthenticationError } = require('../../utils/errors');
const { authLogger } = require('../../utils/logger');

// Configuration
const CODE_EXPIRES_MINUTES = parseInt(process.env.AUTH_CODE_EXPIRES_MINUTES) || 10;
const CODE_MAX_ATTEMPTS = parseInt(process.env.AUTH_CODE_MAX_ATTEMPTS) || 5;
const TEST_MODE = process.env.AUTH_TEST_MODE === 'true';
const TEST_CODE = process.env.AUTH_TEST_CODE || '587585';

class AuthCodeService {
  /**
   * Generate a 6-digit verification code
   * @returns {string}
   */
  generateCode() {
    if (TEST_MODE) {
      return TEST_CODE;
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Create and store a new verification code
   * @param {string} email - Email address
   * @returns {Promise<{code: string, expiresAt: Date}>}
   */
  async createCode(email) {
    const normalizedEmail = email.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new ValidationError('Invalid email format');
    }

    // Invalidate previous codes
    await prisma.authCode.updateMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { expiresAt: new Date() }
    });

    // Generate and hash code
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_EXPIRES_MINUTES * 60 * 1000);

    // Store code
    await prisma.authCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        expiresAt
      }
    });

    authLogger.info('Verification code created', { 
      email: normalizedEmail, 
      testMode: TEST_MODE 
    });

    return { code, expiresAt, expiresInSeconds: CODE_EXPIRES_MINUTES * 60 };
  }

  /**
   * Verify a code for an email
   * @param {string} email - Email address
   * @param {string} code - Verification code
   * @returns {Promise<boolean>}
   * @throws {AuthenticationError}
   */
  async verifyCode(email, code) {
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
      throw new AuthenticationError('Verification code invalid or expired');
    }

    // Check attempts
    if (authCode.attempts >= CODE_MAX_ATTEMPTS) {
      throw new AuthenticationError('Too many attempts, please request a new code');
    }

    // Verify code
    const isValid = await bcrypt.compare(code, authCode.codeHash);

    if (!isValid) {
      // Increment attempts
      await prisma.authCode.update({
        where: { id: authCode.id },
        data: { attempts: { increment: 1 } }
      });
      
      authLogger.warn('Invalid code attempt', { 
        email: normalizedEmail, 
        attempts: authCode.attempts + 1 
      });
      
      throw new AuthenticationError('Incorrect verification code');
    }

    // Mark code as used
    await prisma.authCode.update({
      where: { id: authCode.id },
      data: { usedAt: new Date() }
    });

    authLogger.info('Code verified successfully', { email: normalizedEmail });
    return true;
  }

  /**
   * Log verification code (for development)
   * @param {string} email - Email address
   * @param {string} code - Verification code
   */
  logCode(email, code) {
    const shouldLog = TEST_MODE || process.env.DEV_SKIP_EMAIL === 'true';
    
    if (shouldLog) {
      const modeLabel = TEST_MODE ? '测试模式 - 固定验证码' : '开发模式';
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📧 验证码 (${modeLabel})
║
║  邮箱: ${email}
║  验证码: ${code}
║  有效期: ${CODE_EXPIRES_MINUTES} 分钟
╚═══════════════════════════════════════════════════════════════╝
      `);
    }
  }

  /**
   * Clean up expired codes (run periodically)
   * @returns {Promise<{count: number}>}
   */
  async cleanupExpiredCodes() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const result = await prisma.authCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { usedAt: { not: null }, createdAt: { lt: cutoff } }
        ]
      }
    });

    if (result.count > 0) {
      authLogger.info('Cleaned up expired auth codes', { count: result.count });
    }
    return result;
  }

  /**
   * Get configuration info (for API response)
   * @returns {Object}
   */
  getConfig() {
    return {
      codeExpiresMinutes: CODE_EXPIRES_MINUTES,
      maxAttempts: CODE_MAX_ATTEMPTS,
      testMode: TEST_MODE
    };
  }
}

// Export singleton
module.exports = new AuthCodeService();
