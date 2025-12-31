// ============================================================================
// Event Type Constants
// Security event type definitions for NeighborGuard
// ============================================================================

/**
 * Security event types - matches Prisma enum SecurityEventType
 * Aligned with PRD 6 core event types + extensions
 */
const EventType = {
  // PRD Core Events
  BREAK_IN_ATTEMPT: 'break_in_attempt',
  PERIMETER_DAMAGE: 'perimeter_damage',
  SUSPICIOUS_PERSON: 'suspicious_person',
  SUSPICIOUS_VEHICLE: 'suspicious_vehicle',
  UNUSUAL_NOISE: 'unusual_noise',
  PACKAGE_DELIVERED: 'package_delivered',
  PACKAGE_TAKEN: 'package_taken',
  
  // Safety Events
  FIRE_DETECTED: 'fire_detected',
  CO_DETECTED: 'co_detected',
  WATER_LEAK_DETECTED: 'water_leak_detected',
  
  // Generic Events
  MOTION_DETECTED: 'motion_detected',
  CUSTOM_EVENT: 'custom_event'
};

/**
 * Event type priority for upgrading/merging events
 * Higher number = higher priority
 */
const EVENT_TYPE_PRIORITY = {
  [EventType.FIRE_DETECTED]: 100,
  [EventType.CO_DETECTED]: 100,
  [EventType.WATER_LEAK_DETECTED]: 90,
  [EventType.BREAK_IN_ATTEMPT]: 80,
  [EventType.PERIMETER_DAMAGE]: 70,
  [EventType.SUSPICIOUS_PERSON]: 60,
  [EventType.SUSPICIOUS_VEHICLE]: 50,
  [EventType.UNUSUAL_NOISE]: 40,
  [EventType.PACKAGE_TAKEN]: 35,
  [EventType.PACKAGE_DELIVERED]: 30,
  [EventType.MOTION_DETECTED]: 10,
  [EventType.CUSTOM_EVENT]: 5
};

/**
 * Event severity levels
 */
const EventSeverity = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

/**
 * Event status lifecycle
 */
const EventStatus = {
  OPEN: 'OPEN',
  ACKED: 'ACKED',
  WATCHING: 'WATCHING',
  RESOLVED: 'RESOLVED',
  FALSE_ALARM: 'FALSE_ALARM'
};

/**
 * Event source types
 */
const EventSource = {
  SENSOR: 'SENSOR',
  MANUAL: 'MANUAL',
  FUSION: 'FUSION',
  SYSTEM: 'SYSTEM'
};

/**
 * Safety event types (always high priority)
 */
const SAFETY_EVENT_TYPES = [
  EventType.FIRE_DETECTED,
  EventType.CO_DETECTED,
  EventType.WATER_LEAK_DETECTED
];

/**
 * Security event types (break-in related)
 */
const SECURITY_EVENT_TYPES = [
  EventType.BREAK_IN_ATTEMPT,
  EventType.PERIMETER_DAMAGE,
  EventType.SUSPICIOUS_PERSON,
  EventType.SUSPICIOUS_VEHICLE
];

/**
 * Check if event type should upgrade another
 * @param {string} currentType - Current event type
 * @param {string} newType - New event type to compare
 * @returns {boolean} True if newType should replace currentType
 */
function shouldUpgradeEventType(currentType, newType) {
  const currentPriority = EVENT_TYPE_PRIORITY[currentType] || 0;
  const newPriority = EVENT_TYPE_PRIORITY[newType] || 0;
  return newPriority > currentPriority;
}

/**
 * Check if event type is a safety event
 * @param {string} eventType - Event type to check
 * @returns {boolean}
 */
function isSafetyEvent(eventType) {
  return SAFETY_EVENT_TYPES.includes(eventType);
}

/**
 * Check if event type is a security event
 * @param {string} eventType - Event type to check
 * @returns {boolean}
 */
function isSecurityEvent(eventType) {
  return SECURITY_EVENT_TYPES.includes(eventType);
}

/**
 * Get event type display name
 * @param {string} eventType - Event type
 * @returns {string} Human-readable name
 */
function getEventTypeDisplayName(eventType) {
  const displayNames = {
    [EventType.BREAK_IN_ATTEMPT]: 'Break-in Attempt',
    [EventType.PERIMETER_DAMAGE]: 'Perimeter Damage',
    [EventType.SUSPICIOUS_PERSON]: 'Suspicious Person',
    [EventType.SUSPICIOUS_VEHICLE]: 'Suspicious Vehicle',
    [EventType.UNUSUAL_NOISE]: 'Unusual Noise',
    [EventType.PACKAGE_DELIVERED]: 'Package Delivered',
    [EventType.PACKAGE_TAKEN]: 'Package Taken',
    [EventType.FIRE_DETECTED]: 'Fire Detected',
    [EventType.CO_DETECTED]: 'CO Detected',
    [EventType.WATER_LEAK_DETECTED]: 'Water Leak',
    [EventType.MOTION_DETECTED]: 'Motion Detected',
    [EventType.CUSTOM_EVENT]: 'Custom Event'
  };
  return displayNames[eventType] || eventType;
}

module.exports = {
  EventType,
  EventSeverity,
  EventStatus,
  EventSource,
  EVENT_TYPE_PRIORITY,
  SAFETY_EVENT_TYPES,
  SECURITY_EVENT_TYPES,
  shouldUpgradeEventType,
  isSafetyEvent,
  isSecurityEvent,
  getEventTypeDisplayName
};
