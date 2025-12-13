// ============================================================================
// Fusion Rules Index
// Central aggregation of all fusion rules with priority ordering
// ============================================================================

const breakInRules = require('./breakInRules');
const suspiciousRules = require('./suspiciousRules');
const safetyRules = require('./safetyRules');
const otherRules = require('./otherRules');

/**
 * All fusion rules combined
 */
const FUSION_RULES = {
  // Break-in rules
  ...breakInRules,
  
  // Perimeter rules
  R4_PERIMETER_GLASS_ONLY: otherRules.R4_PERIMETER_GLASS_ONLY,
  R5_PERIMETER_VIBRATION: otherRules.R5_PERIMETER_VIBRATION,
  
  // Suspicious activity rules
  ...suspiciousRules,
  
  // Unusual noise
  R11_UNUSUAL_NOISE: otherRules.R11_UNUSUAL_NOISE,
  
  // Package rules
  R12_PACKAGE_DELIVERED: otherRules.R12_PACKAGE_DELIVERED,
  R13_PACKAGE_TAKEN: otherRules.R13_PACKAGE_TAKEN,
  
  // Safety rules
  ...safetyRules,
  
  // Fallback
  R99_MOTION_ALERT: otherRules.R99_MOTION_ALERT
};

/**
 * Rule evaluation priority order
 * Higher priority rules are checked first
 */
const RULE_PRIORITY = [
  // Safety first (always trigger)
  'R14_FIRE_DETECTED',
  'R15_CO_DETECTED',
  'R16_WATER_LEAK',
  
  // Break-in attempts (highest security priority)
  'R1_BREAKIN_DOOR_PIR',
  'R2_BREAKIN_GLASS_PERSON',
  'R3_BREAKIN_INTRUSION_FLAG',
  
  // Perimeter damage
  'R4_PERIMETER_GLASS_ONLY',
  'R5_PERIMETER_VIBRATION',
  
  // Suspicious person
  'R6_SUSPICIOUS_PERSON_DWELL',
  'R7_SUSPICIOUS_PERSON_LOITER_FLAG',
  'R8_SUSPICIOUS_PERSON_BACKYARD',
  
  // Suspicious vehicle
  'R9_SUSPICIOUS_VEHICLE_DWELL',
  'R10_SUSPICIOUS_VEHICLE_REPEATED',
  'R10B_SUSPICIOUS_VEHICLE_LOITER',
  
  // Unusual noise
  'R11_UNUSUAL_NOISE',
  
  // Package events
  'R12_PACKAGE_DELIVERED',
  'R13_PACKAGE_TAKEN',
  
  // Fallback
  'R99_MOTION_ALERT'
];

/**
 * Get a rule by ID
 * @param {string} ruleId - Rule ID
 * @returns {Object|null}
 */
function getRule(ruleId) {
  return FUSION_RULES[ruleId] || null;
}

/**
 * Get rules by event type
 * @param {string} eventType - Event type
 * @returns {Array}
 */
function getRulesByEventType(eventType) {
  return Object.values(FUSION_RULES)
    .filter(rule => rule.eventType === eventType);
}

/**
 * Get rules applicable to a house mode
 * @param {string} houseMode - House mode
 * @returns {Array}
 */
function getRulesForMode(houseMode) {
  return RULE_PRIORITY
    .map(id => FUSION_RULES[id])
    .filter(rule => rule && rule.requiredModes.includes(houseMode));
}

module.exports = {
  FUSION_RULES,
  RULE_PRIORITY,
  getRule,
  getRulesByEventType,
  getRulesForMode
};
