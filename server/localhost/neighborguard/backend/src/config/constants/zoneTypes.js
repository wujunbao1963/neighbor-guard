// ============================================================================
// Zone Type Constants
// Zone definitions for NeighborGuard
// ============================================================================

/**
 * Zone types - matches Prisma enum ZoneType
 */
const ZoneType = {
  // Entry points
  FRONT_DOOR: 'FRONT_DOOR',
  BACK_DOOR: 'BACK_DOOR',
  SIDE_DOOR: 'SIDE_DOOR',
  GARAGE_ENTRANCE: 'GARAGE_ENTRANCE',
  
  // Outdoor areas
  FRONT_YARD: 'FRONT_YARD',
  BACK_YARD: 'BACK_YARD',
  SIDE_YARD: 'SIDE_YARD',
  DRIVEWAY: 'DRIVEWAY',
  PORCH: 'PORCH',
  PATIO: 'PATIO',
  DECK: 'DECK',
  POOL: 'POOL',
  
  // Boundary areas
  STREET_FRONT: 'STREET_FRONT',
  ALLEY_BEHIND: 'ALLEY_BEHIND',
  SIDE_ALLEY: 'SIDE_ALLEY',
  FENCE_LINE: 'FENCE_LINE',
  
  // Interior areas
  LIVING_ROOM: 'LIVING_ROOM',
  HALLWAY: 'HALLWAY',
  HALLWAY_FRONT: 'HALLWAY_FRONT',
  HALLWAY_BACK: 'HALLWAY_BACK',
  STAIRS: 'STAIRS',
  GARAGE_INTERIOR: 'GARAGE_INTERIOR',
  BASEMENT: 'BASEMENT',
  
  // Custom
  CUSTOM: 'CUSTOM'
};

/**
 * Privacy levels for zones
 */
const PrivacyLevel = {
  PUBLIC: 'PUBLIC',
  SEMI_PRIVATE: 'SEMI_PRIVATE',
  PRIVATE: 'PRIVATE',
  RESTRICTED: 'RESTRICTED'
};

/**
 * Privacy level hierarchy (higher = more private)
 */
const PRIVACY_HIERARCHY = {
  [PrivacyLevel.PUBLIC]: 0,
  [PrivacyLevel.SEMI_PRIVATE]: 1,
  [PrivacyLevel.PRIVATE]: 2,
  [PrivacyLevel.RESTRICTED]: 3
};

/**
 * Zone type categories
 */
const ZoneCategory = {
  ENTRY_POINTS: [
    ZoneType.FRONT_DOOR,
    ZoneType.BACK_DOOR,
    ZoneType.SIDE_DOOR,
    ZoneType.GARAGE_ENTRANCE
  ],
  
  OUTDOOR: [
    ZoneType.FRONT_YARD,
    ZoneType.BACK_YARD,
    ZoneType.SIDE_YARD,
    ZoneType.DRIVEWAY,
    ZoneType.PORCH,
    ZoneType.PATIO,
    ZoneType.DECK,
    ZoneType.POOL
  ],
  
  BOUNDARY: [
    ZoneType.STREET_FRONT,
    ZoneType.ALLEY_BEHIND,
    ZoneType.SIDE_ALLEY,
    ZoneType.FENCE_LINE
  ],
  
  INTERIOR: [
    ZoneType.LIVING_ROOM,
    ZoneType.HALLWAY,
    ZoneType.HALLWAY_FRONT,
    ZoneType.HALLWAY_BACK,
    ZoneType.STAIRS,
    ZoneType.GARAGE_INTERIOR,
    ZoneType.BASEMENT
  ],
  
  BACKYARD_AREAS: [
    ZoneType.BACK_YARD,
    ZoneType.SIDE_YARD,
    ZoneType.ALLEY_BEHIND,
    ZoneType.SIDE_ALLEY,
    ZoneType.PATIO,
    ZoneType.DECK,
    ZoneType.POOL
  ]
};

/**
 * Default privacy levels by zone type
 */
const DEFAULT_PRIVACY_BY_ZONE = {
  // Entry points - RESTRICTED (most private)
  [ZoneType.FRONT_DOOR]: PrivacyLevel.RESTRICTED,
  [ZoneType.BACK_DOOR]: PrivacyLevel.RESTRICTED,
  [ZoneType.SIDE_DOOR]: PrivacyLevel.RESTRICTED,
  [ZoneType.GARAGE_ENTRANCE]: PrivacyLevel.RESTRICTED,
  
  // Outdoor - SEMI_PRIVATE
  [ZoneType.FRONT_YARD]: PrivacyLevel.SEMI_PRIVATE,
  [ZoneType.DRIVEWAY]: PrivacyLevel.SEMI_PRIVATE,
  [ZoneType.PORCH]: PrivacyLevel.SEMI_PRIVATE,
  
  // Backyard areas - PRIVATE
  [ZoneType.BACK_YARD]: PrivacyLevel.PRIVATE,
  [ZoneType.SIDE_YARD]: PrivacyLevel.PRIVATE,
  [ZoneType.PATIO]: PrivacyLevel.PRIVATE,
  [ZoneType.DECK]: PrivacyLevel.PRIVATE,
  [ZoneType.POOL]: PrivacyLevel.PRIVATE,
  
  // Boundary - varies
  [ZoneType.STREET_FRONT]: PrivacyLevel.PUBLIC,
  [ZoneType.ALLEY_BEHIND]: PrivacyLevel.PRIVATE,
  [ZoneType.SIDE_ALLEY]: PrivacyLevel.PRIVATE,
  [ZoneType.FENCE_LINE]: PrivacyLevel.SEMI_PRIVATE,
  
  // Interior - RESTRICTED
  [ZoneType.LIVING_ROOM]: PrivacyLevel.RESTRICTED,
  [ZoneType.HALLWAY]: PrivacyLevel.RESTRICTED,
  [ZoneType.HALLWAY_FRONT]: PrivacyLevel.RESTRICTED,
  [ZoneType.HALLWAY_BACK]: PrivacyLevel.RESTRICTED,
  [ZoneType.STAIRS]: PrivacyLevel.RESTRICTED,
  [ZoneType.GARAGE_INTERIOR]: PrivacyLevel.RESTRICTED,
  [ZoneType.BASEMENT]: PrivacyLevel.RESTRICTED,
  
  // Custom - default to SEMI_PRIVATE
  [ZoneType.CUSTOM]: PrivacyLevel.SEMI_PRIVATE
};

/**
 * Check if zone type is an entry point
 * @param {string} zoneType - Zone type to check
 * @returns {boolean}
 */
function isEntryPoint(zoneType) {
  return ZoneCategory.ENTRY_POINTS.includes(zoneType);
}

/**
 * Check if zone type is a backyard area
 * @param {string} zoneType - Zone type to check
 * @returns {boolean}
 */
function isBackyardArea(zoneType) {
  return ZoneCategory.BACKYARD_AREAS.includes(zoneType);
}

/**
 * Check if zone type is interior
 * @param {string} zoneType - Zone type to check
 * @returns {boolean}
 */
function isInterior(zoneType) {
  return ZoneCategory.INTERIOR.includes(zoneType);
}

/**
 * Get default privacy level for a zone type
 * @param {string} zoneType - Zone type
 * @returns {string} Privacy level
 */
function getDefaultPrivacyLevel(zoneType) {
  return DEFAULT_PRIVACY_BY_ZONE[zoneType] || PrivacyLevel.SEMI_PRIVATE;
}

/**
 * Compare two privacy levels
 * @param {string} level1 - First privacy level
 * @param {string} level2 - Second privacy level
 * @returns {number} Positive if level1 > level2, negative if level1 < level2, 0 if equal
 */
function comparePrivacyLevels(level1, level2) {
  return (PRIVACY_HIERARCHY[level1] || 0) - (PRIVACY_HIERARCHY[level2] || 0);
}

/**
 * Get the higher (more private) of two privacy levels
 * @param {string} level1 - First privacy level
 * @param {string} level2 - Second privacy level
 * @returns {string} The higher privacy level
 */
function getHigherPrivacyLevel(level1, level2) {
  return comparePrivacyLevels(level1, level2) >= 0 ? level1 : level2;
}

module.exports = {
  ZoneType,
  PrivacyLevel,
  ZoneCategory,
  PRIVACY_HIERARCHY,
  DEFAULT_PRIVACY_BY_ZONE,
  isEntryPoint,
  isBackyardArea,
  isInterior,
  getDefaultPrivacyLevel,
  comparePrivacyLevels,
  getHigherPrivacyLevel
};
