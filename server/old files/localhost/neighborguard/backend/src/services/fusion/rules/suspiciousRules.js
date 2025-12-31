// ============================================================================
// Suspicious Activity Rules
// Rules for detecting suspicious persons and vehicles
// ============================================================================

const { SensorCategory } = require('../../config/constants/sensorTypes');
const { ZoneCategory, isBackyardArea } = require('../../config/constants/zoneTypes');
const { FusionConfig } = require('../../config/constants');

// ============================================================================
// SUSPICIOUS PERSON RULES
// ============================================================================

/**
 * R6: Person Dwelling in Private Zone
 */
const R6_SUSPICIOUS_PERSON_DWELL = {
  id: 'R6_SUSPICIOUS_PERSON_DWELL',
  name: 'Suspicious Person: Extended Dwell',
  description: 'Person detected dwelling in private zone beyond threshold',
  eventType: 'suspicious_person',
  severity: 'MEDIUM',
  requiredModes: ['NIGHT', 'AWAY', 'HOME'],
  windowSeconds: 60,
  
  conditions: (events, context) => {
    const hasPerson = events.some(e => 
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const isPrivateZone = events.some(e => 
      e.zone?.privacyLevel === 'PRIVATE' || e.zone?.privacyLevel === 'RESTRICTED'
    );
    
    const dwellTime = context.track?.dwellSecondsPrivate || 0;
    
    return hasPerson && isPrivateZone && dwellTime >= FusionConfig.DWELL_THRESHOLD_PERSON;
  },
  
  severityUpgrade: (events, context) => {
    if (['NIGHT', 'AWAY'].includes(context.houseMode)) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }
};

/**
 * R7: Camera AI Loitering Flag
 */
const R7_SUSPICIOUS_PERSON_LOITER_FLAG = {
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
        f.includes('loiter') || f.includes('linger') || f.includes('loitering')
      );
    });
    
    const hasPerson = events.some(e => 
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
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
};

/**
 * R8: Person in Backyard/Side Area
 */
const R8_SUSPICIOUS_PERSON_BACKYARD = {
  id: 'R8_SUSPICIOUS_PERSON_BACKYARD',
  name: 'Suspicious Person: Backyard Activity',
  description: 'Person detected in backyard/side area',
  eventType: 'suspicious_person',
  severity: 'MEDIUM',
  requiredModes: ['NIGHT', 'AWAY'],
  windowSeconds: 60,
  
  conditions: (events, context) => {
    const hasPerson = events.some(e => 
      SensorCategory.PERSON_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const isBackyard = events.some(e => 
      isBackyardArea(e.zone?.zoneType)
    );
    
    return hasPerson && isBackyard;
  }
};

// ============================================================================
// SUSPICIOUS VEHICLE RULES
// ============================================================================

/**
 * R9: Vehicle Extended Dwell
 */
const R9_SUSPICIOUS_VEHICLE_DWELL = {
  id: 'R9_SUSPICIOUS_VEHICLE_DWELL',
  name: 'Suspicious Vehicle: Prolonged Stay',
  description: 'Vehicle detected in driveway with prolonged stay',
  eventType: 'suspicious_vehicle',
  severity: 'MEDIUM',
  requiredModes: ['NIGHT', 'AWAY', 'HOME'],
  windowSeconds: 300,
  
  conditions: (events, context) => {
    const hasVehicle = events.some(e => 
      SensorCategory.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
    );
    
    const isDrivewayOrStreet = events.some(e => {
      const zoneType = e.zone?.zoneType?.toUpperCase() || '';
      return zoneType.includes('DRIVEWAY') || 
             zoneType.includes('STREET') || 
             zoneType.includes('ALLEY');
    });
    
    const dwellTime = context.track?.dwellSecondsPrivate || 0;
    
    return hasVehicle && isDrivewayOrStreet && dwellTime >= FusionConfig.DWELL_THRESHOLD_VEHICLE;
  },
  
  severityUpgrade: (events, context) => {
    const dwellTime = context.track?.dwellSecondsPrivate || 0;
    if (['NIGHT', 'AWAY'].includes(context.houseMode) || 
        dwellTime >= FusionConfig.DWELL_THRESHOLD_VEHICLE_SEVERE) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }
};

/**
 * R10: Vehicle Repeated Appearance
 */
const R10_SUSPICIOUS_VEHICLE_REPEATED = {
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
      SensorCategory.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
    );
    
    return hasRepeatedFlag && hasVehicle;
  }
};

/**
 * R10B: Vehicle Loitering (Camera AI Flag)
 */
const R10B_SUSPICIOUS_VEHICLE_LOITER = {
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
      return flags.some(f => 
        f.includes('loiter') || f.includes('linger') || f.includes('loitering')
      );
    });
    
    const hasVehicle = events.some(e => 
      SensorCategory.VEHICLE_SENSORS.includes(e.sensor?.sensorType)
    );
    
    return hasLoiteringFlag && hasVehicle;
  },
  
  severityUpgrade: (events, context) => {
    if (['NIGHT', 'AWAY'].includes(context.houseMode)) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }
};

module.exports = {
  // Person rules
  R6_SUSPICIOUS_PERSON_DWELL,
  R7_SUSPICIOUS_PERSON_LOITER_FLAG,
  R8_SUSPICIOUS_PERSON_BACKYARD,
  
  // Vehicle rules
  R9_SUSPICIOUS_VEHICLE_DWELL,
  R10_SUSPICIOUS_VEHICLE_REPEATED,
  R10B_SUSPICIOUS_VEHICLE_LOITER
};
