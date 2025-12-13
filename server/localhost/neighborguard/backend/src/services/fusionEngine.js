// ============================================================================
// FusionEngine Service
// Phase 2: Multi-sensor intelligent event generation
// ============================================================================

const prisma = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { notificationScorer } = require('./notificationScorer');
const { notificationPolicy, NOTIFICATION_LEVELS } = require('./notificationPolicy');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Time window for grouping sensor events into the same track (in seconds)
const TRACK_WINDOW_SECONDS = 120; // 2 minutes
const TRACK_GAP_SECONDS = 60;     // Gap before creating new track

// Dwell time thresholds (in seconds) - from PRD
const DWELL_THRESHOLD_SUSPICIOUS_PERSON = 20;   // 20 seconds in private zone = suspicious person
const DWELL_THRESHOLD_SUSPICIOUS_VEHICLE = 120; // 2 minutes for vehicle loitering
const DWELL_THRESHOLD_VEHICLE_SEVERE = 300;     // 5 minutes = severe

// Privacy level hierarchy (higher = more private)
const PRIVACY_HIERARCHY = {
  'PUBLIC': 0,
  'SEMI_PRIVATE': 1,
  'PRIVATE': 2,
  'RESTRICTED': 3
};

// Sensor type categories for quick lookup
const SENSOR_CATEGORIES = {
  DOOR_SENSORS: ['DOOR_CONTACT', 'WINDOW_CONTACT', 'LOCK'],
  MOTION_SENSORS: ['PIR', 'CAMERA_MOTION'],
  PERSON_SENSORS: ['CAMERA_PERSON', 'PIR'],
  VEHICLE_SENSORS: ['CAMERA_VEHICLE'],
  PACKAGE_SENSORS: ['CAMERA_PACKAGE'],
  GLASS_BREAK_SENSORS: ['GLASS_BREAK', 'MIC_GLASS_BREAK'],
  AUDIO_SENSORS: ['MIC_UNUSUAL_NOISE', 'MIC_BABY_CRY', 'MIC_GLASS_BREAK'],
  SAFETY_SENSORS: ['SMOKE', 'CO_DETECTOR', 'WATER_LEAK']
};

// Entry point zone types
const ENTRY_POINT_ZONES = ['FRONT_DOOR', 'BACK_DOOR', 'SIDE_DOOR', 'GARAGE_ENTRANCE'];

// ============================================================================
// FUSION RULES - Aligned with PRD 6 Event Types
// ============================================================================

const FUSION_RULES = {
  
  // =========================================================================
  // 1. BREAK-IN ATTEMPT (Highest Priority)
  // PRD: Entry attempt with door/window/glass + indoor activity
  // =========================================================================
  
  R1_BREAKIN_DOOR_PIR: {
    id: 'R1_BREAKIN_DOOR_PIR',
    name: 'Break-in: Door/Window + Indoor Motion',
    description: 'Door/window opened followed by indoor motion detection',
    eventType: 'break_in_attempt',
    severity: 'HIGH',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 30,
    conditions: (events, context) => {
      const hasDoorSensor = events.some(e => 
        SENSOR_CATEGORIES.DOOR_SENSORS.includes(e.sensor?.sensorType)
      );
      const hasIndoorMotion = events.some(e => 
        SENSOR_CATEGORIES.MOTION_SENSORS.includes(e.sensor?.sensorType) &&
        (e.zone?.privacyLevel === 'RESTRICTED' || e.zone?.privacyLevel === 'PRIVATE')
      );
      const isEntryZone = events.some(e => 
        e.zone?.isEntryPoint || ENTRY_POINT_ZONES.includes(e.zone?.zoneType)
      );
      return hasDoorSensor && hasIndoorMotion && isEntryZone;
    }
  },

  R2_BREAKIN_GLASS_PERSON: {
    id: 'R2_BREAKIN_GLASS_PERSON',
    name: 'Break-in: Glass Break + Person',
    description: 'Glass break sensor triggered with person detected nearby',
    eventType: 'break_in_attempt',
    severity: 'HIGH',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 30,
    conditions: (events, context) => {
      const hasGlassBreak = events.some(e => 
        SENSOR_CATEGORIES.GLASS_BREAK_SENSORS.includes(e.sensor?.sensorType)
      );
      const hasPerson = events.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      return hasGlassBreak && hasPerson;
    }
  },

  R3_BREAKIN_INTRUSION_FLAG: {
    id: 'R3_BREAKIN_INTRUSION_FLAG',
    name: 'Break-in: Camera Intrusion Alert',
    description: 'Camera detected intrusion into private zone with door activity',
    eventType: 'break_in_attempt',
    severity: 'HIGH',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 30,
    conditions: (events, context) => {
      // Check for intrusion flags from camera AI
      const hasIntrusionFlag = events.some(e => {
        const flags = e.rawPayload?.flags || [];
        return flags.some(f => 
          f.includes('intrusion') || f.includes('line_cross') || f.includes('forced_entry')
        );
      });
      const hasDoorActivity = events.some(e => 
        SENSOR_CATEGORIES.DOOR_SENSORS.includes(e.sensor?.sensorType)
      );
      const isPrivateZone = events.some(e => 
        e.zone?.privacyLevel === 'PRIVATE' || e.zone?.privacyLevel === 'RESTRICTED'
      );
      return hasIntrusionFlag && hasDoorActivity && isPrivateZone;
    }
  },

  // =========================================================================
  // 2. PERIMETER DAMAGE
  // PRD: Fence/gate/window damage without clear entry
  // =========================================================================

  R4_PERIMETER_GLASS_ONLY: {
    id: 'R4_PERIMETER_GLASS_ONLY',
    name: 'Perimeter: Glass Break (No Person)',
    description: 'Glass break detected without person visible - possible perimeter damage',
    eventType: 'perimeter_damage',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 60,
    conditions: (events, context) => {
      const hasGlassBreak = events.some(e => 
        SENSOR_CATEGORIES.GLASS_BREAK_SENSORS.includes(e.sensor?.sensorType)
      );
      const hasPerson = events.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      // Glass break WITHOUT person = perimeter damage (not break-in)
      return hasGlassBreak && !hasPerson;
    },
    severityUpgrade: (events, context) => {
      if (['NIGHT', 'AWAY'].includes(context.houseMode)) {
        return 'HIGH';
      }
      return 'MEDIUM';
    }
  },

  R5_PERIMETER_VIBRATION: {
    id: 'R5_PERIMETER_VIBRATION',
    name: 'Perimeter: Strong Vibration',
    description: 'Strong vibration detected on door/window/fence',
    eventType: 'perimeter_damage',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 30,
    conditions: (events, context) => {
      const hasVibration = events.some(e => e.sensor?.sensorType === 'VIBRATION');
      return hasVibration;
    }
  },

  // =========================================================================
  // 3. SUSPICIOUS PERSON
  // PRD: Person loitering in private/semi-private zones
  // =========================================================================

  R6_SUSPICIOUS_PERSON_DWELL: {
    id: 'R6_SUSPICIOUS_PERSON_DWELL',
    name: 'Suspicious Person: Prolonged Dwell',
    description: 'Person detected in private zone with prolonged dwell time',
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 120,
    conditions: (events, context) => {
      const hasPerson = events.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      const isPrivateZone = events.some(e => 
        e.zone?.privacyLevel === 'PRIVATE' || e.zone?.privacyLevel === 'RESTRICTED'
      );
      const dwellTime = context.track?.dwellSecondsPrivate || 0;
      return hasPerson && isPrivateZone && dwellTime >= DWELL_THRESHOLD_SUSPICIOUS_PERSON;
    },
    severityUpgrade: (events, context) => {
      if (['NIGHT', 'AWAY'].includes(context.houseMode)) {
        return 'HIGH';
      }
      return 'MEDIUM';
    }
  },

  R7_SUSPICIOUS_PERSON_LOITER_FLAG: {
    id: 'R7_SUSPICIOUS_PERSON_LOITER_FLAG',
    name: 'Suspicious Person: Loitering Alert',
    description: 'Camera AI flagged person as loitering/lingering',
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 60,
    conditions: (events, context) => {
      const hasLoiteringFlag = events.some(e => {
        const flags = e.rawPayload?.flags || [];
        return flags.some(f => 
          f.includes('loiter') || f.includes('linger') || f.includes('loitering_candidate')
        );
      });
      const hasPerson = events.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      return hasLoiteringFlag && hasPerson;
    },
    severityUpgrade: (events, context) => {
      const isPrivateZone = events.some(e => 
        e.zone?.privacyLevel === 'PRIVATE' || e.zone?.privacyLevel === 'RESTRICTED'
      );
      if (['NIGHT', 'AWAY'].includes(context.houseMode) && isPrivateZone) {
        return 'HIGH';
      }
      return 'MEDIUM';
    }
  },

  R8_SUSPICIOUS_PERSON_BACKYARD: {
    id: 'R8_SUSPICIOUS_PERSON_BACKYARD',
    name: 'Suspicious Person: Backyard Activity',
    description: 'Person detected in backyard/side area',
    eventType: 'suspicious_person',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 60,
    conditions: (events, context) => {
      const hasPerson = events.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      const isBackArea = events.some(e => {
        const zoneType = e.zone?.zoneType?.toUpperCase() || '';
        return zoneType.includes('BACK') || zoneType.includes('SIDE') || zoneType.includes('ALLEY');
      });
      return hasPerson && isBackArea;
    }
  },

  // =========================================================================
  // 4. SUSPICIOUS VEHICLE
  // PRD: Vehicle loitering in driveway/street
  // =========================================================================

  R9_SUSPICIOUS_VEHICLE_DWELL: {
    id: 'R9_SUSPICIOUS_VEHICLE_DWELL',
    name: 'Suspicious Vehicle: Prolonged Stay',
    description: 'Vehicle detected in driveway with prolonged stay',
    eventType: 'suspicious_vehicle',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 300,
    conditions: (events, context) => {
      const hasVehicle = events.some(e => 
        SENSOR_CATEGORIES.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
      );
      const isDrivewayOrStreet = events.some(e => {
        const zoneType = e.zone?.zoneType?.toUpperCase() || '';
        return zoneType.includes('DRIVEWAY') || zoneType.includes('STREET') || zoneType.includes('ALLEY');
      });
      const dwellTime = context.track?.dwellSecondsPrivate || 0;
      return hasVehicle && isDrivewayOrStreet && dwellTime >= DWELL_THRESHOLD_SUSPICIOUS_VEHICLE;
    },
    severityUpgrade: (events, context) => {
      const dwellTime = context.track?.dwellSecondsPrivate || 0;
      if (['NIGHT', 'AWAY'].includes(context.houseMode) || dwellTime >= DWELL_THRESHOLD_VEHICLE_SEVERE) {
        return 'HIGH';
      }
      return 'MEDIUM';
    }
  },

  R10_SUSPICIOUS_VEHICLE_REPEATED: {
    id: 'R10_SUSPICIOUS_VEHICLE_REPEATED',
    name: 'Suspicious Vehicle: Repeated Appearance',
    description: 'Same vehicle appeared multiple times (potential casing)',
    eventType: 'suspicious_vehicle',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 600,
    conditions: (events, context) => {
      const hasRepeatedFlag = events.some(e => {
        const flags = e.rawPayload?.flags || [];
        return flags.some(f => f.includes('repeated') || f.includes('seen_before'));
      });
      const hasVehicle = events.some(e => 
        SENSOR_CATEGORIES.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
      );
      return hasRepeatedFlag && hasVehicle;
    }
  },

  R10B_SUSPICIOUS_VEHICLE_LOITER: {
    id: 'R10B_SUSPICIOUS_VEHICLE_LOITER',
    name: 'Suspicious Vehicle: Loitering',
    description: 'Vehicle detected loitering in driveway/street',
    eventType: 'suspicious_vehicle',
    severity: 'MEDIUM',
    requiredModes: ['NIGHT', 'AWAY', 'HOME'],
    windowSeconds: 300,
    conditions: (events, context) => {
      const hasLoiteringFlag = events.some(e => {
        const flags = e.rawPayload?.flags || [];
        return flags.some(f => f.includes('loiter') || f.includes('linger') || f.includes('loitering'));
      });
      const hasVehicle = events.some(e => 
        SENSOR_CATEGORIES.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
      );
      return hasLoiteringFlag && hasVehicle;
    },
    severityUpgrade: (events, context) => {
      if (['NIGHT', 'AWAY'].includes(context.houseMode)) {
        return 'HIGH';
      }
      return 'MEDIUM';
    }
  },

  // =========================================================================
  // 5. UNUSUAL NOISE
  // PRD: Audio events - glass break sound, loud noise, etc.
  // =========================================================================

  R11_UNUSUAL_NOISE: {
    id: 'R11_UNUSUAL_NOISE',
    name: 'Unusual Noise Detected',
    description: 'Unusual sound detected by audio sensor',
    eventType: 'unusual_noise',
    severity: 'LOW',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 30,
    conditions: (events, context) => {
      const hasAudioEvent = events.some(e => 
        SENSOR_CATEGORIES.AUDIO_SENSORS.includes(e.sensor?.sensorType) &&
        e.sensor?.sensorType !== 'MIC_GLASS_BREAK' // Glass break handled separately
      );
      return hasAudioEvent;
    },
    severityUpgrade: (events, context) => {
      if (context.houseMode === 'NIGHT') {
        return 'MEDIUM';
      }
      return 'LOW';
    }
  },

  // =========================================================================
  // 6. PACKAGE EVENTS
  // PRD: Package delivery and removal
  // =========================================================================

  R12_PACKAGE_DELIVERED: {
    id: 'R12_PACKAGE_DELIVERED',
    name: 'Package Delivered',
    description: 'Package detected at front door/porch',
    eventType: 'package_delivered',
    severity: 'LOW',
    requiredModes: ['DISARMED', 'HOME', 'AWAY', 'NIGHT'],
    windowSeconds: 60,
    conditions: (events, context) => {
      const hasPackagePresent = events.some(e => {
        if (e.sensor?.sensorType !== 'CAMERA_PACKAGE') return false;
        const flags = e.rawPayload?.flags || [];
        return e.newState === 'on' || e.newState === 'present' || 
               flags.some(f => f.includes('item_forgotten') || f.includes('package_detected'));
      });
      const isFrontDoor = events.some(e => {
        const zoneType = e.zone?.zoneType?.toUpperCase() || '';
        return zoneType.includes('FRONT') || zoneType.includes('PORCH') || zoneType.includes('DOOR');
      });
      return hasPackagePresent && isFrontDoor;
    }
  },

  R13_PACKAGE_TAKEN: {
    id: 'R13_PACKAGE_TAKEN',
    name: 'Package Taken',
    description: 'Package removed from front door/porch',
    eventType: 'package_taken',
    severity: 'LOW',
    requiredModes: ['DISARMED', 'HOME', 'AWAY', 'NIGHT'],
    windowSeconds: 60,
    conditions: (events, context) => {
      const hasPackageTaken = events.some(e => {
        if (e.sensor?.sensorType !== 'CAMERA_PACKAGE') return false;
        const flags = e.rawPayload?.flags || [];
        return e.newState === 'off' || e.newState === 'not_present' || 
               flags.some(f => f.includes('item_taken') || f.includes('package_removed'));
      });
      return hasPackageTaken;
    },
    severityUpgrade: (events, context) => {
      // Upgrade to suspicious if in AWAY/NIGHT mode or unusual hour
      const hour = new Date().getHours();
      const isOddHour = hour < 6 || hour > 22;
      if (['AWAY', 'NIGHT'].includes(context.houseMode) || isOddHour) {
        return 'MEDIUM'; // Potentially suspicious
      }
      return 'LOW';
    }
  },

  // =========================================================================
  // SAFETY EVENTS (Bonus - not in PRD but important)
  // =========================================================================

  R14_FIRE_DETECTED: {
    id: 'R14_FIRE_DETECTED',
    name: 'Fire/Smoke Detected',
    description: 'Smoke detector triggered',
    eventType: 'fire_detected',
    severity: 'HIGH',
    requiredModes: ['DISARMED', 'HOME', 'AWAY', 'NIGHT'],
    windowSeconds: 10,
    conditions: (events, context) => {
      return events.some(e => e.sensor?.sensorType === 'SMOKE');
    }
  },

  R15_CO_DETECTED: {
    id: 'R15_CO_DETECTED',
    name: 'Carbon Monoxide Detected',
    description: 'CO detector triggered',
    eventType: 'co_detected',
    severity: 'HIGH',
    requiredModes: ['DISARMED', 'HOME', 'AWAY', 'NIGHT'],
    windowSeconds: 10,
    conditions: (events, context) => {
      return events.some(e => e.sensor?.sensorType === 'CO_DETECTOR');
    }
  },

  R16_WATER_LEAK: {
    id: 'R16_WATER_LEAK',
    name: 'Water Leak Detected',
    description: 'Water leak sensor triggered',
    eventType: 'water_leak_detected',
    severity: 'MEDIUM',
    requiredModes: ['DISARMED', 'HOME', 'AWAY', 'NIGHT'],
    windowSeconds: 10,
    conditions: (events, context) => {
      return events.some(e => e.sensor?.sensorType === 'WATER_LEAK');
    }
  },

  // =========================================================================
  // FALLBACK: General Motion (Lowest Priority)
  // =========================================================================

  R99_MOTION_ALERT: {
    id: 'R99_MOTION_ALERT',
    name: 'Motion Alert',
    description: 'Motion detected in monitored zone',
    eventType: 'motion_detected',
    severity: 'LOW',
    requiredModes: ['NIGHT', 'AWAY'],
    windowSeconds: 30,
    conditions: (events, context) => {
      const hasMotion = events.some(e => 
        SENSOR_CATEGORIES.MOTION_SENSORS.includes(e.sensor?.sensorType)
      );
      return hasMotion;
    }
  }
};

// Rule priority order (first match wins)
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

// ============================================================================
// NOTIFICATION MATRIX
// ============================================================================

function getNotificationLevel(houseMode, severity, nightModeHighOnly = false) {
  const matrix = {
    DISARMED: { HIGH: 'NORMAL', MEDIUM: 'NONE', LOW: 'NONE' },
    HOME: { HIGH: 'HIGH', MEDIUM: 'NORMAL', LOW: 'NONE' },
    AWAY: { HIGH: 'HIGH', MEDIUM: 'HIGH', LOW: 'NORMAL' },
    NIGHT: { 
      HIGH: 'HIGH', 
      MEDIUM: nightModeHighOnly ? 'NONE' : 'NORMAL', 
      LOW: 'NONE' 
    }
  };
  return matrix[houseMode]?.[severity] || 'NONE';
}

// ============================================================================
// MAIN FUSION ENGINE CLASS
// ============================================================================

class FusionEngine {
  
  /**
   * Main entry point: Ingest a sensor event and process it through fusion logic
   * 
   * @param {Object} params
   * @param {string} params.circleId - Circle ID
   * @param {string} params.sensorId - Sensor ID
   * @param {string} params.newState - New sensor state
   * @param {string} params.oldState - Previous sensor state (optional)
   * @param {Date} params.occurredAt - When the event occurred
   * @param {Object} params.rawPayload - Original webhook payload (optional)
   * 
   * @returns {Object} FusionResult
   */
  async ingestSensorEvent({ circleId, sensorId, newState, oldState, occurredAt, rawPayload }) {
    const result = {
      sensorEventId: null,
      trackId: null,
      createdSecurityEventId: null,
      updatedSecurityEventId: null,
      notificationLevel: 'NONE',
      ruleMatched: null,
      suppressed: false,
      suppressReason: null
    };

    try {
      // 1. Load context (sensor, zone, home, circle)
      const context = await this._loadContext(circleId, sensorId);
      
      if (!context.sensor) {
        console.log('[FusionEngine] Sensor not found:', sensorId);
        return { ...result, suppressed: true, suppressReason: 'SENSOR_NOT_FOUND' };
      }

      if (!context.sensor.isEnabled) {
        console.log('[FusionEngine] Sensor disabled:', sensorId);
        return { ...result, suppressed: true, suppressReason: 'SENSOR_DISABLED' };
      }

      // 2. Check if this is a trigger event
      const isTrigger = this._isTriggerState(newState);
      if (!isTrigger) {
        console.log('[FusionEngine] Not a trigger state:', newState);
        // Still update sensor state but don't create event
        await this._updateSensorState(sensorId, newState, occurredAt);
        return { ...result, suppressed: true, suppressReason: 'NOT_TRIGGER_STATE' };
      }

      // 3. Create SensorEvent record
      const sensorEvent = await this._createSensorEvent({
        circleId,
        sensorId,
        zoneId: context.sensor.zoneId,
        newState,
        oldState,
        occurredAt,
        rawPayload
      });
      result.sensorEventId = sensorEvent.id;

      // 4. Update sensor state
      await this._updateSensorState(sensorId, newState, occurredAt);

      // 5. Find or create Track
      const track = await this._findOrCreateTrack({
        circleId,
        homeId: context.home?.id,
        sensorEvent,
        context
      });
      result.trackId = track.id;

      // Link sensor event to track
      await prisma.sensorEvent.update({
        where: { id: sensorEvent.id },
        data: { trackId: track.id, processed: true }
      });

      // 6. Get recent sensor events in this track
      const trackEvents = await this._getTrackSensorEvents(track.id);

      // 7. Apply fusion rules
      const ruleResult = await this._applyFusionRules(trackEvents, {
        ...context,
        track,
        houseMode: context.home?.houseMode || 'DISARMED'
      });

      if (ruleResult.suppressed) {
        result.suppressed = true;
        result.suppressReason = ruleResult.suppressReason;
        return result;
      }

      if (ruleResult.rule) {
        result.ruleMatched = ruleResult.rule.id;
        
        // 8. Create or update SecurityEvent
        const eventResult = await this._createOrUpdateSecurityEvent({
          track,
          rule: ruleResult.rule,
          severity: ruleResult.severity,
          trackEvents,
          context
        });
        
        result.createdSecurityEventId = eventResult.createdId;
        result.updatedSecurityEventId = eventResult.updatedId;

        // 9. Calculate notification level using ML/heuristic scoring
        const eventId = eventResult.createdId || eventResult.updatedId;
        const mlResult = await this._calculateMLNotificationLevel({
          circleId,
          homeId: context.home?.id,
          eventId,
          eventType: ruleResult.rule.eventType,
          severity: ruleResult.severity,
          houseMode: context.home?.houseMode || 'DISARMED',
          fusionRule: ruleResult.rule.id,
          trackEvents,
          track
        });
        
        result.notificationLevel = mlResult.level;
        result.mlScore = mlResult.score;
        result.mlMethod = mlResult.method;
        result.mlFactors = mlResult.factors;
      }

      console.log('[FusionEngine] Result:', result);
      return result;

    } catch (error) {
      console.error('[FusionEngine] Error:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Load all context needed for fusion decisions
   */
  async _loadContext(circleId, sensorId) {
    const sensor = await prisma.sensor.findUnique({
      where: { id: sensorId },
      include: { zone: true }
    });

    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        home: true,
        members: {
          where: { leftAt: null, role: { in: ['OWNER', 'HOUSEHOLD'] } },
          take: 1
        }
      }
    });

    return {
      sensor,
      zone: sensor?.zone,
      circle,
      home: circle?.home,
      creator: circle?.members?.[0] // First owner/household member for event creation
    };
  }

  /**
   * Check if sensor state is a "trigger" state
   */
  _isTriggerState(state) {
    // Standard trigger states
    const triggerStates = [
      'on', 'open', 'detected', 'triggered', 'motion', 'true', '1', 'active',
      // Package states
      'present', 'not_present', 'delivered', 'taken', 'removed',
      // Additional camera states
      'person', 'vehicle', 'package', 'animal'
    ];
    return triggerStates.includes(String(state).toLowerCase());
  }

  /**
   * Create a SensorEvent record
   */
  async _createSensorEvent({ circleId, sensorId, zoneId, newState, oldState, occurredAt, rawPayload }) {
    return prisma.sensorEvent.create({
      data: {
        id: uuidv4(),
        circleId,
        sensorId,
        zoneId,
        newState: String(newState),
        oldState: oldState ? String(oldState) : null,
        occurredAt: new Date(occurredAt),
        rawPayload: rawPayload || null,
        processed: false
      }
    });
  }

  /**
   * Update sensor's last state
   */
  async _updateSensorState(sensorId, newState, occurredAt) {
    return prisma.sensor.update({
      where: { id: sensorId },
      data: {
        lastState: String(newState),
        lastStateAt: new Date(occurredAt),
        status: 'ONLINE'
      }
    });
  }

  /**
   * Find an existing open track or create a new one
   */
  async _findOrCreateTrack({ circleId, homeId, sensorEvent, context }) {
    const windowStart = new Date(sensorEvent.occurredAt.getTime() - TRACK_WINDOW_SECONDS * 1000);

    // Look for an open track in the time window
    let track = await prisma.track.findFirst({
      where: {
        circleId,
        isClosed: false,
        endTime: { gte: windowStart }
      },
      orderBy: { endTime: 'desc' }
    });

    const zone = context.sensor?.zone;
    const zonePrivacy = zone?.privacyLevel || 'SEMI_PRIVATE';

    if (track) {
      // Update existing track
      const newEndTime = new Date(Math.max(track.endTime.getTime(), sensorEvent.occurredAt.getTime()));
      
      // Update segments
      const segments = track.segments || [];
      const lastSegment = segments[segments.length - 1];
      
      if (lastSegment && lastSegment.zoneId === zone?.id) {
        // Extend last segment
        lastSegment.tLeave = sensorEvent.occurredAt.toISOString();
      } else if (zone) {
        // Add new segment
        segments.push({
          zoneId: zone.id,
          zoneType: zone.zoneType,
          tEnter: sensorEvent.occurredAt.toISOString(),
          tLeave: sensorEvent.occurredAt.toISOString()
        });
      }

      // Calculate path summary
      const pathSummary = this._calculatePathSummary(segments);
      
      // Calculate max privacy level
      const maxPrivacy = this._calculateMaxPrivacy(track.maxPrivacyLevel, zonePrivacy);
      
      // Calculate dwell time in private zones
      const dwellSeconds = this._calculatePrivateDwell(segments);

      track = await prisma.track.update({
        where: { id: track.id },
        data: {
          endTime: newEndTime,
          segments,
          pathSummary,
          maxPrivacyLevel: maxPrivacy,
          dwellSecondsPrivate: dwellSeconds
        }
      });
    } else {
      // Create new track
      const segments = zone ? [{
        zoneId: zone.id,
        zoneType: zone.zoneType,
        tEnter: sensorEvent.occurredAt.toISOString(),
        tLeave: sensorEvent.occurredAt.toISOString()
      }] : [];

      track = await prisma.track.create({
        data: {
          id: uuidv4(),
          circleId,
          homeId: homeId || circleId, // fallback if no home
          objectType: 'UNKNOWN',
          startTime: sensorEvent.occurredAt,
          endTime: sensorEvent.occurredAt,
          segments,
          pathSummary: zone?.zoneType || null,
          maxPrivacyLevel: zonePrivacy,
          dwellSecondsPrivate: 0,
          isClosed: false
        }
      });
    }

    return track;
  }

  /**
   * Calculate path summary from segments
   */
  _calculatePathSummary(segments) {
    if (!segments || segments.length === 0) return null;
    const zones = segments.map(s => s.zoneType).filter(Boolean);
    // Dedupe consecutive same zones
    const deduped = zones.filter((z, i) => i === 0 || z !== zones[i - 1]);
    return deduped.join(' → ');
  }

  /**
   * Calculate max privacy level
   */
  _calculateMaxPrivacy(current, newLevel) {
    const currentRank = PRIVACY_HIERARCHY[current] || 0;
    const newRank = PRIVACY_HIERARCHY[newLevel] || 0;
    if (newRank > currentRank) {
      return newLevel;
    }
    return current || newLevel;
  }

  /**
   * Calculate dwell time in private/restricted zones
   */
  _calculatePrivateDwell(segments) {
    let totalSeconds = 0;
    for (const seg of segments) {
      // We'd need zone info to know privacy level
      // For now, estimate based on segment duration
      if (seg.tEnter && seg.tLeave) {
        const enter = new Date(seg.tEnter);
        const leave = new Date(seg.tLeave);
        totalSeconds += Math.max(0, (leave - enter) / 1000);
      }
    }
    return Math.round(totalSeconds);
  }

  /**
   * Get all sensor events for a track
   */
  async _getTrackSensorEvents(trackId) {
    return prisma.sensorEvent.findMany({
      where: { trackId },
      include: {
        sensor: true,
        zone: true
      },
      orderBy: { occurredAt: 'asc' }
    });
  }

  /**
   * Apply fusion rules to determine if security event should be created
   */
  async _applyFusionRules(trackEvents, context) {
    const houseMode = context.houseMode;

    // Check for glass break first - this ALWAYS triggers regardless of mode
    const hasGlassBreak = trackEvents.some(e => 
      e.sensor?.sensorType === 'GLASS_BREAK' || e.sensor?.sensorType === 'MIC_GLASS_BREAK'
    );
    
    if (hasGlassBreak) {
      // Check if there's also a person - use R2 (break-in), otherwise R4 (perimeter)
      const hasPerson = trackEvents.some(e => 
        SENSOR_CATEGORIES.PERSON_SENSORS.includes(e.sensor?.sensorType)
      );
      
      if (hasPerson) {
        const rule = FUSION_RULES.R2_BREAKIN_GLASS_PERSON;
        return {
          rule,
          severity: rule.severity,
          suppressed: false
        };
      } else {
        const rule = FUSION_RULES.R4_PERIMETER_GLASS_ONLY;
        return {
          rule,
          severity: rule.severityUpgrade ? rule.severityUpgrade(trackEvents, context) : rule.severity,
          suppressed: false
        };
      }
    }

    // DISARMED mode: suppress all other events
    if (houseMode === 'DISARMED') {
      return { suppressed: true, suppressReason: 'DISARMED_MODE' };
    }

    // Try rules in priority order
    for (const ruleId of RULE_PRIORITY) {
      const rule = FUSION_RULES[ruleId];
      
      // Skip glass break rules (already handled above)
      if (ruleId === 'R2_BREAKIN_GLASS_PERSON' || ruleId === 'R4_PERIMETER_GLASS_ONLY') continue;
      
      // Check if rule applies to current house mode
      if (!rule.requiredModes.includes(houseMode)) {
        continue;
      }

      // Check rule conditions
      if (rule.conditions(trackEvents, context)) {
        let severity = rule.severity;
        
        // Check for severity upgrade
        if (rule.severityUpgrade) {
          severity = rule.severityUpgrade(trackEvents, context);
        }

        return {
          rule,
          severity,
          suppressed: false
        };
      }
    }

    // No rule matched
    return { suppressed: true, suppressReason: 'NO_RULE_MATCHED' };
  }

  /**
   * Create or update a SecurityEvent based on fusion result
   */
  async _createOrUpdateSecurityEvent({ track, rule, severity, trackEvents, context }) {
    const result = { createdId: null, updatedId: null };

    // Check for existing event on this track
    const existingEvent = await prisma.event.findFirst({
      where: {
        primaryTrackId: track.id,
        status: { in: ['OPEN', 'ACKED', 'WATCHING'] }
      }
    });

    const contributingSensorIds = [...new Set(trackEvents.map(e => e.sensorId))];
    const primaryZone = trackEvents[trackEvents.length - 1]?.zone;

    if (existingEvent) {
      // Update existing event - including eventType if a higher-priority rule matched
      const shouldUpgradeType = this._shouldUpgradeEventType(existingEvent.eventType, rule.eventType);
      
      await prisma.event.update({
        where: { id: existingEvent.id },
        data: {
          // Upgrade eventType if new rule is higher priority (e.g., suspicious_person -> break_in_attempt)
          eventType: shouldUpgradeType ? rule.eventType : existingEvent.eventType,
          severity,
          pathSummary: track.pathSummary,
          dwellSecondsPrivate: track.dwellSecondsPrivate,
          contributingSensorIds,
          updatedAt: new Date()
        }
      });
      result.updatedId = existingEvent.id;
    } else {
      // Create new event
      if (!context.creator) {
        console.log('[FusionEngine] No creator found, cannot create event');
        return result;
      }

      if (!primaryZone) {
        console.log('[FusionEngine] No zone found, cannot create event');
        return result;
      }

      const event = await prisma.event.create({
        data: {
          id: uuidv4(),
          circleId: context.circle.id,
          zoneId: primaryZone.id,
          creatorId: context.creator.id,
          eventType: rule.eventType,
          title: this._generateEventTitle(rule, track, context),
          description: this._generateEventDescription(rule, track, trackEvents),
          severity,
          status: 'OPEN',
          sourceType: 'FUSION',
          occurredAt: track.startTime,
          isSecurityEvent: true,
          primaryTrackId: track.id,
          pathSummary: track.pathSummary,
          dwellSecondsPrivate: track.dwellSecondsPrivate,
          fusionRule: rule.id,
          contributingSensorIds
        }
      });
      result.createdId = event.id;
    }

    return result;
  }

  /**
   * Generate event title
   */
  _generateEventTitle(rule, track, context) {
    const titles = {
      'break_in_attempt': '⚠️ Potential Break-in Detected',
      'suspicious_person': '👤 Suspicious Person Detected',
      'suspicious_vehicle': '🚗 Suspicious Vehicle Detected',
      'motion_detected': '🔔 Motion Detected'
    };
    return titles[rule.eventType] || `Security Alert: ${rule.name}`;
  }

  /**
   * Generate event description
   */
  _generateEventDescription(rule, track, trackEvents) {
    const sensorTypes = [...new Set(trackEvents.map(e => e.sensor?.sensorType).filter(Boolean))];
    const path = track.pathSummary || 'Unknown location';
    
    return `${rule.description}\n\nPath: ${path}\nSensors triggered: ${sensorTypes.join(', ')}\nDuration: ${track.dwellSecondsPrivate || 0}s`;
  }

  /**
   * Determine if eventType should be upgraded based on priority
   * Higher priority events "win" - e.g., break_in_attempt > suspicious_person > perimeter_damage
   */
  _shouldUpgradeEventType(currentType, newType) {
    const EVENT_TYPE_PRIORITY = {
      'fire_detected': 100,
      'co_detected': 100,
      'water_leak_detected': 90,
      'break_in_attempt': 80,
      'perimeter_damage': 70,
      'suspicious_person': 60,
      'suspicious_vehicle': 50,
      'unusual_noise': 40,
      'package_taken': 35,
      'package_delivered': 30,
      'motion_detected': 10,
      'custom_event': 5
    };
    
    const currentPriority = EVENT_TYPE_PRIORITY[currentType] || 0;
    const newPriority = EVENT_TYPE_PRIORITY[newType] || 0;
    
    return newPriority > currentPriority;
  }

  /**
   * Close old tracks that haven't been updated recently
   */
  async closeStaleTrack(trackId) {
    return prisma.track.update({
      where: { id: trackId },
      data: { isClosed: true }
    });
  }

  /**
   * Utility: Close all stale tracks (run periodically)
   */
  async closeAllStaleTracks(circleId, maxAgeSeconds = 300) {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
    
    return prisma.track.updateMany({
      where: {
        circleId,
        isClosed: false,
        endTime: { lt: cutoff }
      },
      data: { isClosed: true }
    });
  }

  /**
   * Calculate notification level using ML/heuristic scoring
   * Phase 2.1: Integrates notificationScorer and notificationPolicy
   */
  async _calculateMLNotificationLevel({
    circleId,
    homeId,
    eventId,
    eventType,
    severity,
    houseMode,
    fusionRule,
    trackEvents,
    track
  }) {
    try {
      // Extract features from track events
      const sensorTypes = trackEvents.map(e => e.sensor?.sensorType).filter(Boolean);
      const hasDoorContact = sensorTypes.includes('DOOR_CONTACT');
      const hasInsideMotion = sensorTypes.includes('PIR');
      const hasGlassBreak = sensorTypes.includes('GLASS_BREAK');
      const hasPrivateZone = trackEvents.some(e => 
        e.zone?.privacyLevel === 'PRIVATE' || e.zone?.privacyLevel === 'RESTRICTED'
      );

      // Get max privacy level from track (key feature for scoring!)
      const maxPrivacyLevel = track?.maxPrivacyLevel || 'SEMI_PRIVATE';

      // Get ML/heuristic score
      const scoreResult = await notificationScorer.predict({
        circleId,
        homeId,
        eventType,
        severity,
        houseMode,
        fusionRule,
        sensorCount: trackEvents.length,
        hasDoorContact,
        hasInsideMotion,
        hasGlassBreak,
        hasPrivateZone,
        maxPrivacyLevel,  // Pass the max privacy level!
        dwellPrivateSec: track?.dwellSecondsPrivate || 0,
        hourBucket: new Date().getHours()
      });

      // Get notification policy decision
      const policyResult = notificationPolicy.decide({
        score: scoreResult.score,
        eventType,
        severity,
        houseMode,
        fusionRule,
        hasGlassBreak,
        maxPrivacyLevel  // Also pass to policy for potential future use
      });

      // Update event with ML score if we have an eventId
      if (eventId) {
        try {
          await prisma.event.update({
            where: { id: eventId },
            data: {
              mlScore: scoreResult.score,
              mlSuppressed: policyResult.level === 'NONE'
            }
          });
        } catch (updateErr) {
          console.log('[FusionEngine] Could not update event with ML score:', updateErr.message);
        }
      }

      // Also create EventMLFeature record for future ML training
      if (eventId && homeId) {
        try {
          await prisma.eventMLFeature.upsert({
            where: { eventId },
            update: {
              histFalseRateType: scoreResult.statsUsed ? null : undefined // Will be updated by stats job
            },
            create: {
              id: uuidv4(),
              eventId,
              circleId,
              homeId,
              eventType,
              sourceType: 'FUSION',
              severity,
              houseMode,
              hourBucket: new Date().getHours(),
              weekday: new Date().getDay(),
              hasDoorContact,
              hasInsideMotion,
              hasCameraPerson: false,
              hasGlassBreak,
              sensorCount: trackEvents.length,
              hasPrivateZone,
              dwellPrivateSec: track?.dwellSecondsPrivate || 0,
              dwellTotalSec: track?.dwellSecondsPrivate || 0
            }
          });
        } catch (featureErr) {
          console.log('[FusionEngine] Could not create ML feature:', featureErr.message);
        }
      }

      console.log(`[FusionEngine] ML Score: ${scoreResult.score.toFixed(2)}, ` +
                  `Method: ${scoreResult.method}, Level: ${policyResult.level}` +
                  (policyResult.wasOverridden ? ' (safety override)' : ''));

      return {
        level: policyResult.level,
        score: scoreResult.score,
        method: scoreResult.method,
        factors: scoreResult.factors,
        policyReason: policyResult.reason,
        wasOverridden: policyResult.wasOverridden
      };

    } catch (error) {
      console.error('[FusionEngine] ML scoring error, falling back to matrix:', error);
      // Fallback to simple matrix
      const fallbackLevel = getNotificationLevel(houseMode, severity);
      return {
        level: fallbackLevel,
        score: null,
        method: 'fallback',
        factors: {},
        error: error.message
      };
    }
  }
}

// Export singleton instance
const fusionEngine = new FusionEngine();

module.exports = {
  fusionEngine,
  FusionEngine,
  FUSION_RULES,
  getNotificationLevel
};
