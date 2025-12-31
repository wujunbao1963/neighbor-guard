// ============================================================================
// NotificationScorer Service
// Phase 2.1: Heuristic-based scoring with ML upgrade path
// 
// This service predicts the "notification value" of an event (0-1 score).
// Currently uses rule-based heuristics that improve with feedback data.
// Will seamlessly upgrade to ML model when sufficient training data exists.
// ============================================================================

const prisma = require('../config/database');

// ============================================================================
// CONFIGURATION - Aligned with PRD
// ============================================================================
const CONFIG = {
  // Minimum feedback samples needed before using historical rates
  MIN_SAMPLES_FOR_STATS: 10,
  
  // Minimum samples needed to consider ML training
  MIN_SAMPLES_FOR_ML: 500,
  
  // Cache TTL for stats (5 minutes)
  STATS_CACHE_TTL_MS: 5 * 60 * 1000,
  
  // Score thresholds for heuristics
  BASELINE_SCORE: 0.5,
  
  // Privacy level weights (higher privacy = more important event)
  PRIVACY_WEIGHTS: {
    'PUBLIC': 0,            // Street, sidewalk - low importance
    'SEMI_PRIVATE': 0.05,   // Front yard, driveway - slight boost
    'PRIVATE': 0.15,        // Backyard - notable boost
    'RESTRICTED': 0.25      // Interior, garage - high boost
  },

  // Sensor type categories for scoring
  SENSOR_CATEGORIES: {
    // High-value sensors (strong signal)
    HIGH_VALUE: ['GLASS_BREAK', 'MIC_GLASS_BREAK', 'SMOKE', 'CO_DETECTOR'],
    // Door/entry sensors
    DOOR_SENSORS: ['DOOR_CONTACT', 'WINDOW_CONTACT', 'LOCK'],
    // Motion sensors
    MOTION_SENSORS: ['PIR', 'CAMERA_MOTION'],
    // AI detection sensors (more reliable than basic motion)
    AI_SENSORS: ['CAMERA_PERSON', 'CAMERA_VEHICLE', 'CAMERA_PACKAGE', 'CAMERA_ANIMAL'],
    // Audio sensors
    AUDIO_SENSORS: ['MIC_UNUSUAL_NOISE', 'MIC_BABY_CRY', 'MIC_GLASS_BREAK']
  },

  // Event type base scores (before other factors)
  EVENT_TYPE_SCORES: {
    'break_in_attempt': 0.9,
    'perimeter_damage': 0.7,
    'suspicious_person': 0.6,
    'suspicious_vehicle': 0.5,
    'unusual_noise': 0.4,
    'package_delivered': 0.3,
    'package_taken': 0.4,
    'fire_detected': 1.0,
    'co_detected': 1.0,
    'water_leak_detected': 0.8,
    'motion_detected': 0.3
  },

  // Feature weights (will be replaced by ML coefficients)
  WEIGHTS: {
    // Negative factors (reduce score)
    highFalseAlarmType: -0.25,      // Event type has >60% false alarm rate
    highFalseAlarmHour: -0.15,      // Hour has >60% false alarm rate
    singleSensor: -0.1,             // Only one sensor triggered
    disarmedMode: -0.3,             // House is disarmed
    publicZoneOnly: -0.1,           // Only triggered in public zones
    basicMotionOnly: -0.15,         // Only basic motion (no AI detection)
    
    // Positive factors (increase score)
    multiSensor: 0.2,               // Multiple sensors triggered
    doorPlusPir: 0.25,              // Door contact + PIR combo
    doorPlusCameraPerson: 0.3,      // Door + AI person detection
    privateZoneDwell: 0.15,         // Spent time in private zone
    restrictedZone: 0.2,            // Entered restricted zone (interior)
    awayMode: 0.2,                  // House is in AWAY mode
    nightMode: 0.15,                // House is in NIGHT mode
    highSeverityEvent: 0.2,         // Event marked as HIGH severity
    aiDetection: 0.15,              // Has AI detection (person/vehicle)
    hasIntrusionFlag: 0.25,         // Camera flagged as intrusion
    hasLoiteringFlag: 0.15,         // Camera flagged as loitering
    
    // Override factors (set score directly)
    glassBreak: 1.0,                // Glass break → always notify (set score to 1)
    breakInAttempt: 0.9,            // Break-in pattern → very high score
    safetyEvent: 1.0,               // Fire/CO/Water → always highest priority
  }
};

// ============================================================================
// STATS CACHE
// ============================================================================
class StatsCache {
  constructor() {
    this.cache = new Map();
  }

  getKey(circleId, homeId) {
    return `${circleId}:${homeId}`;
  }

  get(circleId, homeId) {
    const key = this.getKey(circleId, homeId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CONFIG.STATS_CACHE_TTL_MS) {
      return cached.stats;
    }
    return null;
  }

  set(circleId, homeId, stats) {
    const key = this.getKey(circleId, homeId);
    this.cache.set(key, { stats, timestamp: Date.now() });
  }

  invalidate(circleId, homeId) {
    const key = this.getKey(circleId, homeId);
    this.cache.delete(key);
  }
}

const statsCache = new StatsCache();

// ============================================================================
// NOTIFICATION SCORER CLASS
// ============================================================================
class NotificationScorer {
  constructor() {
    this.mlModel = null;  // Will hold trained model when available
    this.useML = false;   // Flag to switch to ML mode
  }

  // ==========================================================================
  // MAIN PREDICTION METHOD
  // ==========================================================================
  /**
   * Predict the notification value score for an event
   * @param {Object} params - Event parameters
   * @param {string} params.circleId - Circle ID
   * @param {string} params.homeId - Home ID
   * @param {string} params.eventType - Event type (e.g., 'suspicious_person')
   * @param {string} params.severity - Event severity (HIGH/MEDIUM/LOW)
   * @param {string} params.houseMode - Current house mode
   * @param {string} params.fusionRule - Fusion rule that triggered (if any)
   * @param {number} params.sensorCount - Number of sensors involved
   * @param {boolean} params.hasDoorContact - Door sensor triggered
   * @param {boolean} params.hasInsideMotion - Indoor PIR triggered
   * @param {boolean} params.hasGlassBreak - Glass break sensor triggered
   * @param {boolean} params.hasPrivateZone - Entered private zone
   * @param {string} params.maxPrivacyLevel - Highest privacy level reached (PUBLIC/SEMI_PRIVATE/PRIVATE/RESTRICTED)
   * @param {number} params.dwellPrivateSec - Seconds in private zone
   * @param {number} params.hourBucket - Hour of day (0-23)
   * @returns {Promise<{score: number, method: string, factors: Object}>}
   */
  async predict(params) {
    const {
      circleId,
      homeId,
      eventType,
      severity,
      houseMode,
      fusionRule,
      sensorCount = 1,
      hasDoorContact = false,
      hasInsideMotion = false,
      hasGlassBreak = false,
      hasPrivateZone = false,
      maxPrivacyLevel = 'SEMI_PRIVATE',
      dwellPrivateSec = 0,
      hourBucket = new Date().getHours()
    } = params;

    // Check if ML model is available and should be used
    if (this.useML && this.mlModel) {
      return this.predictWithML(params);
    }

    // Use heuristic-based scoring
    return this.predictWithHeuristics({
      circleId,
      homeId,
      eventType,
      severity,
      houseMode,
      fusionRule,
      sensorCount,
      hasDoorContact,
      hasInsideMotion,
      hasGlassBreak,
      hasPrivateZone,
      maxPrivacyLevel,
      dwellPrivateSec,
      hourBucket
    });
  }

  // ==========================================================================
  // HEURISTIC-BASED PREDICTION
  // ==========================================================================
  async predictWithHeuristics(params) {
    const {
      circleId,
      homeId,
      eventType,
      severity,
      houseMode,
      fusionRule,
      sensorCount,
      hasDoorContact,
      hasInsideMotion,
      hasGlassBreak,
      hasPrivateZone,
      maxPrivacyLevel,
      dwellPrivateSec,
      hourBucket
    } = params;

    const factors = {};
    let score = CONFIG.BASELINE_SCORE;

    // ========================================================================
    // HARD OVERRIDES (these take precedence)
    // ========================================================================
    
    // Glass break → always high priority
    if (hasGlassBreak) {
      factors.glassBreak = CONFIG.WEIGHTS.glassBreak;
      return {
        score: 1.0,
        method: 'heuristic',
        factors,
        reason: 'Glass break detected - always notify'
      };
    }

    // Break-in attempt pattern → very high priority
    if (fusionRule === 'R1_BREAKIN_DOOR_PIR' || fusionRule === 'R2_BREAKIN_GLASS') {
      factors.breakInAttempt = CONFIG.WEIGHTS.breakInAttempt;
      score = Math.max(score, 0.9);
    }

    // ========================================================================
    // HISTORICAL STATS (learned from feedback)
    // ========================================================================
    const stats = await this.getHistoricalStats(circleId, homeId);
    
    if (stats && stats.totalSamples >= CONFIG.MIN_SAMPLES_FOR_STATS) {
      // Check event type false alarm rate
      const typeRate = stats.falseRateByType[eventType];
      if (typeRate !== undefined && typeRate > 0.6) {
        factors.highFalseAlarmType = CONFIG.WEIGHTS.highFalseAlarmType;
        score += CONFIG.WEIGHTS.highFalseAlarmType;
      }

      // Check hour false alarm rate
      const hourRate = stats.falseRateByHour[hourBucket];
      if (hourRate !== undefined && hourRate > 0.6) {
        factors.highFalseAlarmHour = CONFIG.WEIGHTS.highFalseAlarmHour;
        score += CONFIG.WEIGHTS.highFalseAlarmHour;
      }
    }

    // ========================================================================
    // PRIVACY LEVEL FACTORS (key feature!)
    // Higher privacy = more sensitive area = higher score
    // ========================================================================
    const privacyWeight = CONFIG.PRIVACY_WEIGHTS[maxPrivacyLevel] || 0;
    if (privacyWeight !== 0) {
      factors.privacyLevel = { level: maxPrivacyLevel, weight: privacyWeight };
      score += privacyWeight;
    }

    // Public zone only is less concerning (negative weight already in PRIVACY_WEIGHTS for PUBLIC = 0)
    if (maxPrivacyLevel === 'PUBLIC' && !hasPrivateZone) {
      factors.publicZoneOnly = CONFIG.WEIGHTS.publicZoneOnly;
      score += CONFIG.WEIGHTS.publicZoneOnly;
    }

    // Restricted zone (interior) is very concerning
    if (maxPrivacyLevel === 'RESTRICTED') {
      factors.restrictedZone = CONFIG.WEIGHTS.restrictedZone;
      score += CONFIG.WEIGHTS.restrictedZone;
    }

    // ========================================================================
    // CONTEXT FACTORS
    // ========================================================================

    // House mode
    if (houseMode === 'DISARMED') {
      factors.disarmedMode = CONFIG.WEIGHTS.disarmedMode;
      score += CONFIG.WEIGHTS.disarmedMode;
    } else if (houseMode === 'AWAY') {
      factors.awayMode = CONFIG.WEIGHTS.awayMode;
      score += CONFIG.WEIGHTS.awayMode;
    } else if (houseMode === 'NIGHT') {
      factors.nightMode = CONFIG.WEIGHTS.nightMode;
      score += CONFIG.WEIGHTS.nightMode;
    }

    // Severity
    if (severity === 'HIGH') {
      factors.highSeverityEvent = CONFIG.WEIGHTS.highSeverityEvent;
      score += CONFIG.WEIGHTS.highSeverityEvent;
    }

    // ========================================================================
    // SENSOR FACTORS
    // ========================================================================

    // Single sensor is less credible
    if (sensorCount === 1) {
      factors.singleSensor = CONFIG.WEIGHTS.singleSensor;
      score += CONFIG.WEIGHTS.singleSensor;
    } else if (sensorCount >= 2) {
      factors.multiSensor = CONFIG.WEIGHTS.multiSensor;
      score += CONFIG.WEIGHTS.multiSensor;
    }

    // Door + PIR combo is strong signal
    if (hasDoorContact && hasInsideMotion) {
      factors.doorPlusPir = CONFIG.WEIGHTS.doorPlusPir;
      score += CONFIG.WEIGHTS.doorPlusPir;
    }

    // Time spent in private zone
    if (hasPrivateZone && dwellPrivateSec > 10) {
      factors.privateZoneDwell = CONFIG.WEIGHTS.privateZoneDwell;
      score += CONFIG.WEIGHTS.privateZoneDwell;
    }

    // ========================================================================
    // CLAMP AND RETURN
    // ========================================================================
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      method: 'heuristic',
      factors,
      maxPrivacyLevel,
      statsUsed: stats ? stats.totalSamples >= CONFIG.MIN_SAMPLES_FOR_STATS : false
    };
  }

  // ==========================================================================
  // ML-BASED PREDICTION (Future upgrade path)
  // ==========================================================================
  async predictWithML(params) {
    // TODO: Implement when ML model is trained
    // This will use the trained logistic regression coefficients
    // For now, fall back to heuristics
    return this.predictWithHeuristics(params);
  }

  // ==========================================================================
  // HISTORICAL STATS LOADING
  // ==========================================================================
  async getHistoricalStats(circleId, homeId) {
    // Check cache first
    const cached = statsCache.get(circleId, homeId);
    if (cached) return cached;

    try {
      // Get all feedback for this circle
      const feedbacks = await prisma.eventFeedback.findMany({
        where: { circleId },
        include: {
          event: {
            select: {
              eventType: true,
              occurredAt: true
            }
          }
        }
      });

      if (feedbacks.length === 0) {
        return null;
      }

      // Calculate false alarm rates by event type
      const byType = {};
      const byHour = {};

      for (const fb of feedbacks) {
        const type = fb.event.eventType;
        const hour = fb.event.occurredAt.getHours();
        const isFalseAlarm = fb.label === 'FALSE_ALARM';

        // By type
        if (!byType[type]) {
          byType[type] = { total: 0, falseAlarm: 0 };
        }
        byType[type].total++;
        if (isFalseAlarm) byType[type].falseAlarm++;

        // By hour
        if (!byHour[hour]) {
          byHour[hour] = { total: 0, falseAlarm: 0 };
        }
        byHour[hour].total++;
        if (isFalseAlarm) byHour[hour].falseAlarm++;
      }

      // Convert to rates
      const falseRateByType = {};
      for (const [type, data] of Object.entries(byType)) {
        falseRateByType[type] = data.total > 0 ? data.falseAlarm / data.total : 0;
      }

      const falseRateByHour = {};
      for (const [hour, data] of Object.entries(byHour)) {
        falseRateByHour[hour] = data.total > 0 ? data.falseAlarm / data.total : 0;
      }

      const stats = {
        totalSamples: feedbacks.length,
        falseRateByType,
        falseRateByHour,
        overallFalseRate: feedbacks.filter(f => f.label === 'FALSE_ALARM').length / feedbacks.length
      };

      // Cache it
      statsCache.set(circleId, homeId, stats);

      return stats;

    } catch (error) {
      console.error('[NotificationScorer] Error loading stats:', error);
      return null;
    }
  }

  // ==========================================================================
  // ML MODEL MANAGEMENT (Future)
  // ==========================================================================
  
  /**
   * Check if we have enough data to train ML model
   */
  async checkMLReadiness(circleId) {
    const count = await prisma.eventFeedback.count({
      where: { circleId }
    });

    return {
      ready: count >= CONFIG.MIN_SAMPLES_FOR_ML,
      currentSamples: count,
      requiredSamples: CONFIG.MIN_SAMPLES_FOR_ML,
      percentComplete: Math.min(100, Math.round(count / CONFIG.MIN_SAMPLES_FOR_ML * 100))
    };
  }

  /**
   * Load a trained ML model (future implementation)
   */
  async loadMLModel(modelPath) {
    // TODO: Load trained model coefficients
    // this.mlModel = await loadModel(modelPath);
    // this.useML = true;
    console.log('[NotificationScorer] ML model loading not yet implemented');
  }

  /**
   * Invalidate stats cache when new feedback is received
   */
  invalidateCache(circleId, homeId) {
    statsCache.invalidate(circleId, homeId);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================
const notificationScorer = new NotificationScorer();

module.exports = {
  notificationScorer,
  NotificationScorer,
  CONFIG
};
