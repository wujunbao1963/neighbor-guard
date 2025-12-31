// ============================================================================
// Controllers Index
// Central export for all controllers
// ============================================================================

const authController = require('./auth.controller');
const eventsController = require('./events.controller');

module.exports = {
  authController,
  eventsController
};
