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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';
import { EvidenceTicketsService } from './evidence-tickets.service';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeValidationError } from '../common/errors/ng-http-error';

@Controller('/api/evidence/tickets')
export class EvidenceTicketMetaController {
  constructor(
    private readonly svc: EvidenceTicketsService,
    private readonly circles: CirclesService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  @Get(':ticketId/meta')
  @UseGuards(AuthGuard('jwt'))
  async meta(
    @Req() req: { user: JwtUser },
    @Param('ticketId', new ParseUUIDPipe({ version: '4' })) ticketId: string,
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
    const edgeUrl = this.svc.extractEdgeUrl({ ticket, manifest });
    if (!edgeUrl) {
      throw new NotFoundException('evidence not available');
    }

    const leaseId = await this.svc.acquireLease({
      ticketId: ticket.ticketId,
      requesterUserId: req.user.userId,
      leaseType: 'meta',
      ttlSec: 20,
    });
    if (!leaseId) {
      throw new HttpException('too many concurrent requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    const safeRelease = async () => {
      try {
        await this.svc.releaseLease(leaseId);
      } catch {
        // swallow
      }
    };

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(edgeUrl, { method: 'HEAD', signal: ac.signal });
    } catch (e) {
      await safeRelease();
      throw new BadGatewayException('failed to fetch evidence metadata');
    } finally {
      clearTimeout(timeout);
    }

    if (upstream.status >= 400) {
      await this.svc.writeDownloadAudit({
        ticket,
        requesterUserId: req.user.userId,
        requestedRange: null,
        upstreamStatus: upstream.status,
        bytesSent: null,
      });
      await safeRelease();
      throw new BadGatewayException(`upstream responded ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const len = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');

    const body = {
      ok: true,
      ticketId: ticket.ticketId,
      evidenceKey: ticket.evidenceKey,
      contentType,
      contentLength: len ? Number(len) : null,
      acceptRanges: acceptRanges || null,
    };

    // Contract validate response
    const v = this.contracts.validateAppEvidenceTicketMetaResponse(body);
    if (!v.ok) {
      throw makeValidationError(v.errors);
    }

    await this.svc.writeDownloadAudit({
      ticket,
      requesterUserId: req.user.userId,
      requestedRange: null,
      upstreamStatus: upstream.status,
      bytesSent: len ? Number(len) : null,
    });

    await safeRelease();

    return body;
  }
}
