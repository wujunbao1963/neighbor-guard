import {
  BadGatewayException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';
import { EvidenceTicketsService } from './evidence-tickets.service';

@Controller('/api/evidence/tickets')
export class EvidenceTicketDownloadController {
  constructor(
    private readonly svc: EvidenceTicketsService,
    private readonly circles: CirclesService,
  ) {}

  @Get(':ticketId/download')
  @UseGuards(AuthGuard('jwt'))
  async download(
    @Req() req: { user: JwtUser; headers?: Record<string, string | string[] | undefined> },
    @Param('ticketId', new ParseUUIDPipe({ version: '4' })) ticketId: string,
    @Res() res: Response,
  ) {
    const { ticket, manifest } = await this.svc.resolveTicket({ ticketId });
    if (!ticket) throw new NotFoundException();

    await this.circles.mustBeMember(req.user.userId, ticket.circleId);

    // Ticket is scoped to the requester to prevent forwarding.
    if (ticket.requesterUserId !== req.user.userId) {
      throw new ForbiddenException('ticket not owned');
    }

    const now = Date.now();
    if (ticket.expiresAt.getTime() <= now) {
      throw new ForbiddenException('ticket expired');
    }

    if (!manifest) {
      throw new NotFoundException('incident manifest not found');
    }

    const edgeUrl = this.svc.extractEdgeUrl({ ticket, manifest });
    if (!edgeUrl) {
      throw new NotFoundException('evidence not available');
    }

    // Acquire per-ticket download lease to limit concurrency.
    const leaseId = await this.svc.acquireLease({
      ticketId: ticket.ticketId,
      requesterUserId: req.user.userId,
      leaseType: 'download',
      ttlSec: 60,
    });
    if (!leaseId) {
      throw new HttpException('too many concurrent downloads', HttpStatus.TOO_MANY_REQUESTS);
    }

    const safeRelease = async () => {
      try {
        await this.svc.releaseLease(leaseId);
      } catch {
        // swallow
      }
    };

    // Proxy download from edgeUrl. Support HTTP Range requests (video/large files).
    const range = (req.headers?.['range'] as string | undefined) || undefined;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15000);
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(edgeUrl, {
        signal: ac.signal,
        headers: range ? { Range: range } : undefined,
      });
    } catch (e) {
      await this.svc.writeDownloadAudit({
        ticket,
        requesterUserId: req.user.userId,
        requestedRange: range || null,
        upstreamStatus: 0,
        bytesSent: null,
      });
      await safeRelease();
      throw new BadGatewayException('failed to fetch evidence');
    } finally {
      clearTimeout(timeout);
    }

    // For common upstream errors, pass through the HTTP status rather than masking as 502.
    if (!upstream.body) {
      await this.svc.writeDownloadAudit({
        ticket,
        requesterUserId: req.user.userId,
        requestedRange: range || null,
        upstreamStatus: upstream.status,
        bytesSent: null,
      });
      await safeRelease();
      throw new BadGatewayException(`upstream responded ${upstream.status}`);
    }
    if (!(upstream.status === 200 || upstream.status === 206)) {
      // 4xx/5xx from upstream
      await this.svc.writeDownloadAudit({
        ticket,
        requesterUserId: req.user.userId,
        requestedRange: range || null,
        upstreamStatus: upstream.status,
        bytesSent: null,
      });
      await safeRelease();
      throw new HttpException(`upstream responded ${upstream.status}`, upstream.status);
    }

    res.status(upstream.status);

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    // Audit (best-effort).
    // IMPORTANT: do this BEFORE starting to stream the response body.
    // Otherwise the HTTP response can finish before audit insert completes
    // (causing flaky tests and "Connection terminated" on shutdown).
    try {
      await this.svc.writeDownloadAudit({
        ticket,
        requesterUserId: req.user.userId,
        requestedRange: range || null,
        upstreamStatus: upstream.status,
        bytesSent: len ? Number(len) : null,
      });
    } catch {
      // Swallow audit errors (do not fail download path)
    }

    // Pipe web stream to Node response.
    const nodeReadable = Readable.fromWeb(upstream.body as any);

    nodeReadable.pipe(res);
    // IMPORTANT: Wait for response to finish before releasing the lease.
    // This makes concurrency tests deterministic and avoids teardown races.
    try {
      await finished(res);
    } finally {
      await safeRelease();
    }
  }
}
