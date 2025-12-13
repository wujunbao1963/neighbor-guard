// ============================================================================
// Event Repository
// Data access layer for security events
// ============================================================================

const BaseRepository = require('./base.repository');
const { EventStatus, EventType } = require('../config/constants');

class EventRepository extends BaseRepository {
  constructor() {
    super('event');
  }

  /**
   * Find events for a circle with common includes
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
      orderBy: options.orderBy || { createdAt: 'desc' },
      include: options.include || {
        zone: true,
        creator: { select: { id: true, displayName: true } },
        primaryTrack: true
      },
      ...options
    });
  }

  /**
   * Find paginated events for a circle
   * @param {string} circleId - Circle ID
   * @param {Object} filters - Filter options { status, severity, eventType, dateFrom, dateTo }
   * @param {Object} pagination - { skip, take }
   * @returns {Promise<Object>}
   */
  async findByCirclePaginated(circleId, filters = {}, pagination = { skip: 0, take: 20 }) {
    const where = { circleId };
    
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.severity) {
      where.severity = filters.severity;
    }
    if (filters.eventType) {
      where.eventType = filters.eventType;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    return this.findPaginated({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        zone: true,
        creator: { select: { id: true, displayName: true } },
        primaryTrack: true
      }
    }, pagination);
  }

  /**
   * Find open events (not resolved or false alarm)
   * @param {string} circleId - Circle ID
   * @returns {Promise<Array>}
   */
  async findOpenEvents(circleId) {
    return this.findByCircle(circleId, {
      where: {
        status: { in: [EventStatus.OPEN, EventStatus.ACKED, EventStatus.WATCHING] }
      }
    });
  }

  /**
   * Find event by track ID
   * @param {string} trackId - Track ID
   * @returns {Promise<Object|null>}
   */
  async findByTrackId(trackId) {
    return this.findOne({
      primaryTrackId: trackId,
      status: { in: [EventStatus.OPEN, EventStatus.ACKED, EventStatus.WATCHING] }
    });
  }

  /**
   * Update event status
   * @param {string} eventId - Event ID
   * @param {string} status - New status
   * @param {string} resolverId - User ID who resolved (optional)
   * @returns {Promise<Object>}
   */
  async updateStatus(eventId, status, resolverId = null) {
    const data = { status };
    
    if ([EventStatus.RESOLVED, EventStatus.FALSE_ALARM].includes(status)) {
      data.resolvedAt = new Date();
      if (resolverId) data.resolverId = resolverId;
    }
    
    return this.update(eventId, data);
  }

  /**
   * Update event type (for escalation)
   * @param {string} eventId - Event ID
   * @param {string} eventType - New event type
   * @param {string} severity - New severity
   * @returns {Promise<Object>}
   */
  async escalate(eventId, eventType, severity) {
    return this.update(eventId, {
      eventType,
      severity,
      updatedAt: new Date()
    });
  }

  /**
   * Get event statistics for a circle
   * @param {string} circleId - Circle ID
   * @param {Date} since - Start date for statistics
   * @returns {Promise<Object>}
   */
  async getStatistics(circleId, since = null) {
    const where = { circleId };
    if (since) {
      where.createdAt = { gte: since };
    }

    const [total, byStatus, byType, bySeverity] = await Promise.all([
      this.count(where),
      this._countGroupBy(where, 'status'),
      this._countGroupBy(where, 'eventType'),
      this._countGroupBy(where, 'severity')
    ]);

    return { total, byStatus, byType, bySeverity };
  }

  /**
   * Group by helper
   * @private
   */
  async _countGroupBy(where, field) {
    const results = await this.model.groupBy({
      by: [field],
      where,
      _count: { _all: true }
    });
    
    return results.reduce((acc, row) => {
      acc[row[field]] = row._count._all;
      return acc;
    }, {});
  }

  /**
   * Find recent events for timeline
   * @param {string} circleId - Circle ID
   * @param {number} limit - Max events to return
   * @returns {Promise<Array>}
   */
  async findRecent(circleId, limit = 50) {
    return this.findMany({
      where: { circleId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        zone: true,
        creator: { select: { id: true, displayName: true } },
        media: true,
        primaryTrack: {
          include: {
            sensorEvents: {
              include: { sensor: true }
            }
          }
        }
      }
    });
  }
}

// Export singleton instance
module.exports = new EventRepository();
