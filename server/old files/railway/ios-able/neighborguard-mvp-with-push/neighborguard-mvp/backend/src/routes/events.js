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
        }))
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

module.exports = router;
