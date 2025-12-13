// ============================================================================
// Sensor Repository
// Data access layer for sensors
// ============================================================================

const BaseRepository = require('./base.repository');

class SensorRepository extends BaseRepository {
  constructor() {
    super('sensor');
  }

  /**
   * Find sensors for a circle
   * @param {string} circleId - Circle ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByCircle(circleId, options = {}) {
    return this.findMany({
      where: {
        circleId,
        ...options.where
      },
      orderBy: options.orderBy || { name: 'asc' },
      include: options.include || {
        zone: true,
        integration: true
      }
    });
  }

  /**
   * Find sensor by external ID
   * @param {string} circleId - Circle ID
   * @param {string} externalId - External sensor ID (from integration)
   * @returns {Promise<Object|null>}
   */
  async findByExternalId(circleId, externalId) {
    return this.findOne({
      circleId,
      externalId
    }, {
      include: { zone: true, integration: true }
    });
  }

  /**
   * Find sensors by zone
   * @param {string} zoneId - Zone ID
   * @returns {Promise<Array>}
   */
  async findByZone(zoneId) {
    return this.findMany({
      where: { zoneId },
      include: { zone: true }
    });
  }

  /**
   * Find sensors by type
   * @param {string} circleId - Circle ID
   * @param {string|Array} sensorTypes - Sensor type(s) to find
   * @returns {Promise<Array>}
   */
  async findByType(circleId, sensorTypes) {
    const types = Array.isArray(sensorTypes) ? sensorTypes : [sensorTypes];
    return this.findMany({
      where: {
        circleId,
        sensorType: { in: types }
      },
      include: { zone: true }
    });
  }

  /**
   * Update sensor state
   * @param {string} sensorId - Sensor ID
   * @param {string} state - New state value
   * @param {Date} stateAt - Time of state change
   * @returns {Promise<Object>}
   */
  async updateState(sensorId, state, stateAt = new Date()) {
    return this.update(sensorId, {
      lastState: state,
      lastStateAt: stateAt,
      status: 'ONLINE'
    });
  }

  /**
   * Update sensor battery level
   * @param {string} sensorId - Sensor ID
   * @param {number} batteryLevel - Battery percentage
   * @returns {Promise<Object>}
   */
  async updateBattery(sensorId, batteryLevel) {
    const status = batteryLevel < 20 ? 'LOW_BATTERY' : 'ONLINE';
    return this.update(sensorId, {
      batteryLevel,
      status
    });
  }

  /**
   * Mark sensors as offline if not updated recently
   * @param {string} circleId - Circle ID
   * @param {number} thresholdMinutes - Minutes without update to mark offline
   * @returns {Promise<{ count: number }>}
   */
  async markStaleOffline(circleId, thresholdMinutes = 60) {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    
    return this.updateMany(
      {
        circleId,
        status: { not: 'OFFLINE' },
        lastStateAt: { lt: cutoff }
      },
      { status: 'OFFLINE' }
    );
  }

  /**
   * Get sensor with full context for fusion engine
   * @param {string} sensorId - Sensor ID
   * @returns {Promise<Object>}
   */
  async findWithContext(sensorId) {
    return this.findById(sensorId, {
      include: {
        zone: true,
        integration: true,
        circle: {
          include: {
            home: true,
            members: true
          }
        }
      }
    });
  }

  /**
   * Find enabled sensors for integration sync
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Array>}
   */
  async findByIntegration(integrationId) {
    return this.findMany({
      where: {
        integrationId,
        isEnabled: true
      },
      include: { zone: true }
    });
  }
}

// Export singleton instance
module.exports = new SensorRepository();
