// ============================================================================
// Sensor Type Constants
// Organized sensor type definitions for NeighborGuard
// ============================================================================

/**
 * All sensor types supported by the system
 * Matches Prisma enum SensorType
 */
const SensorType = {
  // Physical contact sensors
  DOOR_CONTACT: 'DOOR_CONTACT',
  WINDOW_CONTACT: 'WINDOW_CONTACT',
  LOCK: 'LOCK',
  
  // Motion sensors
  PIR: 'PIR',
  
  // Break sensors
  GLASS_BREAK: 'GLASS_BREAK',
  VIBRATION: 'VIBRATION',
  
  // Safety sensors
  SMOKE: 'SMOKE',
  CO_DETECTOR: 'CO_DETECTOR',
  WATER_LEAK: 'WATER_LEAK',
  
  // Camera AI classifications
  CAMERA_MOTION: 'CAMERA_MOTION',
  CAMERA_PERSON: 'CAMERA_PERSON',
  CAMERA_VEHICLE: 'CAMERA_VEHICLE',
  CAMERA_PACKAGE: 'CAMERA_PACKAGE',
  CAMERA_ANIMAL: 'CAMERA_ANIMAL',
  
  // Audio sensors
  MIC_UNUSUAL_NOISE: 'MIC_UNUSUAL_NOISE',
  MIC_BABY_CRY: 'MIC_BABY_CRY',
  MIC_GLASS_BREAK: 'MIC_GLASS_BREAK',
  
  // Generic
  GENERIC_SENSOR: 'GENERIC_SENSOR',
  OTHER: 'OTHER'
};

/**
 * Sensor categories for rule matching
 */
const SensorCategory = {
  DOOR_SENSORS: [
    SensorType.DOOR_CONTACT,
    SensorType.WINDOW_CONTACT,
    SensorType.LOCK
  ],
  
  MOTION_SENSORS: [
    SensorType.PIR,
    SensorType.CAMERA_MOTION
  ],
  
  PERSON_SENSORS: [
    SensorType.CAMERA_PERSON,
    SensorType.PIR
  ],
  
  VEHICLE_SENSORS: [
    SensorType.CAMERA_VEHICLE
  ],
  
  PACKAGE_SENSORS: [
    SensorType.CAMERA_PACKAGE
  ],
  
  GLASS_BREAK_SENSORS: [
    SensorType.GLASS_BREAK,
    SensorType.MIC_GLASS_BREAK
  ],
  
  AUDIO_SENSORS: [
    SensorType.MIC_UNUSUAL_NOISE,
    SensorType.MIC_BABY_CRY,
    SensorType.MIC_GLASS_BREAK
  ],
  
  SAFETY_SENSORS: [
    SensorType.SMOKE,
    SensorType.CO_DETECTOR,
    SensorType.WATER_LEAK
  ],
  
  CAMERA_SENSORS: [
    SensorType.CAMERA_MOTION,
    SensorType.CAMERA_PERSON,
    SensorType.CAMERA_VEHICLE,
    SensorType.CAMERA_PACKAGE,
    SensorType.CAMERA_ANIMAL
  ],
  
  AI_SENSORS: [
    SensorType.CAMERA_PERSON,
    SensorType.CAMERA_VEHICLE,
    SensorType.CAMERA_PACKAGE,
    SensorType.CAMERA_ANIMAL
  ],
  
  HIGH_VALUE_SENSORS: [
    SensorType.GLASS_BREAK,
    SensorType.MIC_GLASS_BREAK,
    SensorType.SMOKE,
    SensorType.CO_DETECTOR
  ]
};

/**
 * Check if a sensor type belongs to a category
 * @param {string} sensorType - The sensor type to check
 * @param {string} category - The category name (e.g., 'DOOR_SENSORS')
 * @returns {boolean}
 */
function isInCategory(sensorType, category) {
  const categoryTypes = SensorCategory[category];
  if (!categoryTypes) return false;
  return categoryTypes.includes(sensorType);
}

/**
 * Get all categories a sensor type belongs to
 * @param {string} sensorType - The sensor type
 * @returns {string[]} Array of category names
 */
function getCategoriesForSensor(sensorType) {
  return Object.entries(SensorCategory)
    .filter(([_, types]) => types.includes(sensorType))
    .map(([category]) => category);
}

/**
 * Sensor status enum
 */
const SensorStatus = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  LOW_BATTERY: 'LOW_BATTERY',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Trigger states that indicate sensor activation
 */
const TRIGGER_STATES = [
  'on', 'open', 'detected', 'triggered', 'motion', 'true', '1', 'active',
  'present', 'not_present', 'delivered', 'taken', 'removed',
  'person', 'vehicle', 'package', 'animal'
];

/**
 * Check if a state value indicates sensor was triggered
 * @param {string} state - The sensor state value
 * @returns {boolean}
 */
function isTriggerState(state) {
  return TRIGGER_STATES.includes(String(state).toLowerCase());
}

module.exports = {
  SensorType,
  SensorCategory,
  SensorStatus,
  TRIGGER_STATES,
  isInCategory,
  getCategoriesForSensor,
  isTriggerState
};
