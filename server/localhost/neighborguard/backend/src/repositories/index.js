// ============================================================================
// Repositories Index
// Central export for all repositories
// ============================================================================

const BaseRepository = require('./base.repository');
const eventRepository = require('./event.repository');
const sensorRepository = require('./sensor.repository');
const trackRepository = require('./track.repository');

module.exports = {
  BaseRepository,
  eventRepository,
  sensorRepository,
  trackRepository
};
