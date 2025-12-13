// ============================================================================
// Auth API
// API endpoints for authentication
// ============================================================================

import { request, setAccessToken, setRefreshToken, setUserId, clearAuthData } from './client';

export const authAPI = {
  /**
   * Request verification code
   * @param {string} email - User email
   */
  requestCode: (email) =>
    request('post', '/auth/request-code', { email }),

  /**
   * Login with verification code
   * @param {string} email - User email
   * @param {string} code - Verification code
   */
  login: async (email, code) => {
    const response = await request('post', '/auth/login', { email, code });
    
    // Store tokens
    if (response.tokens) {
      setAccessToken(response.tokens.accessToken);
      setRefreshToken(response.tokens.refreshToken);
    }
    if (response.user) {
      setUserId(response.user.id);
    }
    
    return response;
  },

  /**
   * Refresh access token
   * @param {string} userId - User ID
   * @param {string} refreshToken - Refresh token
   */
  refresh: async (userId, refreshToken) => {
    const response = await request('post', '/auth/refresh', { userId, refreshToken });
    
    if (response.tokens) {
      setAccessToken(response.tokens.accessToken);
      if (response.tokens.refreshToken) {
        setRefreshToken(response.tokens.refreshToken);
      }
    }
    
    return response;
  },

  /**
   * Logout current session
   * @param {string} refreshToken - Current refresh token
   */
  logout: async (refreshToken) => {
    try {
      await request('post', '/auth/logout', { refreshToken });
    } finally {
      clearAuthData();
    }
  },

  /**
   * Logout all sessions
   */
  logoutAll: async () => {
    try {
      await request('post', '/auth/logout-all');
    } finally {
      clearAuthData();
    }
  },

  /**
   * Get current user info
   */
  getMe: () =>
    request('get', '/auth/me'),

  /**
   * Update user profile
   * @param {Object} data - Profile data
   */
  updateProfile: (data) =>
    request('put', '/auth/profile', data),

  /**
   * Get active sessions
   */
  getSessions: () =>
    request('get', '/auth/sessions'),

  /**
   * Revoke a specific session
   * @param {string} sessionId - Session ID to revoke
   */
  revokeSession: (sessionId) =>
    request('delete', `/auth/sessions/${sessionId}`),

  /**
   * Register device for push notifications
   * @param {string} token - Device token
   * @param {string} platform - 'ios' or 'android'
   */
  registerDevice: (token, platform = 'ios') =>
    request('post', '/auth/devices', { token, platform }),

  /**
   * Unregister device
   * @param {string} platform - 'ios' or 'android'
   */
  unregisterDevice: (platform = 'ios') =>
    request('delete', `/auth/devices/${platform}`)
};

export default authAPI;
