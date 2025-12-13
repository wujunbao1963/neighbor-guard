// ============================================================================
// Track Repository
// Data access layer for activity tracks
// ============================================================================

const BaseRepository = require('./base.repository');
const { FusionConfig } = require('../config/constants');

class TrackRepository extends BaseRepository {
  constructor() {
    super('track');
  }

  /**
   * Find active track for a circle within time window
   * @param {string} circleId - Circle ID
   * @param {string} externalTrackId - Optional external track ID for correlation
   * @param {Date} windowStart - Start of time window
   * @returns {Promise<Object|null>}
   */
  async findActiveTrack(circleId, externalTrackId = null, windowStart = null) {
    const cutoff = windowStart || new Date(Date.now() - FusionConfig.TRACK_GAP_SECONDS * 1000);
    
    const where = {
      circleId,
      isClosed: false,
      endTime: { gte: cutoff }
    };
    
    // If we have an external track ID, prioritize matching that
    if (externalTrackId) {
      where.externalTrackId = externalTrackId;
    }
    
    return this.findOne(where, {
      orderBy: { endTime: 'desc' },
      include: {
        sensorEvents: {
          include: {
            sensor: true,
            zone: true
          },
          orderBy: { occurredAt: 'asc' }
        }
      }
    });
  }

  /**
   * Find or create a track for a sensor event
   * @param {string} circleId - Circle ID
   * @param {string} externalTrackId - Optional external track ID
   * @param {Date} eventTime - Time of the sensor event
   * @returns {Promise<Object>}
   */
  async findOrCreateTrack(circleId, externalTrackId = null, eventTime = new Date()) {
    // Try to find existing active track
    const existingTrack = await this.findActiveTrack(circleId, externalTrackId);
    
    if (existingTrack) {
      return existingTrack;
    }
    
    // Create new track
    const { v4: uuidv4 } = require('uuid');
    return this.create({
      id: uuidv4(),
      circleId,
      externalTrackId,
      startTime: eventTime,
      endTime: eventTime,
      pathSummary: '',
      dwellSecondsPrivate: 0,
      maxPrivacyLevel: 'PUBLIC',
      isClosed: false
    });
  }

  /**
   * Update track with new sensor event
   * @param {string} trackId - Track ID
   * @param {Object} updateData - { endTime, pathSummary, maxPrivacyLevel, dwellSecondsPrivate }
   * @returns {Promise<Object>}
   */
  async updateWithEvent(trackId, updateData) {
    return this.update(trackId, {
      endTime: updateData.endTime,
      pathSummary: updateData.pathSummary,
      maxPrivacyLevel: updateData.maxPrivacyLevel,
      dwellSecondsPrivate: updateData.dwellSecondsPrivate
    });
  }

  /**
   * Get track with all related data
   * @param {string} trackId - Track ID
   * @returns {Promise<Object>}
   */
  async findWithFullContext(trackId) {
    return this.findById(trackId, {
      include: {
        sensorEvents: {
          include: {
            sensor: true,
            zone: true
          },
          orderBy: { occurredAt: 'asc' }
        },
        events: true
      }
    });
  }

  /**
   * Close stale tracks
   * @param {string} circleId - Circle ID (optional, close for all if not provided)
   * @param {number} maxAgeSeconds - Seconds since last activity
   * @returns {Promise<{ count: number }>}
   */
  async closeStaleTrack(circleId = null, maxAgeSeconds = 300) {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
    
    const where = {
      isClosed: false,
      endTime: { lt: cutoff }
    };
    
    if (circleId) {
      where.circleId = circleId;
    }
    
    return this.updateMany(where, { isClosed: true });
  }

  /**
   * Get track statistics for analysis
   * @param {string} circleId - Circle ID
   * @param {Date} since - Start date
   * @returns {Promise<Object>}
   */
  async getTrackStats(circleId, since = null) {
    const where = { circleId };
    if (since) {
      where.startTime = { gte: since };
    }

    const tracks = await this.findMany({ where });
    
    const stats = {
      totalTracks: tracks.length,
      avgDwellSeconds: 0,
      maxDwellSeconds: 0,
      privacyLevelDistribution: {}
    };
    
    if (tracks.length > 0) {
      const dwells = tracks.map(t => t.dwellSecondsPrivate || 0);
      stats.avgDwellSeconds = Math.round(dwells.reduce((a, b) => a + b, 0) / tracks.length);
      stats.maxDwellSeconds = Math.max(...dwells);
      
      for (const track of tracks) {
        const level = track.maxPrivacyLevel || 'UNKNOWN';
        stats.privacyLevelDistribution[level] = (stats.privacyLevelDistribution[level] || 0) + 1;
      }
    }
    
    return stats;
  }

  /**
   * Find recent tracks for a circle
   * @param {string} circleId - Circle ID
   * @param {number} limit - Maximum tracks to return
   * @returns {Promise<Array>}
   */
  async findRecent(circleId, limit = 20) {
    return this.findMany({
      where: { circleId },
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        sensorEvents: {
          include: { sensor: true },
          take: 5 // Limit sensor events per track
        },
        events: true
      }
    });
  }
}

// Export singleton instance
module.exports = new TrackRepository();
