# NeighborGuard Phase 2 - Fusion Rules Reference

## Overview

The FusionEngine evaluates rules in priority order. The first matching rule determines the event type. Safety rules always take precedence.

---

## Rule Priority Order

| Priority | Rule ID | Event Type | Description |
|----------|---------|------------|-------------|
| 1 | R14_FIRE_DETECTED | fire_detected | Smoke sensor triggered |
| 2 | R15_CO_DETECTED | co_detected | CO detector triggered |
| 3 | R16_WATER_LEAK | water_leak_detected | Water leak sensor |
| 4 | R1_BREAKIN_DOOR_PIR | break_in_attempt | Door/window + indoor motion |
| 5 | R2_BREAKIN_GLASS_PERSON | break_in_attempt | Glass break + person |
| 6 | R3_BREAKIN_INTRUSION_FLAG | break_in_attempt | Camera AI intrusion alert |
| 7 | R4_PERIMETER_GLASS_ONLY | perimeter_damage | Glass break without person |
| 8 | R5_PERIMETER_VIBRATION | perimeter_damage | Strong vibration detected |
| 9 | R6_SUSPICIOUS_PERSON_DWELL | suspicious_person | Person dwelling 20+ sec in private zone |
| 10 | R7_SUSPICIOUS_PERSON_LOITER | suspicious_person | Camera loitering flag |
| 11 | R8_SUSPICIOUS_PERSON_BACKYARD | suspicious_person | Person in backyard/side area |
| 12 | R9_SUSPICIOUS_VEHICLE_DWELL | suspicious_vehicle | Vehicle 2+ min dwell |
| 13 | R10_SUSPICIOUS_VEHICLE_REPEATED | suspicious_vehicle | Repeated vehicle appearance |
| 14 | R10B_SUSPICIOUS_VEHICLE_LOITER | suspicious_vehicle | Vehicle loitering flag |
| 15 | R12_PACKAGE_DELIVERED | package_delivered | Package appeared |
| 16 | R13_PACKAGE_TAKEN | package_taken | Package removed |
| 17 | R99_MOTION_ALERT | motion_detected | Fallback motion |

---

## Detailed Rule Specifications

### Safety Rules (Always Active)

#### R14_FIRE_DETECTED
```
Trigger: SMOKE sensor in triggered state
Event Type: fire_detected
Severity: HIGH (always)
Required Modes: ALL (DISARMED, HOME, AWAY, NIGHT)
Safety Floor: HIGH (cannot be downgraded)
```

#### R15_CO_DETECTED
```
Trigger: CO_DETECTOR sensor triggered
Event Type: co_detected
Severity: HIGH (always)
Required Modes: ALL
Safety Floor: HIGH
```

#### R16_WATER_LEAK
```
Trigger: WATER_LEAK sensor triggered
Event Type: water_leak_detected
Severity: HIGH
Required Modes: ALL
```

---

### Break-in Rules

#### R1_BREAKIN_DOOR_PIR
```
Conditions:
  - Door/window sensor triggered (DOOR_CONTACT, WINDOW_CONTACT, or LOCK)
  - Indoor motion detected (PIR or CAMERA_MOTION in PRIVATE/RESTRICTED zone)
  - Door sensor is at entry point zone

Event Type: break_in_attempt
Severity: HIGH
Required Modes: NIGHT, AWAY
Time Window: 30 seconds
```

**Logic:**
```javascript
const hasDoorSensor = events.some(e => 
  ['DOOR_CONTACT', 'WINDOW_CONTACT', 'LOCK'].includes(e.sensor?.sensorType)
);
const hasIndoorMotion = events.some(e => 
  ['PIR', 'CAMERA_MOTION'].includes(e.sensor?.sensorType) &&
  ['PRIVATE', 'RESTRICTED'].includes(e.zone?.privacyLevel)
);
const isEntryZone = events.some(e => e.zone?.isEntryPoint);

return hasDoorSensor && hasIndoorMotion && isEntryZone;
```

#### R2_BREAKIN_GLASS_PERSON
```
Conditions:
  - Glass break sensor triggered (GLASS_BREAK or MIC_GLASS_BREAK)
  - Person detected (CAMERA_PERSON or PIR)

Event Type: break_in_attempt
Severity: HIGH
Required Modes: NIGHT, AWAY, HOME
Time Window: 30 seconds
```

#### R3_BREAKIN_INTRUSION_FLAG
```
Conditions:
  - Camera AI flagged 'intrusion', 'line_cross', or 'forced_entry'
  - Door activity present
  - Zone is PRIVATE or RESTRICTED

Event Type: break_in_attempt
Severity: HIGH
Required Modes: NIGHT, AWAY
Time Window: 30 seconds
```

---

### Perimeter Rules

#### R4_PERIMETER_GLASS_ONLY
```
Conditions:
  - Glass break sensor triggered
  - NO person detected (differentiates from break-in)

Event Type: perimeter_damage
Severity: MEDIUM (upgrades to HIGH in NIGHT/AWAY)
Required Modes: NIGHT, AWAY, HOME
Time Window: 60 seconds
```

#### R5_PERIMETER_VIBRATION
```
Conditions:
  - VIBRATION sensor triggered

Event Type: perimeter_damage
Severity: MEDIUM
Required Modes: NIGHT, AWAY
Time Window: 30 seconds
```

---

### Suspicious Person Rules

#### R6_SUSPICIOUS_PERSON_DWELL
```
Conditions:
  - Person detected (CAMERA_PERSON or PIR)
  - Zone is PRIVATE or RESTRICTED
  - Track dwell time >= 20 seconds in private zone

Event Type: suspicious_person
Severity: MEDIUM (upgrades to HIGH in NIGHT/AWAY)
Required Modes: NIGHT, AWAY, HOME
Time Window: 120 seconds
```

#### R7_SUSPICIOUS_PERSON_LOITER
```
Conditions:
  - Person detected
  - Camera AI flagged 'loiter', 'linger', or 'loitering'

Event Type: suspicious_person
Severity: MEDIUM (upgrades to HIGH in NIGHT/AWAY + PRIVATE zone)
Required Modes: NIGHT, AWAY, HOME
Time Window: 60 seconds
```

#### R8_SUSPICIOUS_PERSON_BACKYARD
```
Conditions:
  - Person detected
  - Zone is backyard area (BACK_YARD, SIDE_YARD, PATIO, etc.)

Event Type: suspicious_person
Severity: MEDIUM
Required Modes: NIGHT, AWAY
Time Window: 60 seconds
```

---

### Suspicious Vehicle Rules

#### R9_SUSPICIOUS_VEHICLE_DWELL
```
Conditions:
  - Vehicle detected (CAMERA_VEHICLE)
  - Zone is DRIVEWAY, STREET, or ALLEY
  - Track dwell time >= 120 seconds

Event Type: suspicious_vehicle
Severity: MEDIUM (upgrades to HIGH if dwell >= 300 sec or NIGHT/AWAY mode)
Required Modes: NIGHT, AWAY, HOME
Time Window: 300 seconds
```

#### R10_SUSPICIOUS_VEHICLE_REPEATED
```
Conditions:
  - Vehicle detected
  - Camera AI flagged 'repeated' or 'seen_before'

Event Type: suspicious_vehicle
Severity: MEDIUM
Required Modes: NIGHT, AWAY, HOME
Time Window: 600 seconds
```

#### R10B_SUSPICIOUS_VEHICLE_LOITER
```
Conditions:
  - Vehicle detected
  - Camera AI flagged 'loiter', 'linger', or 'loitering'

Event Type: suspicious_vehicle
Severity: MEDIUM (upgrades to HIGH in NIGHT/AWAY)
Required Modes: NIGHT, AWAY, HOME
Time Window: 300 seconds
```

---

### Package Rules

#### R12_PACKAGE_DELIVERED
```
Conditions:
  - CAMERA_PACKAGE sensor OR 'item_forgotten'/'package'/'delivered' flag
  - Zone is front area (FRONT_DOOR, PORCH, FRONT_YARD)

Event Type: package_delivered
Severity: LOW
Required Modes: ALL
Time Window: 60 seconds
```

#### R13_PACKAGE_TAKEN
```
Conditions:
  - 'item_taken' or 'removed' flag present

Event Type: package_taken
Severity: LOW (upgrades to MEDIUM in NIGHT/AWAY)
Required Modes: ALL
Time Window: 60 seconds
```

---

### Fallback Rule

#### R99_MOTION_ALERT
```
Conditions:
  - Motion or person detected
  - No other rules matched

Event Type: motion_detected
Severity: LOW
Required Modes: NIGHT, AWAY
Time Window: 30 seconds
```

---

## Sensor Categories

```javascript
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
```

---

## Configuration Constants

```javascript
// Track management
TRACK_WINDOW_SECONDS = 120        // Time window for grouping events
TRACK_GAP_SECONDS = 60            // Gap before creating new track

// Dwell time thresholds
DWELL_THRESHOLD_PERSON = 20       // 20 sec for suspicious person
DWELL_THRESHOLD_VEHICLE = 120     // 2 min for suspicious vehicle
DWELL_THRESHOLD_VEHICLE_SEVERE = 300  // 5 min for severe vehicle alert

// Privacy hierarchy (higher = more private)
PRIVACY_HIERARCHY = {
  'PUBLIC': 0,
  'SEMI_PRIVATE': 1,
  'PRIVATE': 2,
  'RESTRICTED': 3
}
```

---

## Severity Upgrade Logic

Severity can be upgraded based on context:

1. **House Mode**: NIGHT and AWAY modes often upgrade MEDIUM → HIGH
2. **Privacy Level**: Events in PRIVATE/RESTRICTED zones may upgrade
3. **Dwell Time**: Longer dwell times increase severity
4. **Safety Events**: Always remain at HIGH (safety floor)

---

## Event Type Upgrade Logic

When a higher-priority rule matches, the event type can be upgraded:

| Initial Type | Can Upgrade To | When |
|--------------|----------------|------|
| suspicious_person | break_in_attempt | Door activity + indoor motion |
| perimeter_damage | break_in_attempt | Person detected after glass break |
| motion_detected | suspicious_person | Prolonged dwell time |
| package_taken | suspicious_person | Unknown person taking package |

---

## Adding New Rules

To add a new fusion rule:

1. Create rule object in `/services/fusion/rules/` appropriate file
2. Add to RULE_PRIORITY array in rules/index.js
3. Add any new sensor types to SENSOR_CATEGORIES
4. Add test cases to E2E test suite
5. Update this documentation

Rule template:
```javascript
const NEW_RULE = {
  id: 'R_NEW_RULE',
  name: 'Human-readable Name',
  description: 'Detailed description',
  eventType: 'event_type_name',
  severity: 'HIGH' | 'MEDIUM' | 'LOW',
  requiredModes: ['NIGHT', 'AWAY', 'HOME', 'DISARMED'],
  windowSeconds: 60,
  
  conditions: (events, context) => {
    // Return true if rule matches
    return someCondition && anotherCondition;
  },
  
  severityUpgrade: (events, context) => {
    // Optional: return upgraded severity
    if (context.houseMode === 'NIGHT') return 'HIGH';
    return null; // No upgrade
  }
};
```
