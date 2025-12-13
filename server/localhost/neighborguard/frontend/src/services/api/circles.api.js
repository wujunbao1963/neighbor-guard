// ============================================================================
// Circles API
// API endpoints for circles, homes, zones, and sensors
// ============================================================================

import { request, setCircleId } from './client';

// ============================================================================
// Circle API
// ============================================================================
export const circleAPI = {
  /**
   * Get all circles for current user
   */
  getCircles: () =>
    request('get', '/circles'),

  /**
   * Get single circle details
   * @param {string} circleId - Circle ID
   */
  getCircle: (circleId) =>
    request('get', `/circles/${circleId}`),

  /**
   * Create a new circle
   * @param {Object} data - Circle data
   */
  createCircle: (data) =>
    request('post', '/circles', data),

  /**
   * Update circle
   * @param {string} circleId - Circle ID
   * @param {Object} data - Update data
   */
  updateCircle: (circleId, data) =>
    request('put', `/circles/${circleId}`, data),

  /**
   * Delete circle
   * @param {string} circleId - Circle ID
   */
  deleteCircle: (circleId) =>
    request('delete', `/circles/${circleId}`),

  /**
   * Get circle members
   * @param {string} circleId - Circle ID
   */
  getMembers: (circleId) =>
    request('get', `/circles/${circleId}/members`),

  /**
   * Invite member to circle
   * @param {string} circleId - Circle ID
   * @param {Object} data - { email, role }
   */
  inviteMember: (circleId, data) =>
    request('post', `/circles/${circleId}/members/invite`, data),

  /**
   * Update member role
   * @param {string} circleId - Circle ID
   * @param {string} memberId - Member ID
   * @param {string} role - New role
   */
  updateMemberRole: (circleId, memberId, role) =>
    request('put', `/circles/${circleId}/members/${memberId}`, { role }),

  /**
   * Remove member from circle
   * @param {string} circleId - Circle ID
   * @param {string} memberId - Member ID
   */
  removeMember: (circleId, memberId) =>
    request('delete', `/circles/${circleId}/members/${memberId}`),

  /**
   * Set current circle (stores in localStorage)
   * @param {string} circleId - Circle ID
   */
  setCurrentCircle: (circleId) => {
    setCircleId(circleId);
  }
};

// ============================================================================
// Home API
// ============================================================================
export const homeAPI = {
  /**
   * Get home details
   * @param {string} circleId - Circle ID
   */
  getHome: (circleId) =>
    request('get', `/circles/${circleId}/home`),

  /**
   * Update home
   * @param {string} circleId - Circle ID
   * @param {Object} data - Update data
   */
  updateHome: (circleId, data) =>
    request('put', `/circles/${circleId}/home`, data),

  /**
   * Set house mode
   * @param {string} circleId - Circle ID
   * @param {string} mode - House mode (DISARMED, HOME, AWAY, NIGHT)
   */
  setHouseMode: (circleId, mode) =>
    request('put', `/circles/${circleId}/home/mode`, { mode }),

  /**
   * Get house mode
   * @param {string} circleId - Circle ID
   */
  getHouseMode: (circleId) =>
    request('get', `/circles/${circleId}/home/mode`)
};

// ============================================================================
// Zone API
// ============================================================================
export const zoneAPI = {
  /**
   * Get all zones
   * @param {string} circleId - Circle ID
   */
  getZones: (circleId) =>
    request('get', `/circles/${circleId}/zones`),

  /**
   * Get single zone
   * @param {string} circleId - Circle ID
   * @param {string} zoneId - Zone ID
   */
  getZone: (circleId, zoneId) =>
    request('get', `/circles/${circleId}/zones/${zoneId}`),

  /**
   * Create zone
   * @param {string} circleId - Circle ID
   * @param {Object} data - Zone data
   */
  createZone: (circleId, data) =>
    request('post', `/circles/${circleId}/zones`, data),

  /**
   * Update zone
   * @param {string} circleId - Circle ID
   * @param {string} zoneId - Zone ID
   * @param {Object} data - Update data
   */
  updateZone: (circleId, zoneId, data) =>
    request('put', `/circles/${circleId}/zones/${zoneId}`, data),

  /**
   * Delete zone
   * @param {string} circleId - Circle ID
   * @param {string} zoneId - Zone ID
   */
  deleteZone: (circleId, zoneId) =>
    request('delete', `/circles/${circleId}/zones/${zoneId}`)
};

// ============================================================================
// Sensor API
// ============================================================================
export const sensorAPI = {
  /**
   * Get all sensors
   * @param {string} circleId - Circle ID
   */
  getSensors: (circleId) =>
    request('get', `/circles/${circleId}/sensors`),

  /**
   * Get single sensor
   * @param {string} circleId - Circle ID
   * @param {string} sensorId - Sensor ID
   */
  getSensor: (circleId, sensorId) =>
    request('get', `/circles/${circleId}/sensors/${sensorId}`),

  /**
   * Create sensor
   * @param {string} circleId - Circle ID
   * @param {Object} data - Sensor data
   */
  createSensor: (circleId, data) =>
    request('post', `/circles/${circleId}/sensors`, data),

  /**
   * Update sensor
   * @param {string} circleId - Circle ID
   * @param {string} sensorId - Sensor ID
   * @param {Object} data - Update data
   */
  updateSensor: (circleId, sensorId, data) =>
    request('put', `/circles/${circleId}/sensors/${sensorId}`, data),

  /**
   * Delete sensor
   * @param {string} circleId - Circle ID
   * @param {string} sensorId - Sensor ID
   */
  deleteSensor: (circleId, sensorId) =>
    request('delete', `/circles/${circleId}/sensors/${sensorId}`)
};

// ============================================================================
// Integration API
// ============================================================================
export const integrationAPI = {
  /**
   * Get all integrations
   * @param {string} circleId - Circle ID
   */
  getIntegrations: (circleId) =>
    request('get', `/circles/${circleId}/integrations`),

  /**
   * Get single integration
   * @param {string} circleId - Circle ID
   * @param {string} integrationId - Integration ID
   */
  getIntegration: (circleId, integrationId) =>
    request('get', `/circles/${circleId}/integrations/${integrationId}`),

  /**
   * Create integration
   * @param {string} circleId - Circle ID
   * @param {Object} data - Integration data
   */
  createIntegration: (circleId, data) =>
    request('post', `/circles/${circleId}/integrations`, data),

  /**
   * Update integration
   * @param {string} circleId - Circle ID
   * @param {string} integrationId - Integration ID
   * @param {Object} data - Update data
   */
  updateIntegration: (circleId, integrationId, data) =>
    request('put', `/circles/${circleId}/integrations/${integrationId}`, data),

  /**
   * Delete integration
   * @param {string} circleId - Circle ID
   * @param {string} integrationId - Integration ID
   */
  deleteIntegration: (circleId, integrationId) =>
    request('delete', `/circles/${circleId}/integrations/${integrationId}`),

  /**
   * Sync integration sensors
   * @param {string} circleId - Circle ID
   * @param {string} integrationId - Integration ID
   */
  syncSensors: (circleId, integrationId) =>
    request('post', `/circles/${circleId}/integrations/${integrationId}/sync`)
};

export default { circleAPI, homeAPI, zoneAPI, sensorAPI, integrationAPI };
