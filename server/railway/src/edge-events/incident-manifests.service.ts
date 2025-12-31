import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { stableStringify } from '../common/utils/stable-json';
import { NgEdgeIngestAudit } from './ng-edge-ingest-audit.entity';
import { NgIncidentManifest } from './ng-incident-manifest.entity';
import { NgIncidentManifestRaw } from './ng-incident-manifest-raw.entity';

export type EdgeIncidentManifestUpsertV77 = {
  schemaVersion: 'v7.7';
  circleId: string;
  eventId: string;
  edgeInstanceId: string;
  updatedAt: string;
  sequence: number;
  manifest: Record<string, unknown>;
  [k: string]: unknown;
};

export type IncidentManifestUpsertResult = {
  applied: boolean;
  reason: 'applied' | 'stale_sequence' | 'stale_timestamp' | 'duplicate_payload';
};

@Injectable()
export class IncidentManifestsService {
  constructor(
    @InjectRepository(NgIncidentManifestRaw)
    private readonly rawRepo: Repository<NgIncidentManifestRaw>,
    @InjectRepository(NgIncidentManifest)
    private readonly manifestRepo: Repository<NgIncidentManifest>,
    @InjectRepository(NgEdgeIngestAudit)
    private readonly auditRepo: Repository<NgEdgeIngestAudit>,
    private readonly dataSource: DataSource,
  ) {}

  async storeManifestUpsert(payload: EdgeIncidentManifestUpsertV77): Promise<IncidentManifestUpsertResult> {
    const incomingSeq = typeof payload.sequence === 'number' ? payload.sequence : 0;
    const incomingUpdatedAt = new Date(payload.updatedAt);
    const payloadHash = sha256Hex(stableStringify(payload));

    return await this.dataSource.transaction(async (manager) => {
      // 1) Raw landing write (always).
      const rawRow = this.rawRepo.create({
        circleId: payload.circleId,
        eventId: payload.eventId,
        edgeInstanceId: payload.edgeInstanceId,
        edgeUpdatedAt: incomingUpdatedAt,
        sequence: String(incomingSeq),
        payload,
      });
      await manager.getRepository(NgIncidentManifestRaw).save(rawRow);

      const repo = manager.getRepository(NgIncidentManifest);
      const audit = manager.getRepository(NgEdgeIngestAudit);
      const existing = await repo.findOne({
        where: { circleId: payload.circleId, eventId: payload.eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) {
        const created = repo.create({
          circleId: payload.circleId,
          eventId: payload.eventId,
          edgeInstanceId: payload.edgeInstanceId,
          edgeUpdatedAt: incomingUpdatedAt,
          lastSequence: String(incomingSeq),
          lastPayloadHash: payloadHash,
          manifestJson: payload,
        });
        await repo.save(created);
        await audit.insert({
          circleId: payload.circleId,
          eventId: payload.eventId,
          edgeInstanceId: payload.edgeInstanceId,
          sequence: String(incomingSeq),
          payloadHash,
          applied: true,
          reason: 'applied',
          schemaVersion: payload.schemaVersion,
          messageType: 'incident_manifest_upsert',
        });
        return { applied: true, reason: 'applied' };
      }

      const storedSeq = Number(existing.lastSequence ?? '0');

      if (incomingSeq === storedSeq && existing.lastPayloadHash && existing.lastPayloadHash === payloadHash) {
        await audit.insert({
          circleId: payload.circleId,
          eventId: payload.eventId,
          edgeInstanceId: payload.edgeInstanceId,
          sequence: String(incomingSeq),
          payloadHash,
          applied: false,
          reason: 'duplicate_payload',
          schemaVersion: payload.schemaVersion,
          messageType: 'incident_manifest_upsert',
        });
        return { applied: false, reason: 'duplicate_payload' };
      }

      if (incomingSeq < storedSeq) {
        await audit.insert({
          circleId: payload.circleId,
          eventId: payload.eventId,
          edgeInstanceId: payload.edgeInstanceId,
          sequence: String(incomingSeq),
          payloadHash,
          applied: false,
          reason: 'stale_sequence',
          schemaVersion: payload.schemaVersion,
          messageType: 'incident_manifest_upsert',
        });
        return { applied: false, reason: 'stale_sequence' };
      }

      if (incomingSeq === storedSeq) {
        if (incomingUpdatedAt.getTime() <= existing.edgeUpdatedAt.getTime()) {
          await audit.insert({
            circleId: payload.circleId,
            eventId: payload.eventId,
            edgeInstanceId: payload.edgeInstanceId,
            sequence: String(incomingSeq),
            payloadHash,
            applied: false,
            reason: 'stale_timestamp',
            schemaVersion: payload.schemaVersion,
            messageType: 'incident_manifest_upsert',
          });
          return { applied: false, reason: 'stale_timestamp' };
        }
      }

      existing.edgeInstanceId = payload.edgeInstanceId;
      existing.edgeUpdatedAt = incomingUpdatedAt;
      existing.lastSequence = String(incomingSeq);
      existing.lastPayloadHash = payloadHash;
      existing.manifestJson = payload;
      await repo.save(existing);

      await audit.insert({
        circleId: payload.circleId,
        eventId: payload.eventId,
        edgeInstanceId: payload.edgeInstanceId,
        sequence: String(incomingSeq),
        payloadHash,
        applied: true,
        reason: 'applied',
        schemaVersion: payload.schemaVersion,
        messageType: 'incident_manifest_upsert',
      });

      return { applied: true, reason: 'applied' };
    });
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
