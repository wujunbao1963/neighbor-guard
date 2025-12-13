// ============================================================================
// Auth Controller
// Request handling for authentication endpoints
// ============================================================================

const { tokenService, authCodeService, userService } = require('../services/auth');
const { asyncHandler, ValidationError } = require('../utils/errors');
const { authLogger } = require('../utils/logger');

/**
 * POST /api/auth/request-code
 * Request a verification code via email
 */
const requestCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Create verification code
  const { code, expiresInSeconds } = await authCodeService.createCode(email);

  // Log code in dev/test mode
  authCodeService.logCode(email, code);

  // TODO: Send email in production
  if (process.env.NODE_ENV === 'production' && !process.env.AUTH_TEST_MODE) {
    // await emailService.sendVerificationCode(email, code);
  }

  res.json({
    success: true,
    message: 'Verification code sent',
    expiresIn: expiresInSeconds
  });
});

/**
 * POST /api/auth/login
 * Verify code and login
 */
const login = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    throw new ValidationError('Email and code are required');
  }

  // Verify the code
  await authCodeService.verifyCode(email, code);

  // Find or create user
  const { user, isNew } = await userService.findOrCreate(email);

  // Update last login
  await userService.updateLastLogin(user.id);

  // Generate tokens
  const deviceInfo = req.headers['user-agent'] || 'unknown';
  const tokens = await tokenService.generateTokenPair(user, deviceInfo);

  // Get user's circles
  const circles = await userService.getUserCircles(user.id);

  authLogger.info('User logged in', { 
    userId: user.id, 
    isNewUser: isNew,
    circleCount: circles.length
  });

  res.json({
    success: true,
    user: userService.formatForResponse(user),
    circles,
    tokens,
    isNewUser: isNew
  });
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token, userId } = req.body;

  if (!token || !userId) {
    throw new ValidationError('Refresh token and user ID are required');
  }

  // Rotate tokens
  const deviceInfo = req.headers['user-agent'] || 'unknown';
  const tokens = await tokenService.rotateRefreshToken(userId, token, deviceInfo);

  res.json({
    success: true,
    tokens
  });
});

/**
 * POST /api/auth/logout
 * Logout current session
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  const userId = req.user?.id;

  if (userId && token) {
    await tokenService.revokeRefreshToken(userId, token);
  }

  authLogger.info('User logged out', { userId });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/auth/logout-all
 * Logout all sessions (all devices)
 */
const logoutAll = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await tokenService.revokeAllRefreshTokens(userId);

  res.json({
    success: true,
    message: `Logged out from ${result.count} sessions`
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
const getMe = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await userService.findById(userId);
  const circles = await userService.getUserCircles(userId);

  res.json({
    success: true,
    user: userService.formatForResponse(user),
    circles
  });
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { displayName, phone, timezone, locale } = req.body;

  const user = await userService.updateProfile(userId, {
    displayName,
    phone,
    timezone,
    locale
  });

  res.json({
    success: true,
    user: userService.formatForResponse(user)
  });
});

/**
 * GET /api/auth/sessions
 * Get active sessions for current user
 */
const getSessions = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const sessions = await tokenService.getActiveSessions(userId);

  res.json({
    success: true,
    sessions
  });
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session
 */
const revokeSession = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;

  // Find and revoke the session
  await prisma.refreshToken.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });

  res.json({
    success: true,
    message: 'Session revoked'
  });
});

/**
 * POST /api/auth/verify-token
 * Verify if a token is valid (for internal use)
 */
const verifyToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Token is required');
  }

  const decoded = tokenService.verifyAccessToken(token);

  res.json({
    success: true,
    valid: true,
    userId: decoded.userId,
    email: decoded.email
  });
});

module.exports = {
  requestCode,
  login,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  getSessions,
  revokeSession,
  verifyToken
};
