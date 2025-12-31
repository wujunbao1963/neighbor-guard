// ============================================================================
// API Services Index
// Central export for all API modules
// ============================================================================

// Client and utilities
export { 
  default as client,
  request,
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  getUserId,
  setUserId,
  getCircleId,
  setCircleId,
  clearAuthData
} from './client';

// API modules
export { authAPI } from './auth.api';
export { eventAPI } from './events.api';
export { circleAPI, homeAPI, zoneAPI, sensorAPI, integrationAPI } from './circles.api';

// Default export with all APIs
import { authAPI } from './auth.api';
import { eventAPI } from './events.api';
import { circleAPI, homeAPI, zoneAPI, sensorAPI, integrationAPI } from './circles.api';

export default {
  auth: authAPI,
  events: eventAPI,
  circles: circleAPI,
  homes: homeAPI,
  zones: zoneAPI,
  sensors: sensorAPI,
  integrations: integrationAPI
};
