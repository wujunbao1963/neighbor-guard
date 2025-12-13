// ============================================================================
// Event Routes
// Phase 4: Event CRUD, Notes, and Status Management
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember, requireCircleOwner } = require('../middleware/auth');
const { EVENT_TYPES, getEventType } = require('../config/constants');
const notificationService = require('../services/notificationService');

// ============================================================================
// GET /api/events/:circleId - Get events for a circle
// ============================================================================
router.get('/:circleId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { 
      status,        // 'active', 'resolved', or specific status
      severity,      // 'HIGH', 'MEDIUM', 'LOW'
      zoneId,        // filter by zone
      eventType,     // filter by event type
      createdBy,     // 'me' or member ID
      limit = 50, 
      offset = 0
    } = req.query;

    const where = { circleId, deletedAt: null };
    
    // Status filter
    if (status) {
      if (status === 'active') {
        where.status = { in: ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'] };
      } else if (status === 'resolved') {
        where.status = { in: ['RESOLVED_OK', 'RESOLVED_WARNING', 'FALSE_ALARM'] };
      } else {
        where.status = status;
      }
    }
    
    // Severity filter
    if (severity) {
      where.severity = severity;
    }

    // Zone filter
    if (zoneId) {
      where.zoneId = zoneId;
    }

    // Event type filter
    if (eventType) {
      where.eventType = eventType;
    }
    
    // Creator filter
    if (createdBy === 'me') {
      where.creatorId = req.circleMember.id;
    } else if (createdBy) {
      where.creatorId = createdBy;
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          zone: {
            select: { id: true, zoneType: true, displayName: true, icon: true }
          },
          creator: {
            include: {
              user: {
                select: { displayName: true, avatarUrl: true }
              }
            }
          },
          media: {
            take: 3,
            orderBy: { createdAt: 'asc' },
            select: { id: true, thumbnailUrl: true, fileUrl: true, mediaType: true }
          },
          _count: {
            select: { notes: true, media: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.event.count({ where })
    ]);

    res.json({
      success: true,
      events: events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        severity: e.severity,
        status: e.status,
        zone: e.zone,
        creator: {
          id: e.creator.id,
          displayName: e.creator.displayName || e.creator.user.displayName,
          avatarUrl: e.creator.user.avatarUrl
        },
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
        policeReported: e.policeReported,
        noteCount: e._count.notes,
        mediaCount: e._count.media,
        thumbnails: e.media.map(m => ({
          id: m.id,
          url: m.thumbnailUrl || m.fileUrl,
          mediaType: m.mediaType
        })),
        // Phase 2: Fusion fields
        sourceType: e.sourceType,
        isSecurityEvent: e.isSecurityEvent,
        fusionRule: e.fusionRule,
        pathSummary: e.pathSummary,
        dwellSecondsPrivate: e.dwellSecondsPrivate
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + events.length < total
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/events/:circleId/:eventId - Get single event details
// ============================================================================
router.get('/:circleId/:eventId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;

    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null },
      include: {
        zone: true,
        creator: {
          include: {
            user: {
              select: { displayName: true, avatarUrl: true, email: true }
            }
          }
        },
        notes: {
          include: {
            author: {
              include: {
                user: {
                  select: { displayName: true, avatarUrl: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        media: {
          include: {
            uploader: {
              include: {
                user: {
                  select: { displayName: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    // Permission flags
    const isCreator = event.creatorId === req.circleMember.id;
    const isOwner = req.circleMember.role === 'OWNER';
    const isHousehold = req.circleMember.role === 'HOUSEHOLD';
    const canEdit = isOwner || isHousehold || isCreator;
    const canDelete = isOwner || isCreator;
    const canAddNote = ['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE'].includes(req.circleMember.role);

    res.json({
      success: true,
      event: {
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        severity: event.severity,
        status: event.status,
        zone: event.zone,
        creator: {
          id: event.creator.id,
          displayName: event.creator.displayName || event.creator.user.displayName,
          avatarUrl: event.creator.user.avatarUrl
        },
        occurredAt: event.occurredAt,
        occurredEndAt: event.occurredEndAt,
        policeReported: event.policeReported,
        policeReportedAt: event.policeReportedAt,
        policeReportNumber: event.policeReportNumber,
        lossDescription: event.lossDescription,
        estimatedLossAmount: event.estimatedLossAmount,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        // Phase 2: Fusion fields
        sourceType: event.sourceType,
        isSecurityEvent: event.isSecurityEvent,
        fusionRule: event.fusionRule,
        pathSummary: event.pathSummary,
        dwellSecondsPrivate: event.dwellSecondsPrivate,
        contributingSensorIds: event.contributingSensorIds,
        primaryTrackId: event.primaryTrackId,
        notes: event.notes.map(n => ({
          id: n.id,
          noteType: n.noteType,
          reactionCode: n.reactionCode,
          body: n.body,
          createdAt: n.createdAt,
          author: n.author ? {
            id: n.author.id,
            displayName: n.author.displayName || n.author.user.displayName,
            avatarUrl: n.author.user.avatarUrl
          } : null
        })),
        media: event.media.map(m => ({
          id: m.id,
          mediaType: m.mediaType,
          sourceType: m.sourceType,
          fileName: m.fileName,
          fileUrl: m.fileUrl,
          thumbnailUrl: m.thumbnailUrl,
          fileSizeBytes: m.fileSizeBytes,
          createdAt: m.createdAt,
          uploader: {
            id: m.uploader.id,
            displayName: m.uploader.displayName || m.uploader.user.displayName
          }
        })),
        permissions: {
          canEdit,
          canDelete,
          canAddNote,
          canUploadMedia: canAddNote
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/events/:circleId - Create new event
// ============================================================================
router.post('/:circleId', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE']), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const {
      eventType,
      zoneId,
      title,
      description,
      severity,
      occurredAt
    } = req.body;

    // Validate required fields
    if (!eventType || !zoneId || !title) {
      throw new AppError('eventType, zoneId 和 title 是必填项', 400, 'MISSING_FIELDS');
    }

    // Verify zone exists and is enabled
    const zone = await prisma.zone.findFirst({
      where: { id: zoneId, circleId, isEnabled: true }
    });

    if (!zone) {
      throw new AppError('防区不存在或未启用', 400, 'INVALID_ZONE');
    }

    // Get event type config for validation (from code-based config)
    const eventTypeConfig = getEventType(eventType);

    if (!eventTypeConfig) {
      throw new AppError('无效的事件类型', 400, 'INVALID_EVENT_TYPE');
    }

    // Validate zone whitelist (empty array = all zones allowed)
    if (eventTypeConfig.allowedZones.length > 0 && 
        !eventTypeConfig.allowedZones.includes(zone.zoneType)) {
      throw new AppError(
        `事件类型 "${eventTypeConfig.label}" 不能在 "${zone.displayName}" 区域创建`,
        400,
        'ZONE_NOT_ALLOWED'
      );
    }

    // Determine severity (use provided or default from config)
    const finalSeverity = severity || eventTypeConfig.severity;

    // Create event with initial system note
    const event = await prisma.$transaction(async (tx) => {
      const newEvent = await tx.event.create({
        data: {
          circleId,
          zoneId,
          creatorId: req.circleMember.id,
          eventType,
          title,
          description,
          severity: finalSeverity,
          occurredAt: occurredAt ? new Date(occurredAt) : new Date()
        },
        include: {
          zone: true,
          creator: {
            include: {
              user: { select: { displayName: true, avatarUrl: true } }
            }
          }
        }
      });

      // Create initial system note
      await tx.eventNote.create({
        data: {
          eventId: newEvent.id,
          authorId: req.circleMember.id,
          noteType: 'SYSTEM',
          body: '事件已创建'
        }
      });

      return newEvent;
    });

    res.status(201).json({
      success: true,
      event: {
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        severity: event.severity,
        status: event.status,
        zone: event.zone,
        creator: {
          id: event.creator.id,
          displayName: event.creator.displayName || event.creator.user.displayName
        },
        occurredAt: event.occurredAt,
        createdAt: event.createdAt
      },
      message: '事件创建成功'
    });

    // Send push notifications (async, don't wait)
    console.log(`\n🔔 Triggering notifications for new event: ${event.id}`);
    console.log(`   Title: ${event.title}`);
    console.log(`   Severity: ${event.severity}`);
    console.log(`   Creator userId: ${req.user.id}`);
    
    prisma.circle.findUnique({
      where: { id: circleId },
      select: { displayName: true }
    }).then(circle => {
      if (circle) {
        console.log(`   Circle: ${circle.displayName}`);
        notificationService.notifyNewEvent(event, circle, req.user.id);
      } else {
        console.log(`   ❌ Circle not found for notification`);
      }
    }).catch(err => console.error('Notification error:', err));

  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/events/:circleId/:eventId - Update event
// ============================================================================
router.put('/:circleId/:eventId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const {
      title,
      description,
      severity,
      occurredAt,
      occurredEndAt,
      lossDescription,
      estimatedLossAmount
    } = req.body;

    // Get event
    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    // Check permissions
    const isCreator = event.creatorId === req.circleMember.id;
    const isOwner = req.circleMember.role === 'OWNER';
    const isHousehold = req.circleMember.role === 'HOUSEHOLD';
    
    if (!isOwner && !isHousehold && !isCreator) {
      throw new AppError('没有权限编辑此事件', 403, 'NOT_AUTHORIZED');
    }

    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (severity !== undefined) updateData.severity = severity;
    if (occurredAt !== undefined) updateData.occurredAt = new Date(occurredAt);
    if (occurredEndAt !== undefined) updateData.occurredEndAt = occurredEndAt ? new Date(occurredEndAt) : null;
    if (lossDescription !== undefined) updateData.lossDescription = lossDescription;
    if (estimatedLossAmount !== undefined) updateData.estimatedLossAmount = estimatedLossAmount;

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
      include: {
        zone: true,
        creator: {
          include: {
            user: { select: { displayName: true, avatarUrl: true } }
          }
        }
      }
    });

    res.json({
      success: true,
      event: {
        id: updated.id,
        eventType: updated.eventType,
        title: updated.title,
        description: updated.description,
        severity: updated.severity,
        status: updated.status,
        zone: updated.zone,
        occurredAt: updated.occurredAt,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/events/:circleId/:eventId/status - Update event status
// ============================================================================
router.put('/:circleId/:eventId/status', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE']), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const { status } = req.body;

    if (!status) {
      throw new AppError('请提供状态', 400, 'STATUS_REQUIRED');
    }

    const validStatuses = ['OPEN', 'ACKED', 'WATCHING', 'RESOLVED_OK', 'RESOLVED_WARNING', 'ESCALATED', 'FALSE_ALARM'];
    if (!validStatuses.includes(status)) {
      throw new AppError('无效的状态', 400, 'INVALID_STATUS');
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    const oldStatus = event.status;

    // Update event and add system note
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { status }
      });

      await tx.eventNote.create({
        data: {
          eventId,
          authorId: req.circleMember.id,
          noteType: 'SYSTEM',
          body: `状态从 "${oldStatus}" 更新为 "${status}"`
        }
      });
    });

    res.json({
      success: true,
      status,
      message: '状态已更新'
    });

    // Send notification for resolved/false alarm
    if (['RESOLVED_OK', 'FALSE_ALARM'].includes(status)) {
      prisma.circle.findUnique({
        where: { id: circleId },
        select: { displayName: true }
      }).then(circle => {
        if (circle) {
          const updateType = status === 'RESOLVED_OK' ? 'resolved' : 'false_alarm';
          notificationService.notifyEventUpdate(event, circle, updateType, req.user.id);
        }
      }).catch(err => console.error('Notification error:', err));
    }

  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUT /api/events/:circleId/:eventId/police - Mark as reported to police
// ============================================================================
router.put('/:circleId/:eventId/police', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const { policeReported, policeReportNumber } = req.body;

    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    const updateData = {};
    
    if (policeReported !== undefined) {
      updateData.policeReported = policeReported;
      if (policeReported && !event.policeReported) {
        updateData.policeReportedAt = new Date();
        // Auto-escalate if not already
        if (!['ESCALATED', 'RESOLVED_WARNING', 'RESOLVED_OK'].includes(event.status)) {
          updateData.status = 'ESCALATED';
        }
      }
    }
    
    if (policeReportNumber !== undefined) {
      updateData.policeReportNumber = policeReportNumber;
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: updateData
      });

      if (policeReported && !event.policeReported) {
        await tx.eventNote.create({
          data: {
            eventId,
            authorId: req.circleMember.id,
            noteType: 'SYSTEM',
            body: policeReportNumber 
              ? `已报警 (报案号: ${policeReportNumber})`
              : '已标记为已报警'
          }
        });
      }
    });

    res.json({
      success: true,
      message: '已更新报警信息'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/events/:circleId/:eventId - Delete event (soft delete)
// ============================================================================
router.delete('/:circleId/:eventId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;

    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    // Check permissions - Owner or creator can delete
    const isCreator = event.creatorId === req.circleMember.id;
    const isOwner = req.circleMember.role === 'OWNER';
    
    if (!isOwner && !isCreator) {
      throw new AppError('没有权限删除此事件', 403, 'NOT_AUTHORIZED');
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date() }
    });

    res.json({
      success: true,
      message: '事件已删除'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/events/:circleId/:eventId/notes - Add note to event
// ============================================================================
router.post('/:circleId/:eventId/notes', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE']), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const { noteType = 'COMMENT', reactionCode, body } = req.body;

    if (!body) {
      throw new AppError('请提供内容', 400, 'BODY_REQUIRED');
    }

    // Verify event exists
    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    // Create note and optionally update status
    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.eventNote.create({
        data: {
          eventId,
          authorId: req.circleMember.id,
          noteType,
          reactionCode,
          body
        },
        include: {
          author: {
            include: {
              user: { select: { displayName: true, avatarUrl: true } }
            }
          }
        }
      });

      // Update status based on reaction code
      let statusUpdated = false;
      if (reactionCode) {
        const newStatus = getStatusFromReactionCode(reactionCode, event.status);
        if (newStatus && newStatus !== event.status) {
          await tx.event.update({
            where: { id: eventId },
            data: { status: newStatus }
          });
          statusUpdated = true;
        }
      }

      return { note, statusUpdated };
    });

    res.status(201).json({
      success: true,
      note: {
        id: result.note.id,
        noteType: result.note.noteType,
        reactionCode: result.note.reactionCode,
        body: result.note.body,
        createdAt: result.note.createdAt,
        author: {
          id: result.note.author.id,
          displayName: result.note.author.displayName || result.note.author.user.displayName,
          avatarUrl: result.note.author.user.avatarUrl
        }
      },
      statusUpdated: result.statusUpdated
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/events/:circleId/:eventId/notes - Get all notes for an event
// ============================================================================
router.get('/:circleId/:eventId/notes', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;

    // Verify event exists
    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    const notes = await prisma.eventNote.findMany({
      where: { eventId },
      include: {
        author: {
          include: {
            user: { select: { displayName: true, avatarUrl: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      notes: notes.map(n => ({
        id: n.id,
        noteType: n.noteType,
        reactionCode: n.reactionCode,
        body: n.body,
        createdAt: n.createdAt,
        author: n.author ? {
          id: n.author.id,
          displayName: n.author.displayName || n.author.user.displayName,
          avatarUrl: n.author.user.avatarUrl
        } : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Helper: Get status from reaction code
// ============================================================================
function getStatusFromReactionCode(reactionCode, currentStatus) {
  const statusPriority = {
    'ESCALATED': 6,
    'RESOLVED_WARNING': 5,
    'WATCHING': 4,
    'ACKED': 3,
    'RESOLVED_OK': 2,
    'FALSE_ALARM': 1,
    'OPEN': 0
  };

  const reactionToStatus = {
    // Escalation reactions
    'ESCALATE_RECOMMEND_CALL_POLICE': 'ESCALATED',
    'ESCALATE_BREAKIN_SUSPECTED': 'ESCALATED',
    'ESCALATE_CALLED_POLICE': 'ESCALATED',
    'PACKAGE_ESCALATE': 'ESCALATED',
    'CUSTOM_ESCALATE': 'ESCALATED',
    
    // Warning/Loss reactions
    'PACKAGE_MISSING': 'RESOLVED_WARNING',
    'DAMAGE_CONFIRMED': 'RESOLVED_WARNING',
    
    // Watching reactions
    'WATCHING': 'WATCHING',
    'WATCHING_SAFE_DISTANCE': 'WATCHING',
    'PACKAGE_WATCHING': 'WATCHING',
    'CUSTOM_WATCHING': 'WATCHING',
    
    // Acknowledged reactions
    'NORMAL_OK': 'ACKED',
    'SUSPICIOUS': 'ACKED',
    'DAMAGE_ONLY_NO_PERSON': 'ACKED',
    'PACKAGE_OK': 'ACKED',
    'PACKAGE_TAKE_PHOTO': 'ACKED',
    'CUSTOM_NORMAL_OK': 'ACKED',
    'CUSTOM_SUSPICIOUS': 'ACKED',
    
    // Resolved OK reactions
    'PACKAGE_TAKEN_BY_MEMBER': 'RESOLVED_OK',
    'FALSE_ALARM_CONFIRMED': 'FALSE_ALARM'
  };

  const newStatus = reactionToStatus[reactionCode];
  if (!newStatus) return null;

  // Only upgrade status (never downgrade), except for resolution
  const currentPriority = statusPriority[currentStatus] || 0;
  const newPriority = statusPriority[newStatus] || 0;

  // Allow status change if it's a higher priority or it's a resolution status
  if (newPriority > currentPriority || ['RESOLVED_OK', 'RESOLVED_WARNING', 'FALSE_ALARM'].includes(newStatus)) {
    return newStatus;
  }

  return null;
}

// ============================================================================
// POST /api/events/:circleId/:eventId/feedback - Submit ML feedback
// Phase 2: ML Feedback collection
// ============================================================================
router.post('/:circleId/:eventId/feedback', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const { label, note, clientPlatform } = req.body;
    const userId = req.user.id;

    // Validate label
    if (!label || !['FALSE_ALARM', 'USEFUL'].includes(label.toUpperCase())) {
      throw new AppError('Invalid feedback label. Must be FALSE_ALARM or USEFUL', 400, 'INVALID_LABEL');
    }

    // Verify event exists and get home info
    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null },
      include: {
        circle: {
          include: { home: true }
        }
      }
    });

    if (!event) {
      throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
    }

    // Upsert feedback (one per user per event)
    const feedback = await prisma.eventFeedback.upsert({
      where: {
        eventId_userId: { eventId, userId }
      },
      update: {
        label: label.toUpperCase(),
        note,
        clientPlatform,
        createdAt: new Date()
      },
      create: {
        circleId,
        eventId,
        userId,
        label: label.toUpperCase(),
        note,
        clientPlatform
      }
    });

    // If user marked as false alarm, also update event status if still open
    if (label.toUpperCase() === 'FALSE_ALARM' && event.status === 'OPEN') {
      await prisma.event.update({
        where: { id: eventId },
        data: { status: 'FALSE_ALARM' }
      });
    }

    // Invalidate ML stats cache so next prediction uses updated data
    try {
      const { notificationScorer } = require('../services/notificationScorer');
      notificationScorer.invalidateCache(circleId, event.circle?.home?.id);
    } catch (cacheErr) {
      // Non-critical, just log
      console.log('[Events] Could not invalidate ML cache:', cacheErr.message);
    }

    res.json({
      success: true,
      message: label.toUpperCase() === 'FALSE_ALARM' 
        ? 'Thanks! We\'ll reduce similar notifications over time.'
        : 'Thanks for the feedback!',
      feedback: {
        id: feedback.id,
        label: feedback.label,
        createdAt: feedback.createdAt
      }
    });

  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/events/:circleId/:eventId/feedback - Get feedback for an event
// ============================================================================
router.get('/:circleId/:eventId/feedback', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;
    const userId = req.user.id;

    // Get current user's feedback
    const myFeedback = await prisma.eventFeedback.findUnique({
      where: {
        eventId_userId: { eventId, userId }
      }
    });

    // Get aggregated stats (for circle owners/admins)
    let stats = null;
    if (req.circleMember.role === 'OWNER' || req.circleMember.role === 'HOUSEHOLD') {
      const feedbacks = await prisma.eventFeedback.groupBy({
        by: ['label'],
        where: { eventId },
        _count: { label: true }
      });

      stats = {
        total: feedbacks.reduce((sum, f) => sum + f._count.label, 0),
        falseAlarm: feedbacks.find(f => f.label === 'FALSE_ALARM')?._count.label || 0,
        useful: feedbacks.find(f => f.label === 'USEFUL')?._count.label || 0
      };
    }

    res.json({
      success: true,
      myFeedback: myFeedback ? {
        label: myFeedback.label,
        createdAt: myFeedback.createdAt
      } : null,
      stats
    });

  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/events/:circleId/feedback/stats - Get feedback statistics
// For ML training insights and false alarm rate tracking
// ============================================================================
router.get('/:circleId/feedback/stats', authenticate, requireCircleMember(['OWNER', 'HOUSEHOLD']), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { days = 30 } = req.query;

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    // Get feedback stats by event type (using Prisma instead of raw SQL for type safety)
    const feedbacksWithEvents = await prisma.eventFeedback.findMany({
      where: {
        circleId,
        createdAt: { gte: since }
      },
      include: {
        event: {
          select: { eventType: true, occurredAt: true }
        }
      }
    });

    // Aggregate by event type
    const byEventTypeMap = {};
    for (const fb of feedbacksWithEvents) {
      const type = fb.event.eventType;
      if (!byEventTypeMap[type]) {
        byEventTypeMap[type] = { event_type: type, false_alarm_count: 0, useful_count: 0, total_feedback: 0 };
      }
      byEventTypeMap[type].total_feedback++;
      if (fb.label === 'FALSE_ALARM') {
        byEventTypeMap[type].false_alarm_count++;
      } else {
        byEventTypeMap[type].useful_count++;
      }
    }
    
    const byEventType = Object.values(byEventTypeMap).map(item => ({
      ...item,
      false_alarm_rate: item.total_feedback > 0 
        ? (item.false_alarm_count / item.total_feedback).toFixed(2) 
        : 0
    })).sort((a, b) => b.false_alarm_rate - a.false_alarm_rate);

    // Aggregate by hour
    const byHourMap = {};
    for (const fb of feedbacksWithEvents) {
      const hour = fb.event.occurredAt.getHours();
      if (!byHourMap[hour]) {
        byHourMap[hour] = { hour, false_alarm_count: 0, useful_count: 0, total_feedback: 0 };
      }
      byHourMap[hour].total_feedback++;
      if (fb.label === 'FALSE_ALARM') {
        byHourMap[hour].false_alarm_count++;
      } else {
        byHourMap[hour].useful_count++;
      }
    }
    const byHour = Object.values(byHourMap).sort((a, b) => a.hour - b.hour);

    // Get overall stats
    const overall = await prisma.eventFeedback.groupBy({
      by: ['label'],
      where: {
        circleId,
        createdAt: { gte: since }
      },
      _count: { label: true }
    });

    const totalFeedback = overall.reduce((sum, f) => sum + f._count.label, 0);
    const falseAlarmCount = overall.find(f => f.label === 'FALSE_ALARM')?._count.label || 0;

    res.json({
      success: true,
      stats: {
        period: { days: parseInt(days), since },
        overall: {
          totalFeedback,
          falseAlarmCount,
          usefulCount: totalFeedback - falseAlarmCount,
          falseAlarmRate: totalFeedback > 0 ? (falseAlarmCount / totalFeedback).toFixed(2) : 0
        },
        byEventType,
        byHour
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
