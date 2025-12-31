// ============================================================================
// Break-in Detection Rules
// Rules for detecting intrusion attempts
// ============================================================================

const { SensorCategory, isInCategory } = require('../../config/constants/sensorTypes');
const { ZoneCategory, isEntryPoint } = require('../../config/constants/zoneTypes');

/**
 * R1: Door/Window + Indoor Motion
 * Highest confidence break-in indicator
 */
const R1_BREAKIN_DOOR_PIR = {
  id: 'R1_BREAKIN_DOOR_PIR',
  name: 'Break-in: Door/Window + Indoor Motion',
  description: 'Door/window opened followed by indoor motion detection',
  eventType: 'break_in_attempt',
  severity: 'HIGH',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    const hasDoorSensor = events.some(e => 
      SensorCategory.DOOR_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const hasIndoorMotion = events.some(e => 
      SensorCategory.MOTION_SENSORS.includes(e.sensor?.sensorType) &&
      (e.zone?.privacyLevel === 'RESTRICTED' || e.zone?.privacyLevel === 'PRIVATE')
    );
    
    const hasEntryZone = events.some(e => 
      e.zone?.isEntryPoint || ZoneCategory.ENTRY_POINTS.includes(e.zone?.zoneType)
    );
    
    return hasDoorSensor && hasIndoorMotion && hasEntryZone;
  }
};

/**
 * R2: Glass Break + Person Detected
 * Strong break-in indicator with visual confirmation
 */
const R2_BREAKIN_GLASS_PERSON = {
  id: 'R2_BREAKIN_GLASS_PERSON',
  name: 'Break-in: Glass Break + Person',
  description: 'Glass break detected followed by person detection',
  eventType: 'break_in_attempt',
  severity: 'HIGH',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'], // Always trigger
  windowSeconds: 60,
  
  conditions: (events, context) => {
    const hasGlassBreak = events.some(e => 
      SensorCategory.GLASS_BREAK_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const hasPerson = events.some(e => 
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
    );
    
    return hasGlassBreak && hasPerson;
  }
};

/**
 * R3: Camera Intrusion Flag
 * Camera AI detected intrusion with door activity
 */
const R3_BREAKIN_INTRUSION_FLAG = {
  id: 'R3_BREAKIN_INTRUSION_FLAG',
  name: 'Break-in: Camera Intrusion Alert',
  description: 'Camera AI flagged intrusion with door activity',
  eventType: 'break_in_attempt',
  severity: 'HIGH',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    // Check for intrusion-related flags from camera AI
    const hasIntrusionFlag = events.some(e => {
      const flags = e.rawPayload?.flags || [];
      return flags.some(f => 
        f.includes('intrusion') || 
        f.includes('line_cross') || 
        f.includes('forced_entry') ||
        f.includes('break')
      );
    });
    
    // Check for door activity
    const hasDoorActivity = events.some(e => 
      SensorCategory.DOOR_SENSORS.includes(e.sensor?.sensorType)
    );
    
    // Check for private zone
    const isPrivateZone = events.some(e => 
      e.zone?.privacyLevel === 'RESTRICTED' || e.zone?.privacyLevel === 'PRIVATE'
    );
    
    return hasIntrusionFlag && hasDoorActivity && isPrivateZone;
  }
};

module.exports = {
  R1_BREAKIN_DOOR_PIR,
  R2_BREAKIN_GLASS_PERSON,
  R3_BREAKIN_INTRUSION_FLAG
};
