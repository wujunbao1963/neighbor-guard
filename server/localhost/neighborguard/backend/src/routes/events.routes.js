// ============================================================================
// Events Routes (Refactored)
// Thin routing layer - delegates to controller
// ============================================================================

const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');
const { authenticate, requireCircle } = require('../middleware/auth');

// All routes require authentication and circle context
router.use(authenticate);
router.use(requireCircle);

// ============================================================================
// Event List Routes
// ============================================================================

// Get events (paginated, filtered)
router.get('/', eventsController.getEvents);

// Get recent events for timeline
router.get('/recent', eventsController.getRecentEvents);

// Get open (unresolved) events
router.get('/open', eventsController.getOpenEvents);

// Get event statistics
router.get('/stats', eventsController.getEventStats);

// ============================================================================
// Single Event Routes
// ============================================================================

// Create manual event
router.post('/', eventsController.createEvent);

// Get event details
router.get('/:eventId', eventsController.getEvent);

// Update event status
router.put('/:eventId/status', eventsController.updateEventStatus);

// Submit feedback
router.post('/:eventId/feedback', eventsController.submitFeedback);

// Delete event (admin only)
router.delete('/:eventId', eventsController.deleteEvent);

module.exports = router;
