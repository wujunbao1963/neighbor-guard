// ============================================================================
// NotificationPolicy Service
// Phase 2.1: Decision logic for notification levels
// 
// Takes ML/heuristic score + event attributes and decides final notification level.
// Enforces safety floors for critical events (e.g., break-in always notifies).
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  // Safety floors - these event types ALWAYS get at least this notification level
  // regardless of ML score (cannot be silenced by ML)
  // Aligned with PRD 6 event types + safety events
  SAFETY_FLOORS: {
    // Security events - cannot be fully suppressed
    'break_in_attempt': 'NORMAL',
    'perimeter_damage': 'NORMAL',
    
    // Safety events - always HIGH priority
    'fire_detected': 'HIGH',
    'co_detected': 'HIGH',
    'water_leak_detected': 'NORMAL',
    
    // Suspicious activity - at least log (NONE means record only)
    'suspicious_person': 'NONE',   // Can be suppressed, but recorded
    'suspicious_vehicle': 'NONE',
    
    // Package events - usually want to know
    'package_delivered': 'NONE',
    'package_taken': 'NONE',
    
    // Audio events - context dependent
    'unusual_noise': 'NONE',
    
    // Motion - can be fully suppressed
    'motion_detected': 'NONE'
  },

  // Fusion rules that have safety floors (override event type floors)
  SAFETY_FLOOR_RULES: {
    // Break-in rules - always notify
    'R1_BREAKIN_DOOR_PIR': 'NORMAL',
    'R2_BREAKIN_GLASS_PERSON': 'NORMAL',
    'R3_BREAKIN_INTRUSION_FLAG': 'NORMAL',
    
    // Safety rules - always HIGH
    'R14_FIRE_DETECTED': 'HIGH',
    'R15_CO_DETECTED': 'HIGH',
    'R16_WATER_LEAK': 'NORMAL',
    
    // Glass break without person - still important
    'R4_PERIMETER_GLASS_ONLY': 'NORMAL'
  },

  // Score thresholds by house mode
  // Format: { HIGH: threshold, NORMAL: threshold }
  // Score >= HIGH threshold → HIGH notification
  // Score >= NORMAL threshold → NORMAL notification  
  // Score < NORMAL threshold → NONE (suppressed)
  THRESHOLDS: {
    DISARMED: {
      HIGH: 0.95,     // Only critical events break through
      NORMAL: 0.85    // Very high bar when disarmed
    },
    HOME: {
      HIGH: 0.85,
      NORMAL: 0.5     // Medium bar when home
    },
    AWAY: {
      HIGH: 0.7,
      NORMAL: 0.3     // Low bar when away - notify more
    },
    NIGHT: {
      HIGH: 0.75,
      NORMAL: 0.4     // Medium-low bar at night
    }
  },

  // High severity events get a score boost before threshold comparison
  SEVERITY_BOOST: {
    HIGH: 0.15,
    MEDIUM: 0,
    LOW: -0.1
  }
};

// ============================================================================
// NOTIFICATION LEVELS
// ============================================================================
const NOTIFICATION_LEVELS = {
  NONE: 'NONE',       // No notification (event still recorded)
  NORMAL: 'NORMAL',   // Standard notification
  HIGH: 'HIGH'        // Urgent notification (sound, vibration, etc.)
};

// ============================================================================
// NOTIFICATION POLICY CLASS
// ============================================================================
class NotificationPolicy {
  constructor(config = CONFIG) {
    this.config = config;
  }

  /**
   * Decide the final notification level for an event
   * @param {Object} params
   * @param {number} params.score - ML/heuristic score (0-1)
   * @param {string} params.eventType - Event type
   * @param {string} params.severity - Event severity (HIGH/MEDIUM/LOW)
   * @param {string} params.houseMode - Current house mode
   * @param {string} params.fusionRule - Fusion rule that triggered (optional)
   * @param {boolean} params.hasGlassBreak - Glass break sensor triggered
   * @returns {{level: string, reason: string, wasOverridden: boolean, originalLevel: string}}
   */
  decide(params) {
    const {
      score,
      eventType,
      severity = 'MEDIUM',
      houseMode = 'HOME',
      fusionRule = null,
      hasGlassBreak = false
    } = params;

    // ========================================================================
    // STEP 1: Calculate score-based level
    // ========================================================================
    const thresholds = this.config.THRESHOLDS[houseMode] || this.config.THRESHOLDS.HOME;
    const severityBoost = this.config.SEVERITY_BOOST[severity] || 0;
    const adjustedScore = Math.min(1, score + severityBoost);

    let scoreBasedLevel;
    if (adjustedScore >= thresholds.HIGH) {
      scoreBasedLevel = NOTIFICATION_LEVELS.HIGH;
    } else if (adjustedScore >= thresholds.NORMAL) {
      scoreBasedLevel = NOTIFICATION_LEVELS.NORMAL;
    } else {
      scoreBasedLevel = NOTIFICATION_LEVELS.NONE;
    }

    // ========================================================================
    // STEP 2: Check safety floors (cannot be overridden by ML)
    // ========================================================================
    let safetyFloor = null;
    let safetyReason = null;

    // Check event type safety floor
    if (this.config.SAFETY_FLOORS[eventType]) {
      safetyFloor = this.config.SAFETY_FLOORS[eventType];
      safetyReason = `Event type "${eventType}" has safety floor`;
    }

    // Check fusion rule safety floor
    if (fusionRule && this.config.SAFETY_FLOOR_RULES[fusionRule]) {
      const ruleFloor = this.config.SAFETY_FLOOR_RULES[fusionRule];
      if (!safetyFloor || this.compareLevels(ruleFloor, safetyFloor) > 0) {
        safetyFloor = ruleFloor;
        safetyReason = `Fusion rule "${fusionRule}" has safety floor`;
      }
    }

    // Glass break always triggers safety floor
    if (hasGlassBreak) {
      if (!safetyFloor || this.compareLevels('HIGH', safetyFloor) > 0) {
        safetyFloor = NOTIFICATION_LEVELS.HIGH;
        safetyReason = 'Glass break detected';
      }
    }

    // ========================================================================
    // STEP 3: Apply safety floor if needed
    // ========================================================================
    let finalLevel = scoreBasedLevel;
    let wasOverridden = false;

    if (safetyFloor && this.compareLevels(safetyFloor, scoreBasedLevel) > 0) {
      finalLevel = safetyFloor;
      wasOverridden = true;
    }

    // ========================================================================
    // STEP 4: Build response
    // ========================================================================
    let reason;
    if (wasOverridden) {
      reason = `${safetyReason} - upgraded from ${scoreBasedLevel} to ${finalLevel}`;
    } else if (finalLevel === NOTIFICATION_LEVELS.NONE) {
      reason = `Score ${adjustedScore.toFixed(2)} below threshold ${thresholds.NORMAL} for ${houseMode} mode`;
    } else {
      reason = `Score ${adjustedScore.toFixed(2)} meets ${finalLevel} threshold for ${houseMode} mode`;
    }

    return {
      level: finalLevel,
      reason,
      wasOverridden,
      originalLevel: scoreBasedLevel,
      adjustedScore,
      thresholds
    };
  }

  /**
   * Compare notification levels
   * @returns {number} positive if a > b, negative if a < b, 0 if equal
   */
  compareLevels(a, b) {
    const order = { NONE: 0, NORMAL: 1, HIGH: 2 };
    return (order[a] || 0) - (order[b] || 0);
  }

  /**
   * Check if notification should be sent based on user preferences
   * @param {string} level - Notification level
   * @param {Object} userPrefs - User notification preferences
   * @returns {boolean}
   */
  shouldNotifyUser(level, userPrefs = {}) {
    const { high = true, medium = true, low = false } = userPrefs;
    
    switch (level) {
      case NOTIFICATION_LEVELS.HIGH:
        return high;
      case NOTIFICATION_LEVELS.NORMAL:
        return medium;
      case NOTIFICATION_LEVELS.NONE:
        return low;
      default:
        return false;
    }
  }

  /**
   * Get configuration for display/debugging
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update thresholds (for future per-house calibration)
   */
  updateThresholds(houseMode, thresholds) {
    if (this.config.THRESHOLDS[houseMode]) {
      this.config.THRESHOLDS[houseMode] = {
        ...this.config.THRESHOLDS[houseMode],
        ...thresholds
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================
const notificationPolicy = new NotificationPolicy();

module.exports = {
  notificationPolicy,
  NotificationPolicy,
  NOTIFICATION_LEVELS,
  CONFIG
};
