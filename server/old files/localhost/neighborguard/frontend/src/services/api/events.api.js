// ============================================================================
// Events API
// API endpoints for security events
// ============================================================================

import { request } from './client';

export const eventAPI = {
  /**
   * Get events with pagination and filters
   * @param {string} circleId - Circle ID
   * @param {Object} params - Query parameters
   */
  getEvents: (circleId, params = {}) => 
    request('get', `/circles/${circleId}/events`, null, { params }),

  /**
   * Get recent events for timeline
   * @param {string} circleId - Circle ID
   * @param {number} limit - Max events to return
   */
  getRecentEvents: (circleId, limit = 50) =>
    request('get', `/circles/${circleId}/events/recent`, null, { params: { limit } }),

  /**
   * Get open (unresolved) events
   * @param {string} circleId - Circle ID
   */
  getOpenEvents: (circleId) =>
    request('get', `/circles/${circleId}/events/open`),

  /**
   * Get event statistics
   * @param {string} circleId - Circle ID
   * @param {string} since - Start date (ISO string)
   */
  getStats: (circleId, since = null) =>
    request('get', `/circles/${circleId}/events/stats`, null, { 
      params: since ? { since } : {} 
    }),

  /**
   * Get single event details
   * @param {string} circleId - Circle ID
   * @param {string} eventId - Event ID
   */
  getEvent: (circleId, eventId) =>
    request('get', `/circles/${circleId}/events/${eventId}`),

  /**
   * Create a manual event
   * @param {string} circleId - Circle ID
   * @param {Object} eventData - Event data
   */
  createEvent: (circleId, eventData) =>
    request('post', `/circles/${circleId}/events`, eventData),

  /**
   * Update event status
   * @param {string} circleId - Circle ID
   * @param {string} eventId - Event ID
   * @param {string} status - New status
   */
  updateStatus: (circleId, eventId, status) =>
    request('put', `/circles/${circleId}/events/${eventId}/status`, { status }),

  /**
   * Submit event feedback
   * @param {string} circleId - Circle ID
   * @param {string} eventId - Event ID
   * @param {Object} feedback - { rating, label, notes }
   */
  submitFeedback: (circleId, eventId, feedback) =>
    request('post', `/circles/${circleId}/events/${eventId}/feedback`, feedback),

  /**
   * Delete an event
   * @param {string} circleId - Circle ID
   * @param {string} eventId - Event ID
   */
  deleteEvent: (circleId, eventId) =>
    request('delete', `/circles/${circleId}/events/${eventId}`),

  /**
   * Get event media
   * @param {string} circleId - Circle ID
   * @param {string} eventId - Event ID
   */
  getEventMedia: (circleId, eventId) =>
    request('get', `/circles/${circleId}/events/${eventId}/media`)
};

export default eventAPI;
