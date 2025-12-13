// ============================================================================
// Events Controller
// Request handling for security event endpoints
// ============================================================================

const { eventRepository } = require('../repositories');
const { asyncHandler, ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const { pagination } = require('../utils/validators');
const { apiLogger } = require('../utils/logger');

/**
 * GET /api/events
 * Get events for the current circle
 */
const getEvents = asyncHandler(async (req, res) => {
  const circleId = req.circleId;
  
  if (!circleId) {
    throw new ValidationError('Circle ID is required');
  }

  // Parse pagination and filters
  const paginationParams = pagination(req.query);
  const filters = {
    status: req.query.status,
    severity: req.query.severity,
    eventType: req.query.eventType,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo
  };

  const result = await eventRepository.findByCirclePaginated(
    circleId,
    filters,
    paginationParams
  );

  res.json({
    success: true,
    ...result
  });
});

/**
 * GET /api/events/recent
 * Get recent events for timeline
 */
const getRecentEvents = asyncHandler(async (req, res) => {
  const circleId = req.circleId;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const events = await eventRepository.findRecent(circleId, limit);

  res.json({
    success: true,
    data: events,
    count: events.length
  });
});

/**
 * GET /api/events/open
 * Get open (unresolved) events
 */
const getOpenEvents = asyncHandler(async (req, res) => {
  const circleId = req.circleId;

  const events = await eventRepository.findOpenEvents(circleId);

  res.json({
    success: true,
    data: events,
    count: events.length
  });
});

/**
 * GET /api/events/stats
 * Get event statistics
 */
const getEventStats = asyncHandler(async (req, res) => {
  const circleId = req.circleId;
  const { since } = req.query;

  const sinceDate = since ? new Date(since) : null;
  const stats = await eventRepository.getStatistics(circleId, sinceDate);

  res.json({
    success: true,
    stats
  });
});

/**
 * GET /api/events/:eventId
 * Get single event details
 */
const getEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const circleId = req.circleId;

  const event = await eventRepository.findById(eventId, {
    include: {
      zone: true,
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      resolver: { select: { id: true, displayName: true } },
      media: true,
      primaryTrack: {
        include: {
          sensorEvents: {
            include: { sensor: true, zone: true },
            orderBy: { occurredAt: 'asc' }
          }
        }
      },
      feedback: true,
      mlFeatures: true
    }
  });

  // Verify event belongs to user's circle
  if (event.circleId !== circleId) {
    throw new AuthorizationError('Access denied to this event');
  }

  res.json({
    success: true,
    data: event
  });
});

/**
 * PUT /api/events/:eventId/status
 * Update event status
 */
const updateEventStatus = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  const circleId = req.circleId;

  if (!status) {
    throw new ValidationError('Status is required');
  }

  const validStatuses = ['OPEN', 'ACKED', 'WATCHING', 'RESOLVED', 'FALSE_ALARM'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  // Verify event belongs to circle
  const event = await eventRepository.findById(eventId);
  if (event.circleId !== circleId) {
    throw new AuthorizationError('Access denied to this event');
  }

  const updated = await eventRepository.updateStatus(eventId, status, userId);

  apiLogger.info('Event status updated', { eventId, status, userId });

  res.json({
    success: true,
    data: updated
  });
});

/**
 * POST /api/events/:eventId/feedback
 * Submit feedback for an event
 */
const submitFeedback = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { rating, label, notes } = req.body;
  const userId = req.user.id;
  const circleId = req.circleId;

  // Validate
  if (rating === undefined || !label) {
    throw new ValidationError('Rating and label are required');
  }

  // Verify event belongs to circle
  const event = await eventRepository.findById(eventId);
  if (event.circleId !== circleId) {
    throw new AuthorizationError('Access denied to this event');
  }

  // Create or update feedback
  const prisma = require('../config/database');
  const { v4: uuidv4 } = require('uuid');

  const feedback = await prisma.eventFeedback.upsert({
    where: {
      eventId_memberId: {
        eventId,
        memberId: req.memberId
      }
    },
    create: {
      id: uuidv4(),
      eventId,
      circleId,
      memberId: req.memberId,
      rating,
      label,
      notes,
      feedbackSource: 'APP'
    },
    update: {
      rating,
      label,
      notes,
      updatedAt: new Date()
    }
  });

  apiLogger.info('Event feedback submitted', { eventId, rating, label, userId });

  res.json({
    success: true,
    data: feedback
  });
});

/**
 * DELETE /api/events/:eventId
 * Delete an event (admin only)
 */
const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const circleId = req.circleId;
  const memberRole = req.memberRole;

  // Only owners and admins can delete
  if (!['OWNER', 'ADMIN'].includes(memberRole)) {
    throw new AuthorizationError('Only owners and admins can delete events');
  }

  // Verify event belongs to circle
  const event = await eventRepository.findById(eventId);
  if (event.circleId !== circleId) {
    throw new AuthorizationError('Access denied to this event');
  }

  await eventRepository.delete(eventId);

  apiLogger.info('Event deleted', { eventId, userId: req.user.id });

  res.json({
    success: true,
    message: 'Event deleted'
  });
});

/**
 * POST /api/events
 * Create a manual event
 */
const createEvent = asyncHandler(async (req, res) => {
  const circleId = req.circleId;
  const userId = req.user.id;
  const memberId = req.memberId;
  
  const { 
    zoneId, 
    eventType, 
    title, 
    description, 
    severity = 'LOW',
    mediaIds 
  } = req.body;

  if (!eventType || !title) {
    throw new ValidationError('Event type and title are required');
  }

  const prisma = require('../config/database');
  const { v4: uuidv4 } = require('uuid');

  const event = await prisma.event.create({
    data: {
      id: uuidv4(),
      circleId,
      zoneId,
      creatorId: memberId,
      eventType,
      title,
      description,
      severity,
      status: 'OPEN',
      sourceType: 'MANUAL'
    },
    include: {
      zone: true,
      creator: { select: { id: true, displayName: true } }
    }
  });

  // Link media if provided
  if (mediaIds && mediaIds.length > 0) {
    await prisma.media.updateMany({
      where: { id: { in: mediaIds } },
      data: { eventId: event.id }
    });
  }

  apiLogger.info('Manual event created', { eventId: event.id, eventType, userId });

  res.status(201).json({
    success: true,
    data: event
  });
});

module.exports = {
  getEvents,
  getRecentEvents,
  getOpenEvents,
  getEventStats,
  getEvent,
  updateEventStatus,
  submitFeedback,
  deleteEvent,
  createEvent
};
