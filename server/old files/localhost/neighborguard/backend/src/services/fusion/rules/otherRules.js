// ============================================================================
// Package and Other Rules
// Rules for package events, unusual noise, perimeter, and fallback
// ============================================================================

const { SensorCategory, SensorType } = require('../../config/constants/sensorTypes');

// ============================================================================
// PERIMETER RULES
// ============================================================================

/**
 * R4: Glass Break Without Person (Perimeter Damage)
 */
const R4_PERIMETER_GLASS_ONLY = {
  id: 'R4_PERIMETER_GLASS_ONLY',
  name: 'Perimeter Damage: Glass Break',
  description: 'Glass break detected without person (possible accident or perimeter damage)',
  eventType: 'perimeter_damage',
  severity: 'HIGH',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    const hasGlassBreak = events.some(e => 
      SensorCategory.GLASS_BREAK_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const hasPerson = events.some(e => 
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
    );
    
    // Glass break without person = perimeter damage
    return hasGlassBreak && !hasPerson;
  },
  
  severityUpgrade: (events, context) => {
    if (context.houseMode === 'HOME') {
      return 'MEDIUM';
    }
    return 'HIGH';
  }
};

/**
 * R5: Vibration Sensor Trigger
 */
const R5_PERIMETER_VIBRATION = {
  id: 'R5_PERIMETER_VIBRATION',
  name: 'Perimeter Damage: Vibration Alert',
  description: 'Strong vibration detected on door/window/fence',
  eventType: 'perimeter_damage',
  severity: 'MEDIUM',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    return events.some(e => e.sensor?.sensorType === SensorType.VIBRATION);
  }
};

// ============================================================================
// UNUSUAL NOISE RULES
// ============================================================================

/**
 * R11: Unusual Noise Detection
 */
const R11_UNUSUAL_NOISE = {
  id: 'R11_UNUSUAL_NOISE',
  name: 'Unusual Noise Detected',
  description: 'Unusual sound detected by audio sensor',
  eventType: 'unusual_noise',
  severity: 'LOW',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    // Audio sensors but not glass break (handled separately)
    return events.some(e => 
      e.sensor?.sensorType === SensorType.MIC_UNUSUAL_NOISE ||
      e.sensor?.sensorType === SensorType.MIC_BABY_CRY
    );
  },
  
  severityUpgrade: (events, context) => {
    if (context.houseMode === 'NIGHT') {
      return 'MEDIUM';
    }
    return 'LOW';
  }
};

// ============================================================================
// PACKAGE RULES
// ============================================================================

/**
 * R12: Package Delivered
 */
const R12_PACKAGE_DELIVERED = {
  id: 'R12_PACKAGE_DELIVERED',
  name: 'Package Delivered',
  description: 'Package detected at door/porch',
  eventType: 'package_delivered',
  severity: 'LOW',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 60,
  
  conditions: (events, context) => {
    // Check for package sensor or item_forgotten flag
    const hasPackageDetection = events.some(e => 
      e.sensor?.sensorType === SensorType.CAMERA_PACKAGE
    );
    
    const hasItemForgottenFlag = events.some(e => {
      const flags = e.rawPayload?.flags || [];
      return flags.some(f => 
        f.includes('item_forgotten') || 
        f.includes('package') || 
        f.includes('delivered')
      );
    });
    
    // Front door/porch area
    const isFrontArea = events.some(e => {
      const zoneType = e.zone?.zoneType?.toUpperCase() || '';
      return zoneType.includes('FRONT_DOOR') || 
             zoneType.includes('PORCH') ||
             zoneType.includes('FRONT_YARD');
    });
    
    return (hasPackageDetection || hasItemForgottenFlag) && isFrontArea;
  }
};

/**
 * R13: Package Taken
 */
const R13_PACKAGE_TAKEN = {
  id: 'R13_PACKAGE_TAKEN',
  name: 'Package Taken',
  description: 'Package removed from door/porch',
  eventType: 'package_taken',
  severity: 'LOW',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 60,
  
  conditions: (events, context) => {
    const hasItemTakenFlag = events.some(e => {
      const flags = e.rawPayload?.flags || [];
      return flags.some(f => 
        f.includes('item_taken') || 
        f.includes('removed')
      );
    });
    
    return hasItemTakenFlag;
  },
  
  severityUpgrade: (events, context) => {
    // If AWAY or NIGHT mode, package taken is more suspicious
    if (['AWAY', 'NIGHT'].includes(context.houseMode)) {
      return 'MEDIUM';
    }
    return 'LOW';
  }
};

// ============================================================================
// FALLBACK RULE
// ============================================================================

/**
 * R99: Motion Alert Fallback
 */
const R99_MOTION_ALERT = {
  id: 'R99_MOTION_ALERT',
  name: 'Motion Detected',
  description: 'General motion detected (no specific rule matched)',
  eventType: 'motion_detected',
  severity: 'LOW',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 30,
  
  conditions: (events, context) => {
    // Any motion or person detection that hasn't matched other rules
    return events.some(e => 
      SensorCategory.MOTION_SENSORS.includes(e.sensor?.sensorType) ||
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
    );
  }
};

module.exports = {
  // Perimeter
  R4_PERIMETER_GLASS_ONLY,
  R5_PERIMETER_VIBRATION,
  
  // Unusual noise
  R11_UNUSUAL_NOISE,
  
  // Package
  R12_PACKAGE_DELIVERED,
  R13_PACKAGE_TAKEN,
  
  // Fallback
  R99_MOTION_ALERT
};
