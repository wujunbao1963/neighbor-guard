import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { NgHttpError, NgErrorCodes } from '../common/errors/ng-http-error';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { NgEvidenceItem } from './ng-evidence-item.entity';
import { NgEvidenceSession } from './ng-evidence-session.entity';
import { NgEventEvidence } from './ng-event-evidence.entity';
import { EvidenceStorageService } from './evidence-storage.service';

function stableStringify(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(NgEvent) private readonly eventsRepo: Repository<NgEvent>,
    @InjectRepository(NgEvidenceSession) private readonly sessionsRepo: Repository<NgEvidenceSession>,
    @InjectRepository(NgEvidenceItem) private readonly itemsRepo: Repository<NgEvidenceItem>,
    @InjectRepository(NgEventEvidence) private readonly evidenceRepo: Repository<NgEventEvidence>,
    private readonly storage: EvidenceStorageService,
  ) {}

  async createUploadSession(device: NgEdgeDevice, circleId: string, eventId: string, req: any) {
    await this.mustEventExist(circleId, eventId);

    const sessionId = crypto.randomUUID();
    const now = new Date();

    const manifest = req?.manifest ?? null;
    // Some DBs require manifest_hash NOT NULL. Always compute a hash (even if
    // manifest is missing) to stay compatible with persistent schemas.
    const manifestHash = sha256Hex(stableStringify(manifest ?? {}));

    const session = this.sessionsRepo.create({
      id: sessionId,
      circleId,
      eventId,
      edgeDeviceId: device.id,
      status: 'OPEN',
      evidenceId: null,
      manifestHash,
      createdAt: now,
      completedAt: null,
    });
    await this.sessionsRepo.save(session);

    const items = (manifest?.items ?? []) as any[];
    for (const it of items) {
      const startAt = new Date(it.timeRange?.startAt);
      const endAt = new Date(it.timeRange?.endAt);

      const deviceKind = String(it.deviceRef?.kind ?? 'other');
      const deviceId = String(it.deviceRef?.id ?? 'unknown');
      const deviceDisplayName = it.deviceRef?.displayName ? String(it.deviceRef.displayName) : null;

      // Keep object key consistent with EvidenceStorageService.
      const objectKey = `circles/${circleId}/events/${eventId}/${it.sha256}`;

      const row = this.itemsRepo.create({
        id: crypto.randomUUID(),
        sessionId,
        circleId,
        eventId,
        sha256: it.sha256,
        type: it.type,
        contentType: it.contentType,
        size: String(it.size),
        timeRangeStartAt: startAt,
        timeRangeEndAt: endAt,
        deviceRefKind: deviceKind,
        deviceRefId: deviceId,
        deviceRefDisplayName: deviceDisplayName,
        objectKey,
        // legacy jsonb
        timeRange: it.timeRange,
        deviceRef: it.deviceRef,
        createdAt: now,
      });
      await this.itemsRepo.save(row);
    }

    const uploadUrls: Array<{ sha256: string; url: string }> = [];
    for (const it of items) {
      const presigned = await this.storage.presignUploadUrl({
        circleId,
        eventId,
        sha256: it.sha256,
        contentType: it.contentType,
      });
      uploadUrls.push({ sha256: it.sha256, url: presigned.url });
    }

    return { sessionId, uploadUrls };
  }

  async completeEvidence(device: NgEdgeDevice, circleId: string, eventId: string, req: any) {
    await this.mustEventExist(circleId, eventId);

    const sessionId = req.sessionId as string;
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NgHttpError({
        statusCode: 404,
        error: 'Not Found',
        code: NgErrorCodes.NOT_FOUND,
        message: 'Evidence session not found',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }
    if (session.circleId !== circleId || session.eventId !== eventId) {
      throw new NgHttpError({
        statusCode: 409,
        error: 'Conflict',
        code: NgErrorCodes.EVENT_CONFLICT,
        message: 'Evidence session does not match target event',
        timestamp: new Date().toISOString(),
        retryable: false,
        details: { sessionCircleId: session.circleId, sessionEventId: session.eventId },
      });
    }

    // If already completed, return the prior response (idempotent).
    if (session.status === 'COMPLETED' && session.evidenceId) {
      const existing = await this.evidenceRepo.findOne({ where: { id: session.evidenceId } });
      if (existing) {
        return this.toCompleteResponse(existing, true);
      }
    }

    // Enforce 1 evidence per event in v1.
    const existingForEvent = await this.evidenceRepo.findOne({ where: { eventId } });
    if (existingForEvent) {
      // If a replay with same sessionId, return deduped; otherwise conflict.
      if (existingForEvent.sessionId === sessionId) {
        return this.toCompleteResponse(existingForEvent, true);
      }
      throw new NgHttpError({
        statusCode: 409,
        error: 'Conflict',
        code: NgErrorCodes.EVENT_CONFLICT,
        message: 'Evidence already completed for this event',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }

    const now = new Date();
    const reportReq = req.reportPackage ?? null;

    const warnings: string[] = [];
    // If not requested, explicitly mark as NONE (helps clients; schema allows it).
    let reportPackage: any = { included: false, status: 'NONE' };

    if (reportReq && reportReq.included === true) {
      // v1 contract allows reportPackage metadata but does not define upload URLs for it.
      // We persist it but mark as FAILED in the response.
      warnings.push('REPORT_PACKAGE_NOT_SUPPORTED');
      reportPackage = {
        included: true,
        type: reportReq.type,
        sha256: reportReq.sha256,
        status: 'FAILED',
      };
    }

    const evidenceId = crypto.randomUUID();
    const evidence = this.evidenceRepo.create({
      id: evidenceId,
      circleId,
      eventId,
      sessionId,
      evidenceStatus: 'ARCHIVED',
      completedAt: now,
      archivedAt: now,
      manifest: req.manifest,
      reportPackage,
      warnings: warnings.length ? warnings : null,
      createdAt: now,
    });

    await this.evidenceRepo.save(evidence);

    session.status = 'COMPLETED';
    session.completedAt = now;
    session.evidenceId = evidenceId;
    await this.sessionsRepo.save(session);

    return this.toCompleteResponse(evidence, false);
  }


async getEvidence(circleId: string, eventId: string) {
  const ev = await this.evidenceRepo.findOne({ where: { circleId, eventId } });
  if (!ev) {
    throw new NgHttpError({
      statusCode: 404,
      error: 'Not Found',
      code: NgErrorCodes.NOT_FOUND,
      message: 'Evidence not found',
      timestamp: new Date().toISOString(),
      retryable: false,
    });
  }
  return {
    eventId: ev.eventId,
    evidenceId: ev.id,
    evidenceStatus: ev.evidenceStatus,
    completedAt: ev.completedAt.toISOString(),
    archivedAt: ev.archivedAt ? ev.archivedAt.toISOString() : null,
    manifest: ev.manifest,
    reportPackage: ev.reportPackage,
    warnings: ev.warnings ?? [],
  };
}

async getDownloadUrl(circleId: string, eventId: string, sha256: string) {
  const ev = await this.evidenceRepo.findOne({ where: { circleId, eventId } });
  if (!ev) {
    throw new NgHttpError({
      statusCode: 404,
      error: 'Not Found',
      code: NgErrorCodes.NOT_FOUND,
      message: 'Evidence not found',
      timestamp: new Date().toISOString(),
      retryable: false,
    });
  }
  const items = (ev.manifest as any)?.items ?? [];
  const found = items.find((x: any) => x.sha256 === sha256);
  if (!found) {
    throw new NgHttpError({
      statusCode: 404,
      error: 'Not Found',
      code: NgErrorCodes.NOT_FOUND,
      message: 'Evidence item not found',
      timestamp: new Date().toISOString(),
      retryable: false,
    });
  }

  const { url, expiresAt } = await this.storage.presignDownloadUrl({ circleId, eventId, sha256 });
  return { sha256, url, expiresAt };
}

private async mustEventExist(circleId: string, eventId: string) {
    const ev = await this.eventsRepo.findOne({ where: { circleId, eventId } });
    if (!ev) {
      throw new NgHttpError({
        statusCode: 404,
        error: 'Not Found',
        code: NgErrorCodes.NOT_FOUND,
        message: 'Event not found',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }
  }

  private toCompleteResponse(ev: NgEventEvidence, deduped: boolean) {
    // Contract for POST /evidence/complete expects warnings as an array of objects
    // with { code, message, itemSha256? }. Our DB stores warning codes only.
    const warnings = (ev.warnings ?? []).map((code) => ({
      code,
      message:
        code === 'REPORT_PACKAGE_NOT_SUPPORTED'
          ? 'Report package upload is not supported in v1 mock storage.'
          : 'See code for details.',
    }));

    const resp: any = {
      accepted: true,
      eventId: ev.eventId,
      sessionId: ev.sessionId,
      evidenceId: ev.id,
      evidenceStatus: ev.evidenceStatus,
      completedAt: ev.completedAt.toISOString(),
      // For ARCHIVED, contract requires archivedAt to be present (DateTime or null).
      archivedAt: ev.archivedAt ? ev.archivedAt.toISOString() : null,
      manifest: ev.manifest,
      reportPackage: ev.reportPackage,
      deduped: deduped ? true : undefined,
      warnings: warnings.length ? warnings : undefined,
    };
    return resp;
  }
}
