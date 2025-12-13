// ============================================================================
// Frontend Constants
// Shared constants for the NeighborGuard UI
// ============================================================================

// ============================================================================
// Member Roles
// ============================================================================
export const MEMBER_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  HOUSEHOLD: 'Household',
  NEIGHBOR: 'Neighbor',
  RELATIVE: 'Family/Friend',
  OBSERVER: 'Observer'
};

export const ROLE_OPTIONS = [
  { value: 'HOUSEHOLD', label: 'Household', description: 'Full access to home' },
  { value: 'NEIGHBOR', label: 'Neighbor', description: 'Can report events' },
  { value: 'RELATIVE', label: 'Family/Friend', description: 'View events and alerts' }
];

// ============================================================================
// House Modes
// ============================================================================
export const HOUSE_MODES = [
  { 
    value: 'DISARMED', 
    label: 'Disarmed', 
    icon: '🔓', 
    color: '#22c55e', 
    bgColor: '#dcfce7',
    description: 'All alerts off'
  },
  { 
    value: 'HOME', 
    label: 'Home', 
    icon: '🏠', 
    color: '#3b82f6', 
    bgColor: '#dbeafe',
    description: 'Perimeter protection on'
  },
  { 
    value: 'AWAY', 
    label: 'Away', 
    icon: '🛡️', 
    color: '#f59e0b', 
    bgColor: '#fef3c7',
    description: 'Full protection enabled'
  },
  { 
    value: 'NIGHT', 
    label: 'Night', 
    icon: '🌙', 
    color: '#8b5cf6', 
    bgColor: '#ede9fe',
    description: 'Enhanced night mode'
  }
];

export const getHouseMode = (value) => HOUSE_MODES.find(m => m.value === value);

// ============================================================================
// Event Types
// ============================================================================
export const EVENT_TYPES = {
  break_in_attempt: { 
    label: 'Break-in Attempt', 
    icon: '🚨', 
    color: '#ef4444',
    description: 'Potential intrusion detected'
  },
  perimeter_damage: { 
    label: 'Perimeter Damage', 
    icon: '⚠️', 
    color: '#f97316',
    description: 'Glass break or fence damage'
  },
  suspicious_person: { 
    label: 'Suspicious Person', 
    icon: '👤', 
    color: '#f59e0b',
    description: 'Unknown person loitering'
  },
  suspicious_vehicle: { 
    label: 'Suspicious Vehicle', 
    icon: '🚗', 
    color: '#eab308',
    description: 'Unknown vehicle detected'
  },
  unusual_noise: { 
    label: 'Unusual Noise', 
    icon: '🔊', 
    color: '#84cc16',
    description: 'Unexpected sound detected'
  },
  package_delivered: { 
    label: 'Package Delivered', 
    icon: '📦', 
    color: '#22c55e',
    description: 'Package left at door'
  },
  package_taken: { 
    label: 'Package Taken', 
    icon: '📦', 
    color: '#14b8a6',
    description: 'Package removed'
  },
  fire_detected: { 
    label: 'Fire Detected', 
    icon: '🔥', 
    color: '#ef4444',
    description: 'Smoke or fire alarm'
  },
  co_detected: { 
    label: 'CO Detected', 
    icon: '☣️', 
    color: '#ef4444',
    description: 'Carbon monoxide alarm'
  },
  water_leak_detected: { 
    label: 'Water Leak', 
    icon: '💧', 
    color: '#3b82f6',
    description: 'Water leak detected'
  },
  motion_detected: { 
    label: 'Motion Detected', 
    icon: '👁️', 
    color: '#6b7280',
    description: 'Motion sensor triggered'
  },
  custom_event: { 
    label: 'Custom Event', 
    icon: '📝', 
    color: '#6b7280',
    description: 'User-created event'
  }
};

export const getEventType = (type) => EVENT_TYPES[type] || EVENT_TYPES.custom_event;

// ============================================================================
// Event Severity
// ============================================================================
export const EVENT_SEVERITY = {
  HIGH: { 
    label: 'High', 
    color: '#ef4444', 
    bgColor: '#fef2f2',
    description: 'Immediate attention required'
  },
  MEDIUM: { 
    label: 'Medium', 
    color: '#f59e0b', 
    bgColor: '#fffbeb',
    description: 'Review when possible'
  },
  LOW: { 
    label: 'Low', 
    color: '#64748b', 
    bgColor: '#f8fafc',
    description: 'Informational'
  }
};

export const getSeverity = (severity) => EVENT_SEVERITY[severity] || EVENT_SEVERITY.LOW;

// ============================================================================
// Event Status
// ============================================================================
export const EVENT_STATUS = {
  OPEN: { label: 'Open', color: '#ef4444', bgColor: '#fef2f2' },
  ACKED: { label: 'Acknowledged', color: '#f59e0b', bgColor: '#fffbeb' },
  WATCHING: { label: 'Watching', color: '#3b82f6', bgColor: '#eff6ff' },
  RESOLVED: { label: 'Resolved', color: '#22c55e', bgColor: '#f0fdf4' },
  FALSE_ALARM: { label: 'False Alarm', color: '#6b7280', bgColor: '#f9fafb' }
};

export const getEventStatus = (status) => EVENT_STATUS[status] || EVENT_STATUS.OPEN;

// ============================================================================
// Sensor Types
// ============================================================================
export const SENSOR_TYPES = {
  DOOR_CONTACT: { label: 'Door Contact', icon: '🚪', category: 'entry' },
  WINDOW_CONTACT: { label: 'Window Contact', icon: '🪟', category: 'entry' },
  LOCK: { label: 'Smart Lock', icon: '🔐', category: 'entry' },
  PIR: { label: 'PIR Motion', icon: '👁️', category: 'motion' },
  GLASS_BREAK: { label: 'Glass Break', icon: '💥', category: 'security' },
  VIBRATION: { label: 'Vibration', icon: '📳', category: 'security' },
  SMOKE: { label: 'Smoke Detector', icon: '🔥', category: 'safety' },
  CO_DETECTOR: { label: 'CO Detector', icon: '☣️', category: 'safety' },
  WATER_LEAK: { label: 'Water Leak', icon: '💧', category: 'safety' },
  CAMERA_MOTION: { label: 'Camera Motion', icon: '📹', category: 'camera' },
  CAMERA_PERSON: { label: 'Camera Person', icon: '👤', category: 'camera' },
  CAMERA_VEHICLE: { label: 'Camera Vehicle', icon: '🚗', category: 'camera' },
  CAMERA_PACKAGE: { label: 'Camera Package', icon: '📦', category: 'camera' },
  CAMERA_ANIMAL: { label: 'Camera Animal', icon: '🐕', category: 'camera' },
  MIC_UNUSUAL_NOISE: { label: 'Audio Sensor', icon: '🔊', category: 'audio' },
  OTHER: { label: 'Other', icon: '📡', category: 'other' }
};

export const getSensorType = (type) => SENSOR_TYPES[type] || SENSOR_TYPES.OTHER;

// ============================================================================
// Sensor Status
// ============================================================================
export const SENSOR_STATUS = {
  ONLINE: { label: 'Online', color: '#22c55e', bgColor: '#f0fdf4' },
  OFFLINE: { label: 'Offline', color: '#ef4444', bgColor: '#fef2f2' },
  LOW_BATTERY: { label: 'Low Battery', color: '#f59e0b', bgColor: '#fffbeb' },
  UNKNOWN: { label: 'Unknown', color: '#6b7280', bgColor: '#f9fafb' }
};

export const getSensorStatus = (status) => SENSOR_STATUS[status] || SENSOR_STATUS.UNKNOWN;

// ============================================================================
// Zone Types
// ============================================================================
export const ZONE_TYPES = {
  FRONT_DOOR: { label: 'Front Door', icon: '🚪', category: 'entry' },
  BACK_DOOR: { label: 'Back Door', icon: '🚪', category: 'entry' },
  SIDE_DOOR: { label: 'Side Door', icon: '🚪', category: 'entry' },
  GARAGE_ENTRANCE: { label: 'Garage', icon: '🚗', category: 'entry' },
  FRONT_YARD: { label: 'Front Yard', icon: '🌳', category: 'outdoor' },
  BACK_YARD: { label: 'Back Yard', icon: '🌳', category: 'outdoor' },
  SIDE_YARD: { label: 'Side Yard', icon: '🌳', category: 'outdoor' },
  DRIVEWAY: { label: 'Driveway', icon: '🛣️', category: 'outdoor' },
  PORCH: { label: 'Porch', icon: '🏠', category: 'outdoor' },
  PATIO: { label: 'Patio', icon: '☀️', category: 'outdoor' },
  HALLWAY: { label: 'Hallway', icon: '🚶', category: 'indoor' },
  LIVING_ROOM: { label: 'Living Room', icon: '🛋️', category: 'indoor' },
  BASEMENT: { label: 'Basement', icon: '📦', category: 'indoor' },
  CUSTOM: { label: 'Custom Zone', icon: '📍', category: 'other' }
};

export const getZoneType = (type) => ZONE_TYPES[type] || ZONE_TYPES.CUSTOM;

// ============================================================================
// Privacy Levels
// ============================================================================
export const PRIVACY_LEVELS = {
  PUBLIC: { label: 'Public', color: '#22c55e', description: 'Street-facing, visible to all' },
  SEMI_PRIVATE: { label: 'Semi-Private', color: '#3b82f6', description: 'Front yard, driveway' },
  PRIVATE: { label: 'Private', color: '#f59e0b', description: 'Backyard, side areas' },
  RESTRICTED: { label: 'Restricted', color: '#ef4444', description: 'Indoor, entry points' }
};

export const getPrivacyLevel = (level) => PRIVACY_LEVELS[level] || PRIVACY_LEVELS.SEMI_PRIVATE;

// ============================================================================
// Integration Types
// ============================================================================
export const INTEGRATION_TYPES = {
  HOME_ASSISTANT: { 
    label: 'Home Assistant', 
    icon: '🏠', 
    color: '#41bdf5',
    description: 'Connect your Home Assistant instance'
  },
  GOOGLE_HOME: { 
    label: 'Google Home', 
    icon: '🔵', 
    color: '#4285f4',
    description: 'Connect Google Home devices'
  },
  AMAZON_ALEXA: { 
    label: 'Amazon Alexa', 
    icon: '🔷', 
    color: '#00caff',
    description: 'Connect Alexa devices'
  },
  RING: { 
    label: 'Ring', 
    icon: '🔔', 
    color: '#1c96e8',
    description: 'Connect Ring doorbells and cameras'
  },
  NEST: { 
    label: 'Nest', 
    icon: '🏡', 
    color: '#00afd7',
    description: 'Connect Nest devices'
  }
};

export const getIntegrationType = (type) => INTEGRATION_TYPES[type];

// ============================================================================
// Notification Levels
// ============================================================================
export const NOTIFICATION_LEVELS = {
  HIGH: { label: 'Critical', description: 'Push + Sound + Vibrate' },
  NORMAL: { label: 'Normal', description: 'Push notification' },
  NONE: { label: 'Silent', description: 'No notification' }
};

// ============================================================================
// Feedback Labels
// ============================================================================
export const FEEDBACK_LABELS = {
  ACCURATE: { label: 'Accurate', icon: '✅', description: 'Event was correctly identified' },
  FALSE_ALARM: { label: 'False Alarm', icon: '❌', description: 'No actual threat' },
  MISSED: { label: 'Missed Details', icon: '⚠️', description: 'Something was missed' },
  WRONG_TYPE: { label: 'Wrong Type', icon: '🔄', description: 'Incorrect event classification' }
};

// ============================================================================
// Time Formats
// ============================================================================
export const formatRelativeTime = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(date).toLocaleDateString();
};

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

export const formatDateTime = (date) => {
  return `${formatDate(date)} ${formatTime(date)}`;
};
