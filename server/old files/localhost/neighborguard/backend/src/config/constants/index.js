// ============================================================================
// Constants Index
// Central export for all constants
// ============================================================================

const sensorTypes = require('./sensorTypes');
const eventTypes = require('./eventTypes');
const zoneTypes = require('./zoneTypes');
const houseModes = require('./houseModes');

module.exports = {
  // Sensor types
  ...sensorTypes,
  
  // Event types
  ...eventTypes,
  
  // Zone types
  ...zoneTypes,
  
  // House modes
  ...houseModes,
  
  // Notification levels
  NotificationLevel: {
    HIGH: 'HIGH',
    NORMAL: 'NORMAL',
    NONE: 'NONE'
  },
  
  // Fusion configuration
  FusionConfig: {
    TRACK_WINDOW_SECONDS: 120,    // Time window for grouping events
    TRACK_GAP_SECONDS: 60,        // Gap before new track
    DWELL_THRESHOLD_PERSON: 20,   // Seconds for suspicious person
    DWELL_THRESHOLD_VEHICLE: 120, // Seconds for suspicious vehicle
    DWELL_THRESHOLD_VEHICLE_SEVERE: 300
  },
  
  // API configuration
  ApiConfig: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    TOKEN_EXPIRY_HOURS: 24,
    REFRESH_TOKEN_EXPIRY_DAYS: 30
  }
};
