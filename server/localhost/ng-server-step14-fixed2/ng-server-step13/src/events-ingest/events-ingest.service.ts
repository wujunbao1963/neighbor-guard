import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';
import { NgEvent } from './ng-event.entity';
import { NgEventIdempotency } from './ng-event-idempotency.entity';
import { stableStringify } from '../common/utils/stable-json';
import { NgErrorCodes, NgHttpError } from '../common/errors/ng-http-error';

type IngestReq = {
  idempotencyKey: string;
  event: any;
};

export type IngestResp = {
  accepted: boolean;
  eventId: string;
  serverReceivedAt: string;
  deduped?: boolean;
};

@Injectable()
export class EventsIngestService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NgEvent)
    private readonly eventsRepo: Repository<NgEvent>,
    @InjectRepository(NgEventIdempotency)
    private readonly idemRepo: Repository<NgEventIdempotency>,
  ) {}

  async ingest(device: NgEdgeDevice, circleId: string, body: IngestReq): Promise<IngestResp> {
    const receivedAt = new Date();
    const initialStatus: string = (body as any)?.event?.status;
    const ackedAt = initialStatus === 'ACKED' ? receivedAt : null;
    const resolvedAt = initialStatus === 'RESOLVED' ? receivedAt : null;
    // Hash only the event payload (not idempotencyKey) so eventId-level dedupe works.
    const payloadHash = sha256Hex(stableStringify(body.event));

    return this.dataSource.transaction(async (trx) => {
      const idem = await trx.getRepository(NgEventIdempotency).findOne({
        where: {
          edgeDeviceId: device.id,
          idempotencyKey: body.idempotencyKey,
        },
      });

      if (idem) {
        if (idem.payloadHash !== payloadHash) {
          throw new NgHttpError({
            statusCode: 409,
            error: 'Conflict',
            code: NgErrorCodes.IDEMPOTENCY_CONFLICT,
            message: 'Idempotency key reuse with different payload',
            timestamp: new Date().toISOString(),
            details: {
              idempotencyKey: body.idempotencyKey,
              existingEventId: idem.eventId,
            },
            retryable: false,
          });
        }

        return {
          accepted: true,
          eventId: idem.eventId,
          serverReceivedAt: receivedAt.toISOString(),
          deduped: true,
        };
      }

      const eventId: string = body.event.eventId;

      const existing = await trx.getRepository(NgEvent).findOne({
        where: { eventId },
      });

      if (existing) {
        // Secondary dedupe by eventId. Treat as success if payload matches; else conflict.
        const existingHash = sha256Hex(stableStringify(existing.rawEvent));

        if (existingHash !== payloadHash) {
          throw new NgHttpError({
            statusCode: 409,
            error: 'Conflict',
            code: NgErrorCodes.EVENT_CONFLICT,
            message: 'eventId already exists with different payload',
            timestamp: new Date().toISOString(),
            details: { eventId },
            retryable: false,
          });
        }

        await trx.getRepository(NgEventIdempotency).insert({
          edgeDeviceId: device.id,
          idempotencyKey: body.idempotencyKey,
          eventId,
          payloadHash,
        });

        return {
          accepted: true,
          eventId,
          serverReceivedAt: receivedAt.toISOString(),
          deduped: true,
        };
      }

      await trx.getRepository(NgEvent).insert({
        eventId,
        circleId,
        edgeDeviceId: device.id,
        title: body.event.title,
        description: body.event.description ?? null,
        eventType: body.event.eventType,
        severity: body.event.severity,
        notificationLevel: body.event.notificationLevel,
        status: body.event.status,
        occurredAt: new Date(body.event.occurredAt),
        receivedAt,
        updatedAt: receivedAt,
        ackedAt,
        resolvedAt,
        explainSummary: body.event.explainSummary,
        alarmState: body.event.alarmState ?? null,
        // Contract v1: zonesVisited is a property of trackSummary; keySignals live under explainSummary.
        zonesVisited: body.event.trackSummary?.zonesVisited ?? null,
        keySignals: body.event.explainSummary?.keySignals ?? null,
        rawEvent: body.event,
      });

      await trx.getRepository(NgEventIdempotency).insert({
        edgeDeviceId: device.id,
        idempotencyKey: body.idempotencyKey,
        eventId,
        payloadHash,
      });

      return {
        accepted: true,
        eventId,
        serverReceivedAt: receivedAt.toISOString(),
      };
    });
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
