// ============================================================================
// Safety Rules
// Rules for detecting safety hazards (fire, CO, water leak)
// ============================================================================

const { SensorType } = require('../../config/constants/sensorTypes');

/**
 * R14: Fire Detection
 * Always triggers regardless of house mode
 */
const R14_FIRE_DETECTED = {
  id: 'R14_FIRE_DETECTED',
  name: 'Fire Detected',
  description: 'Smoke detector triggered',
  eventType: 'fire_detected',
  severity: 'HIGH',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 10,
  
  conditions: (events, context) => {
    return events.some(e => e.sensor?.sensorType === SensorType.SMOKE);
  },
  
  // Safety events always HIGH, cannot be downgraded
  safetyFloor: 'HIGH'
};

/**
 * R15: Carbon Monoxide Detection
 * Always triggers regardless of house mode
 */
const R15_CO_DETECTED = {
  id: 'R15_CO_DETECTED',
  name: 'Carbon Monoxide Detected',
  description: 'CO detector triggered',
  eventType: 'co_detected',
  severity: 'HIGH',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 10,
  
  conditions: (events, context) => {
    return events.some(e => e.sensor?.sensorType === SensorType.CO_DETECTOR);
  },
  
  safetyFloor: 'HIGH'
};

/**
 * R16: Water Leak Detection
 */
const R16_WATER_LEAK = {
  id: 'R16_WATER_LEAK',
  name: 'Water Leak Detected',
  description: 'Water leak sensor triggered',
  eventType: 'water_leak_detected',
  severity: 'HIGH',
  requiredModes: ['DISARMED', 'HOME', 'NIGHT', 'AWAY'],
  windowSeconds: 10,
  
  conditions: (events, context) => {
    return events.some(e => e.sensor?.sensorType === SensorType.WATER_LEAK);
  },
  
  safetyFloor: 'NORMAL'
};

module.exports = {
  R14_FIRE_DETECTED,
  R15_CO_DETECTED,
  R16_WATER_LEAK
};
