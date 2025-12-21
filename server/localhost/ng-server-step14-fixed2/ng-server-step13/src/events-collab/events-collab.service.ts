import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { NgEventNote } from './ng-event-note.entity';
import { NgEventStatusIdempotency } from './ng-event-status-idempotency.entity';
import { stableStringify } from '../common/utils/stable-json';
import { NgErrorCodes, NgHttpError } from '../common/errors/ng-http-error';

type StatusUpdateReq = {
  status: 'OPEN' | 'ACKED' | 'RESOLVED';
  note?: string | null;
  clientRequestId?: string | null;
};

type NotesCreateReq = {
  text: string;
  clientNoteId?: string | null;
};

@Injectable()
export class EventsCollabService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NgEvent)
    private readonly eventsRepo: Repository<NgEvent>,
    @InjectRepository(NgEventNote)
    private readonly notesRepo: Repository<NgEventNote>,
    @InjectRepository(NgEventStatusIdempotency)
    private readonly statusIdemRepo: Repository<NgEventStatusIdempotency>,
  ) {}

  async updateStatus(circleId: string, eventId: string, body: StatusUpdateReq): Promise<any> {
    const desiredStatus = body.status;
    const noteText = typeof body.note === 'string' ? body.note : body.note === null ? null : undefined;
    const clientRequestId = body.clientRequestId ?? null;

    const payloadHash = sha256Hex(
      stableStringify({ status: desiredStatus, note: noteText ?? null }),
    );

    return this.dataSource.transaction(async (trx) => {
      const events = trx.getRepository(NgEvent);
      const notes = trx.getRepository(NgEventNote);
      const idems = trx.getRepository(NgEventStatusIdempotency);

      const ev = await events.findOne({ where: { circleId, eventId } });
      if (!ev) {
        throw new NgHttpError({
          statusCode: 404,
          error: 'Not Found',
          code: 'EVENT_NOT_FOUND',
          message: 'Event not found',
          timestamp: new Date().toISOString(),
          details: { circleId, eventId },
          retryable: false,
        });
      }

      if (clientRequestId) {
        const existing = await idems.findOne({
          where: { eventId, clientRequestId },
        });

        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw new NgHttpError({
              statusCode: 409,
              error: 'Conflict',
              code: NgErrorCodes.IDEMPOTENCY_CONFLICT,
              message: 'clientRequestId reuse with different payload',
              timestamp: new Date().toISOString(),
              details: { eventId, clientRequestId },
              retryable: false,
            });
          }

          return {
            updated: false,
            eventId,
            status: existing.status,
            updatedAt: existing.updatedAt.toISOString(),
            deduped: true,
          };
        }
      }

      const from = ev.status;
      const statusChanged = desiredStatus !== from;

      if (statusChanged && !isAllowedTransition(from, desiredStatus)) {
        throw new NgHttpError({
          statusCode: 409,
          error: 'Conflict',
          code: 'EVENT_STATUS_CONFLICT',
          message: `Invalid status transition: ${from} -> ${desiredStatus}`,
          timestamp: new Date().toISOString(),
          details: { from, to: desiredStatus },
          retryable: false,
        });
      }

      const now = new Date();
      let updatedAt = ev.updatedAt ?? ev.receivedAt;

      const patch: Partial<NgEvent> = {};
      let bump = false;

      if (statusChanged) {
        patch.status = desiredStatus;
        bump = true;

        if (desiredStatus === 'ACKED' && !ev.ackedAt) {
          patch.ackedAt = now;
        }
        if (desiredStatus === 'RESOLVED' && !ev.resolvedAt) {
          patch.resolvedAt = now;
          // If resolving directly, implicitly ack.
          if (!ev.ackedAt) {
            patch.ackedAt = now;
          }
        }
      }

      if (typeof noteText === 'string' && noteText.trim().length > 0) {
        await notes.insert({
          noteId: crypto.randomUUID(),
          eventId,
          circleId,
          clientNoteId: null,
          text: noteText,
          createdAt: now,
          createdById: null,
        });
        bump = true;
      }

      if (bump) {
        updatedAt = now;
        patch.updatedAt = updatedAt;
        await events.update({ eventId }, patch);
      }

      if (clientRequestId) {
        await idems.insert({
          eventId,
          clientRequestId,
          payloadHash,
          status: desiredStatus,
          updatedAt,
          createdAt: now,
        });
      }

      return {
        updated: statusChanged,
        eventId,
        status: desiredStatus,
        updatedAt: updatedAt.toISOString(),
      };
    });
  }

  async createNote(circleId: string, eventId: string, body: NotesCreateReq): Promise<any> {
    const text = body.text;
    const clientNoteId = body.clientNoteId ?? null;

    return this.dataSource.transaction(async (trx) => {
      const events = trx.getRepository(NgEvent);
      const notes = trx.getRepository(NgEventNote);

      const ev = await events.findOne({ where: { circleId, eventId } });
      if (!ev) {
        throw new NgHttpError({
          statusCode: 404,
          error: 'Not Found',
          code: 'EVENT_NOT_FOUND',
          message: 'Event not found',
          timestamp: new Date().toISOString(),
          details: { circleId, eventId },
          retryable: false,
        });
      }

      if (clientNoteId) {
        const existing = await notes.findOne({ where: { circleId, eventId, clientNoteId } });
        if (existing) {
          if (existing.text !== text) {
            throw new NgHttpError({
              statusCode: 409,
              error: 'Conflict',
              code: NgErrorCodes.IDEMPOTENCY_CONFLICT,
              message: 'clientNoteId reuse with different text',
              timestamp: new Date().toISOString(),
              details: { eventId, clientNoteId },
              retryable: false,
            });
          }

          return {
            created: false,
            note: {
              noteId: existing.noteId,
              createdAt: existing.createdAt.toISOString(),
              text: existing.text,
              ...(existing.createdById ? { createdById: existing.createdById } : {}),
            },
          };
        }
      }

      const now = new Date();
      const noteId = crypto.randomUUID();

      await notes.insert({
        noteId,
        eventId,
        circleId,
        clientNoteId,
        text,
        createdAt: now,
        createdById: null,
      });

      await events.update({ eventId }, { updatedAt: now });

      return {
        created: true,
        note: {
          noteId,
          createdAt: now.toISOString(),
          text,
        },
      };
    });
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function isAllowedTransition(from: string, to: string): boolean {
  if (from === to) return true;

  switch (from) {
    case 'OPEN':
      return to === 'ACKED' || to === 'RESOLVED';
    case 'ACKED':
      return to === 'RESOLVED';
    case 'RESOLVED':
      return false;
    default:
      // Unknown legacy statuses: be conservative.
      return false;
  }
}
