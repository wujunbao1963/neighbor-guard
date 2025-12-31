// ============================================================================
// House Mode Constants
// House mode definitions for NeighborGuard
// ============================================================================

/**
 * House modes - matches Prisma enum HouseMode
 */
const HouseMode = {
  DISARMED: 'DISARMED',
  HOME: 'HOME',
  AWAY: 'AWAY',
  NIGHT: 'NIGHT'
};

/**
 * Notification level thresholds by house mode
 * Score thresholds for each notification level in each mode
 */
const MODE_NOTIFICATION_THRESHOLDS = {
  [HouseMode.DISARMED]: {
    HIGH: 0.95,    // Almost never notify
    NORMAL: 0.85,  // Very high bar
    NONE: 0.0
  },
  [HouseMode.HOME]: {
    HIGH: 0.7,     // Medium-high bar
    NORMAL: 0.5,   // Medium bar
    NONE: 0.0
  },
  [HouseMode.AWAY]: {
    HIGH: 0.5,     // Low bar - notify more often
    NORMAL: 0.3,   // Very low bar
    NONE: 0.0
  },
  [HouseMode.NIGHT]: {
    HIGH: 0.6,     // Medium-low bar
    NORMAL: 0.4,   // Low bar
    NONE: 0.0
  }
};

/**
 * Modes where security is heightened (AWAY, NIGHT)
 */
const HEIGHTENED_SECURITY_MODES = [
  HouseMode.AWAY,
  HouseMode.NIGHT
];

/**
 * Modes where normal activity is expected (HOME, DISARMED)
 */
const RELAXED_MODES = [
  HouseMode.HOME,
  HouseMode.DISARMED
];

/**
 * Mode descriptions
 */
const MODE_DESCRIPTIONS = {
  [HouseMode.DISARMED]: 'System disarmed - minimal notifications',
  [HouseMode.HOME]: 'At home - moderate sensitivity',
  [HouseMode.AWAY]: 'Away from home - maximum sensitivity',
  [HouseMode.NIGHT]: 'Night mode - high sensitivity'
};

/**
 * Check if mode has heightened security
 * @param {string} mode - House mode
 * @returns {boolean}
 */
function isHeightenedSecurity(mode) {
  return HEIGHTENED_SECURITY_MODES.includes(mode);
}

/**
 * Check if mode is relaxed
 * @param {string} mode - House mode
 * @returns {boolean}
 */
function isRelaxedMode(mode) {
  return RELAXED_MODES.includes(mode);
}

/**
 * Get notification threshold for a mode and level
 * @param {string} mode - House mode
 * @param {string} level - Notification level ('HIGH' or 'NORMAL')
 * @returns {number} Score threshold
 */
function getNotificationThreshold(mode, level) {
  const modeThresholds = MODE_NOTIFICATION_THRESHOLDS[mode];
  if (!modeThresholds) return 0.5; // Default
  return modeThresholds[level] || 0.5;
}

/**
 * Get mode description
 * @param {string} mode - House mode
 * @returns {string}
 */
function getModeDescription(mode) {
  return MODE_DESCRIPTIONS[mode] || mode;
}

module.exports = {
  HouseMode,
  MODE_NOTIFICATION_THRESHOLDS,
  HEIGHTENED_SECURITY_MODES,
  RELAXED_MODES,
  MODE_DESCRIPTIONS,
  isHeightenedSecurity,
  isRelaxedMode,
  getNotificationThreshold,
  getModeDescription
};
