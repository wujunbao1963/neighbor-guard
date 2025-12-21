import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { NgEventNote } from '../events-collab/ng-event-note.entity';
import { NgEvidenceSession } from '../evidence/ng-evidence-session.entity';
import { NgEventEvidence } from '../evidence/ng-event-evidence.entity';
import { NgHttpError } from '../common/errors/ng-http-error';
import { decodeCursor, encodeCursor, EventsCursor } from './utils/cursor';

export type EventsListResponse = {
  items: any[];
  nextCursor: string | null;
};

@Injectable()
export class EventsReadService {
  constructor(
    @InjectRepository(NgEvent)
    private readonly eventsRepo: Repository<NgEvent>,
    @InjectRepository(NgEventNote)
    private readonly notesRepo: Repository<NgEventNote>,
    @InjectRepository(NgEvidenceSession)
    private readonly evidenceSessionsRepo: Repository<NgEvidenceSession>,
    @InjectRepository(NgEventEvidence)
    private readonly eventEvidenceRepo: Repository<NgEventEvidence>,
  ) {}

  async list(circleId: string, limit: number, cursor?: string): Promise<EventsListResponse> {
    let c: EventsCursor | undefined;
    if (cursor) {
      try {
        c = decodeCursor(cursor);
      } catch (e: any) {
        throw new NgHttpError({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: 'VALIDATION_ERROR',
          message: 'Invalid cursor',
          timestamp: new Date().toISOString(),
          details: { cursor },
          retryable: false,
        });
      }
    }

    const qb = this.eventsRepo
      .createQueryBuilder('e')
      .where('e.circleId = :circleId', { circleId })
      .orderBy('e.occurredAt', 'DESC')
      .addOrderBy('e.eventId', 'DESC')
      .take(limit + 1);

    if (c) {
      // Fetch items after the cursor, consistent with DESC ordering.
      qb.andWhere(
        '(e.occurredAt < :cOcc) OR (e.occurredAt = :cOcc AND e.eventId < :cEventId)',
        { cOcc: new Date(c.occurredAt), cEventId: c.eventId },
      );
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((ev) => this.toSummary(ev));

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = encodeCursor({
        occurredAt: last.occurredAt.toISOString(),
        eventId: last.eventId,
      });
    }

    return { items, nextCursor };
  }

  async get(circleId: string, eventId: string): Promise<any> {
    const ev = await this.eventsRepo.findOne({ where: { circleId, eventId } });

    if (!ev) {
      throw new NgHttpError({
        statusCode: 404,
        error: 'Not Found',
        code: 'NOT_FOUND',
        message: 'Event not found',
        timestamp: new Date().toISOString(),
        details: { circleId, eventId },
        retryable: false,
      });
    }

    const notes = await this.notesRepo.find({
      where: { circleId, eventId },
      order: { createdAt: 'ASC' },
    });

    const latestSession = await this.evidenceSessionsRepo.findOne({
      where: { circleId, eventId },
      order: { createdAt: 'DESC' },
    });

    const eventEvidence = await this.eventEvidenceRepo.findOne({
      where: { circleId, eventId },
    });

    return this.toDetail(ev, notes, { latestSession, eventEvidence });
  }

  private toSummary(ev: NgEvent): any {
    const raw: any = ev.rawEvent ?? {};

    const out: any = {
      eventId: ev.eventId,
      occurredAt: ev.occurredAt.toISOString(),
      eventType: ev.eventType,
      severity: ev.severity,
      notificationLevel: ev.notificationLevel,
      status: ev.status,
      title: clamp(ev.title, 120),
    };

    if (typeof raw.zoneId === 'string' && raw.zoneId.length > 0) {
      out.zoneId = raw.zoneId;
    }
    if (typeof raw.entryPointId === 'string' && raw.entryPointId.length > 0) {
      out.entryPointId = raw.entryPointId;
    }
    if (typeof ev.alarmState === 'string' && ev.alarmState.length > 0) {
      out.alarmState = ev.alarmState;
    }
    if (typeof raw.localDisarm === 'boolean') {
      out.localDisarm = raw.localDisarm;
    }

    return out;
  }

  private toDetail(
    ev: NgEvent,
    notes: NgEventNote[],
    evidenceRefs: {
      latestSession: NgEvidenceSession | null;
      eventEvidence: NgEventEvidence | null;
    },
  ): any {
    const raw: any = ev.rawEvent ?? {};
    const evidence = this.toEvidenceSummary(raw?.evidence ?? null, evidenceRefs);

    const out: any = {
      eventId: ev.eventId,
      occurredAt: ev.occurredAt.toISOString(),
      eventType: ev.eventType,
      severity: ev.severity,
      notificationLevel: ev.notificationLevel,
      status: ev.status,
      title: clamp(ev.title, 120),
      description: ev.description ? clamp(ev.description, 800) : null,
      serverReceivedAt: ev.receivedAt.toISOString(),
      ackedAt: ev.ackedAt ? ev.ackedAt.toISOString() : null,
      resolvedAt: ev.resolvedAt ? ev.resolvedAt.toISOString() : null,
      trackSummary: raw.trackSummary ?? null,
      explainSummary: ev.explainSummary,
      evidence,
      notes: notes.map((n) => {
        const out: any = {
          noteId: n.noteId,
          createdAt: n.createdAt.toISOString(),
          text: n.text,
        };
        if (n.createdById) {
          out.createdById = n.createdById;
        }
        return out;
      }),
    };

    if (typeof raw.zoneId === 'string' && raw.zoneId.length > 0) {
      out.zoneId = raw.zoneId;
    }
    if (typeof raw.entryPointId === 'string' && raw.entryPointId.length > 0) {
      out.entryPointId = raw.entryPointId;
    }
    if (typeof ev.alarmState === 'string' && ev.alarmState.length > 0) {
      out.alarmState = ev.alarmState;
    }
    if (typeof raw.localDisarm === 'boolean') {
      out.localDisarm = raw.localDisarm;
    }

    return out;
  }

  private toEvidenceSummary(
    rawEvidence: any,
    refs: { latestSession: NgEvidenceSession | null; eventEvidence: NgEventEvidence | null },
  ): any {
    if (rawEvidence === null || rawEvidence === undefined) {
      return null;
    }

    const policy: string = typeof rawEvidence.policy === 'string' ? rawEvidence.policy : 'NONE';
    const available = rawEvidence.available === true;

    // If edge explicitly says evidence is not available, treat as NONE.
    if (!available) {
      return { policy, status: 'NONE', evidenceId: null };
    }

    const ee = refs.eventEvidence;
    if (ee) {
      if (ee.evidenceStatus === 'ARCHIVED') {
        return { policy, status: 'ARCHIVED', evidenceId: ee.id };
      }
      if (ee.evidenceStatus === 'FAILED') {
        return { policy, status: 'FAILED', evidenceId: ee.id };
      }
      // VERIFYING -> treat as UPLOADING for v1 contract purposes.
      return { policy, status: 'UPLOADING', evidenceId: ee.id };
    }

    const s = refs.latestSession;
    if (s) {
      if (s.status === 'OPEN') {
        return { policy, status: 'UPLOADING', evidenceId: s.evidenceId ?? null };
      }
      // Session completed but no eventEvidence row yet: request is in-flight.
      return { policy, status: 'REQUESTED', evidenceId: s.evidenceId ?? null };
    }

    // Evidence is available but no session started yet.
    return { policy, status: 'REQUESTED', evidenceId: null };
  }
}

function clamp(v: string, maxLen: number): string {
  if (v.length <= maxLen) return v;
  return v.slice(0, maxLen);
}
