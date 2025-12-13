// ============================================================================
// NeighborGuard MVP - System Configuration
// Zone Types and Event Types definitions
// ============================================================================

// ============================================================================
// Zone Types Configuration (18 types)
// ============================================================================
const ZONE_TYPES = [
  // Front Zone (前区) - 3
  { value: 'FRONT_DOOR', label: '前门', labelEn: 'Front Door', zoneGroup: 'front', icon: '🚪', description: '房屋对外主要出入口', descriptionEn: 'Main entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: true, displayOrder: 1 },
  { value: 'FRONT_YARD', label: '前院', labelEn: 'Front Yard', zoneGroup: 'front', icon: '🌿', description: '前门前方的院子', descriptionEn: 'Front yard', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 2 },
  { value: 'FRONT_STREET', label: '门前街道', labelEn: 'Front Street', zoneGroup: 'front', icon: '🛣️', description: '房屋正前方的街道', descriptionEn: 'Street in front', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 3 },
  
  // Side Zone (侧区) - 3
  { value: 'SIDE_YARD', label: '侧院/侧通道', labelEn: 'Side Yard', zoneGroup: 'side', icon: '🏡', description: '房屋侧面的过道', descriptionEn: 'Side passage', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 4 },
  { value: 'SIDE_DOOR', label: '侧门', labelEn: 'Side Door', zoneGroup: 'side', icon: '🚪', description: '房屋侧面的门', descriptionEn: 'Side door', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 5 },
  { value: 'SIDE_DRIVEWAY', label: '侧区车道', labelEn: 'Side Driveway', zoneGroup: 'side', icon: '🛣️', description: '房屋侧面的车道', descriptionEn: 'Side driveway', supportedHouseTypes: ['DETACHED', 'SEMI'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 6 },
  
  // Back Zone (后区) - 3
  { value: 'BACK_YARD', label: '后院', labelEn: 'Back Yard', zoneGroup: 'back', icon: '🌳', description: '房子后方的院子', descriptionEn: 'Backyard', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: false, isHighValueArea: false, displayOrder: 7 },
  { value: 'BACK_DOOR', label: '后门', labelEn: 'Back Door', zoneGroup: 'back', icon: '🚪', description: '房屋后方的门', descriptionEn: 'Back door', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 8 },
  { value: 'BACK_STREET', label: '后街/后巷', labelEn: 'Back Alley', zoneGroup: 'back', icon: '🛣️', description: '房屋后方的街道', descriptionEn: 'Back alley', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 9 },
  
  // Garage Zone (车库区) - 2
  { value: 'GARAGE_DRIVEWAY', label: '车库车道', labelEn: 'Garage Driveway', zoneGroup: 'garage', icon: '🚗', description: '通往车库的车道', descriptionEn: 'Driveway to garage', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: false, displayOrder: 10 },
  { value: 'GARAGE_DOOR', label: '车库门', labelEn: 'Garage Door', zoneGroup: 'garage', icon: '🏠', description: '车库门入口', descriptionEn: 'Garage entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: true, isHighValueArea: true, displayOrder: 11 },
  
  // Special Zone (特殊区域) - 7
  { value: 'BASEMENT', label: '地下室入口', labelEn: 'Basement', zoneGroup: 'special', icon: '🏚️', description: '地下室的入口或窗户', descriptionEn: 'Basement entrance', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: true, displayOrder: 12 },
  { value: 'BUILDING_ENTRANCE', label: '楼宇大门', labelEn: 'Building Entrance', zoneGroup: 'special', icon: '🏢', description: '公寓楼宇主入口', descriptionEn: 'Building main entrance', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: true, isHighValueArea: true, displayOrder: 13 },
  { value: 'SHARED_HALLWAY', label: '共用走廊', labelEn: 'Shared Hallway', zoneGroup: 'special', icon: '🚶', description: '楼内的共用走廊', descriptionEn: 'Shared hallway', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 14 },
  { value: 'UNIT_DOOR', label: '单元门', labelEn: 'Unit Door', zoneGroup: 'special', icon: '🚪', description: '公寓单元的门', descriptionEn: 'Unit door', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: true, isPublicFacing: false, isHighValueArea: true, displayOrder: 15 },
  { value: 'PARKING_AREA', label: '停车区', labelEn: 'Parking Area', zoneGroup: 'special', icon: '🅿️', description: '停车场/车位', descriptionEn: 'Parking lot', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: true, isHighValueArea: false, displayOrder: 16 },
  { value: 'BALCONY', label: '阳台/露台', labelEn: 'Balcony', zoneGroup: 'special', icon: '🪟', description: '阳台或露台区域', descriptionEn: 'Balcony', supportedHouseTypes: ['ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 17 },
  { value: 'OTHER', label: '其他区域', labelEn: 'Other', zoneGroup: 'special', icon: '📍', description: '其他未分类的区域', descriptionEn: 'Other areas', supportedHouseTypes: ['DETACHED', 'SEMI', 'ROW', 'APARTMENT'], defaultEnabled: false, isPublicFacing: false, isHighValueArea: false, displayOrder: 18 }
];

// ============================================================================
// Event Types Configuration (7 types)
// ============================================================================
const EVENT_TYPES = [
  { value: 'break_in_attempt', label: '试图入室', labelEn: 'Break-in Attempt', icon: '🚨', severity: 'HIGH', description: '有人试图非法进入', descriptionEn: 'Someone attempting to enter', allowedZones: ['FRONT_DOOR', 'SIDE_DOOR', 'BACK_DOOR', 'GARAGE_DOOR', 'BASEMENT', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'BALCONY'], displayOrder: 1 },
  { value: 'perimeter_damage', label: '门窗/玻璃破坏', labelEn: 'Perimeter Damage', icon: '🧱', severity: 'HIGH', description: '门窗或玻璃被破坏', descriptionEn: 'Doors/windows damaged', allowedZones: ['FRONT_DOOR', 'BACK_DOOR', 'SIDE_DOOR', 'GARAGE_DOOR', 'BASEMENT', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'BALCONY', 'BACK_YARD'], displayOrder: 2 },
  { value: 'suspicious_person', label: '可疑人员', labelEn: 'Suspicious Person', icon: '⚠️', severity: 'MEDIUM', description: '发现可疑人员', descriptionEn: 'Suspicious person observed', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'FRONT_STREET', 'SIDE_YARD', 'SIDE_DOOR', 'SIDE_DRIVEWAY', 'BACK_YARD', 'BACK_DOOR', 'BACK_STREET', 'GARAGE_DRIVEWAY', 'GARAGE_DOOR', 'PARKING_AREA', 'BUILDING_ENTRANCE', 'SHARED_HALLWAY', 'UNIT_DOOR', 'BALCONY', 'OTHER'], displayOrder: 3 },
  { value: 'suspicious_vehicle', label: '可疑车辆', labelEn: 'Suspicious Vehicle', icon: '🚗', severity: 'MEDIUM', description: '发现可疑车辆', descriptionEn: 'Suspicious vehicle observed', allowedZones: ['FRONT_STREET', 'BACK_STREET', 'GARAGE_DRIVEWAY', 'SIDE_DRIVEWAY', 'PARKING_AREA'], displayOrder: 4 },
  { value: 'unusual_noise', label: '异常声响/人影', labelEn: 'Unusual Noise', icon: '🔊', severity: 'MEDIUM', description: '听到异常声响', descriptionEn: 'Unusual sounds observed', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'FRONT_STREET', 'SIDE_YARD', 'SIDE_DOOR', 'BACK_YARD', 'BACK_DOOR', 'BACK_STREET', 'GARAGE_DOOR', 'GARAGE_DRIVEWAY', 'BASEMENT', 'BUILDING_ENTRANCE', 'SHARED_HALLWAY', 'UNIT_DOOR', 'PARKING_AREA', 'BALCONY', 'OTHER'], displayOrder: 5 },
  { value: 'package_event', label: '门口包裹', labelEn: 'Package Event', icon: '📦', severity: 'LOW', description: '包裹相关事件', descriptionEn: 'Package related event', allowedZones: ['FRONT_DOOR', 'FRONT_YARD', 'BUILDING_ENTRANCE', 'UNIT_DOOR', 'GARAGE_DOOR', 'OTHER'], displayOrder: 6 },
  { value: 'custom', label: '自定义安全事件', labelEn: 'Custom Event', icon: '✏️', severity: 'LOW', description: '其他安全事件', descriptionEn: 'Other security events', allowedZones: [], displayOrder: 7 }
];

// ============================================================================
// House Types
// ============================================================================
const HOUSE_TYPES = [
  { value: 'DETACHED', label: '独立屋', labelEn: 'Detached House' },
  { value: 'SEMI', label: '半独立屋', labelEn: 'Semi-Detached' },
  { value: 'ROW', label: '联排屋', labelEn: 'Row House / Townhouse' },
  { value: 'APARTMENT', label: '公寓', labelEn: 'Apartment / Condo' }
];

// ============================================================================
// Member Roles
// ============================================================================
const MEMBER_ROLES = [
  { value: 'OWNER', label: '屋主', labelEn: 'Owner', canEdit: true, canInvite: true },
  { value: 'HOUSEHOLD', label: '同住人', labelEn: 'Household Member', canEdit: true, canInvite: false },
  { value: 'NEIGHBOR', label: '邻居', labelEn: 'Neighbor', canEdit: false, canInvite: false },
  { value: 'RELATIVE', label: '亲友', labelEn: 'Family/Friend', canEdit: false, canInvite: false },
  { value: 'OBSERVER', label: '观察员', labelEn: 'Observer', canEdit: false, canInvite: false }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get zone types for a specific house type
 */
function getZoneTypesForHouseType(houseType) {
  return ZONE_TYPES.filter(z => z.supportedHouseTypes.includes(houseType))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get default enabled zones for a house type
 */
function getDefaultZonesForHouseType(houseType) {
  return ZONE_TYPES.filter(z => 
    z.supportedHouseTypes.includes(houseType) && z.defaultEnabled
  ).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get zone type by value
 */
function getZoneType(value) {
  return ZONE_TYPES.find(z => z.value === value);
}

/**
 * Get event type by value
 */
function getEventType(value) {
  return EVENT_TYPES.find(e => e.value === value);
}

module.exports = {
  ZONE_TYPES,
  EVENT_TYPES,
  HOUSE_TYPES,
  MEMBER_ROLES,
  getZoneTypesForHouseType,
  getDefaultZonesForHouseType,
  getZoneType,
  getEventType
};
