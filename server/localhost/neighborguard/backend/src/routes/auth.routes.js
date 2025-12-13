// ============================================================================
// Auth Routes (Refactored)
// Thin routing layer - delegates to controller
// ============================================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// Public Routes (no authentication required)
// ============================================================================

// Request verification code
router.post('/request-code', authController.requestCode);

// Login with verification code
router.post('/login', authController.login);

// Refresh access token
router.post('/refresh', authController.refreshToken);

// Verify token validity
router.post('/verify-token', authController.verifyToken);

// ============================================================================
// Protected Routes (authentication required)
// ============================================================================

// Get current user info
router.get('/me', authenticate, authController.getMe);

// Update user profile
router.put('/profile', authenticate, authController.updateProfile);

// Logout current session
router.post('/logout', authenticate, authController.logout);

// Logout all sessions
router.post('/logout-all', authenticate, authController.logoutAll);

// Get active sessions
router.get('/sessions', authenticate, authController.getSessions);

// Revoke specific session
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

module.exports = router;
