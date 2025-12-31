import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NgIncidentManifest } from '../edge-events/ng-incident-manifest.entity';
import { NgEvidenceAccessTicket } from './ng-evidence-access-ticket.entity';
import { NgEvidenceDownloadAudit } from './ng-evidence-download-audit.entity';
import { EvidenceLeaseType, NgEvidenceDownloadLease } from './ng-evidence-download-lease.entity';

@Injectable()
export class EvidenceTicketsService {
  constructor(
    @InjectRepository(NgEvidenceAccessTicket)
    private readonly repo: Repository<NgEvidenceAccessTicket>,
    @InjectRepository(NgIncidentManifest)
    private readonly manifests: Repository<NgIncidentManifest>,
    @InjectRepository(NgEvidenceDownloadAudit)
    private readonly downloads: Repository<NgEvidenceDownloadAudit>,
    @InjectRepository(NgEvidenceDownloadLease)
    private readonly leases: Repository<NgEvidenceDownloadLease>,
  ) {}

  /**
   * Acquire a short-lived lease to limit concurrent meta/download requests.
   * Returns the leaseId if acquired, otherwise null.
   */
  async acquireLease(args: {
    ticketId: string;
    requesterUserId: string;
    leaseType: EvidenceLeaseType;
    ttlSec?: number;
  }): Promise<string | null> {
    const ttl = Math.max(5, Math.min(args.ttlSec ?? 30, 120));
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Clear expired lease (best-effort) to avoid blocking inserts.
    await this.leases
      .createQueryBuilder()
      .delete()
      .from(NgEvidenceDownloadLease)
      .where('ticket_id = :ticketId', { ticketId: args.ticketId })
      .andWhere('lease_type = :leaseType', { leaseType: args.leaseType })
      .andWhere('expires_at < :now', { now: new Date() })
      .execute();

    // Use INSERT ... ON CONFLICT DO NOTHING to avoid throwing on unique constraint.
    const ins = await this.leases
      .createQueryBuilder()
      .insert()
      .into(NgEvidenceDownloadLease)
      .values({
        ticketId: args.ticketId,
        requesterUserId: args.requesterUserId,
        leaseType: args.leaseType,
        expiresAt,
      })
      .orIgnore()
      .returning(['lease_id'])
      .execute();

    const row = ins.raw && ins.raw[0];
    return row ? (row.lease_id as string) : null;
  }

  async releaseLease(leaseId: string): Promise<void> {
    // Best-effort release.
    // Controllers await response completion before releasing, so we
    // avoid async teardown races.
    try {
      await this.leases
        .createQueryBuilder()
        .delete()
        .from(NgEvidenceDownloadLease)
        .where('lease_id = :leaseId', { leaseId })
        .execute();
    } catch {
      // swallow
    }
  }

  async purgeExpired(): Promise<{ deletedTickets: number; deletedLeases: number }> {
    const now = new Date();
    const r1 = await this.repo
      .createQueryBuilder()
      .delete()
      .from(NgEvidenceAccessTicket)
      .where('expires_at < :now', { now })
      .execute();
    const r2 = await this.leases
      .createQueryBuilder()
      .delete()
      .from(NgEvidenceDownloadLease)
      .where('expires_at < :now', { now })
      .execute();
    return { deletedTickets: r1.affected ?? 0, deletedLeases: r2.affected ?? 0 };
  }

  async createTicket(args: {
    circleId: string;
    eventId: string;
    requesterUserId: string;
    evidenceKey: string;
    ttlSec: number;
  }): Promise<NgEvidenceAccessTicket> {
    // Keep server-side TTL rules aligned with contract.
    // Tests and some flows rely on very short TTLs (e.g., 1s) for purge verification.
    const ttl = Math.max(1, Math.min(args.ttlSec, 3600));
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const row = this.repo.create({
      circleId: args.circleId,
      eventId: args.eventId,
      requesterUserId: args.requesterUserId,
      evidenceKey: args.evidenceKey,
      expiresAt,
    });

    return this.repo.save(row);
  }

  async resolveTicket(args: {
    ticketId: string;
  }): Promise<{
    ticket: NgEvidenceAccessTicket | null;
    manifest: NgIncidentManifest | null;
  }> {
    const ticket = await this.repo.findOne({ where: { ticketId: args.ticketId } });
    if (!ticket) return { ticket: null, manifest: null };
    const manifest = await this.manifests.findOne({ where: { circleId: ticket.circleId, eventId: ticket.eventId } });
    return { ticket, manifest };
  }

  extractEdgeUrl(args: { ticket: NgEvidenceAccessTicket; manifest: NgIncidentManifest | null }): string | null {
    const { ticket, manifest } = args;
    if (!manifest) return null;
    const payload: any = manifest.manifestJson as any;
    const items: any[] = Array.isArray(payload?.manifest?.items) ? payload.manifest.items : [];
    const found = items.find((x) => x && x.evidenceKey === ticket.evidenceKey);
    return found && typeof found.edgeUrl === 'string' ? found.edgeUrl : null;
  }

  async writeDownloadAudit(args: {
    ticket: NgEvidenceAccessTicket;
    requesterUserId: string;
    requestedRange: string | null;
    upstreamStatus: number;
    bytesSent: number | null;
  }): Promise<void> {
    // Best-effort audit: never fail the main request path.
    // This also avoids noisy errors during test/app shutdown.
    try {
      const row = this.downloads.create({
        ticketId: args.ticket.ticketId,
        circleId: args.ticket.circleId,
        eventId: args.ticket.eventId,
        requesterUserId: args.requesterUserId,
        evidenceKey: args.ticket.evidenceKey,
        requestedRange: args.requestedRange,
        upstreamStatus: args.upstreamStatus,
        bytesSent: args.bytesSent !== null ? String(args.bytesSent) : null,
      });
      await this.downloads.save(row);
    } catch {
      // swallow
    }
  }
}
