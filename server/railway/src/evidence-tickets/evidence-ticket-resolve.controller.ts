import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeValidationError } from '../common/errors/ng-http-error';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';
import { EvidenceTicketsService } from './evidence-tickets.service';

@Controller('/api/evidence/tickets')
export class EvidenceTicketResolveController {
  constructor(
    private readonly svc: EvidenceTicketsService,
    private readonly circles: CirclesService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  @Get(':ticketId/resolve')
  @UseGuards(AuthGuard('jwt'))
  async resolve(
    @Req() req: { user: JwtUser },
    @Param('ticketId', new ParseUUIDPipe({ version: '4' })) ticketId: string,
  ) {
    const { ticket, manifest } = await this.svc.resolveTicket({ ticketId });
    if (!ticket) {
      throw new NotFoundException();
    }

    // Membership check
    await this.circles.mustBeMember(req.user.userId, ticket.circleId);

    // Ticket is scoped to the requester to prevent forwarding.
    if (ticket.requesterUserId !== req.user.userId) {
      throw new ForbiddenException('ticket not owned');
    }

    const now = Date.now();
    if (ticket.expiresAt.getTime() <= now) {
      // Ticket exists but expired: treat as forbidden (can't use it).
      throw new ForbiddenException('ticket expired');
    }

    let mode: 'EDGE_DIRECT_URL' | 'NOT_AVAILABLE' = 'NOT_AVAILABLE';
    let url: string | undefined;

    if (manifest) {
      const payload: any = manifest.manifestJson as any;
      const items: any[] = Array.isArray(payload?.manifest?.items) ? payload.manifest.items : [];
      const found = items.find((x) => x && x.evidenceKey === ticket.evidenceKey);
      if (found && typeof found.edgeUrl === 'string') {
        mode = 'EDGE_DIRECT_URL';
        url = found.edgeUrl;
      }
    }

    const response: any = {
      ok: true,
      ticketId: ticket.ticketId,
      evidenceKey: ticket.evidenceKey,
      mode,
    };
    if (url) {
      response.url = url;
    }

    const vr = this.contracts.validateAppEvidenceTicketResolveResponse(response);
    if (!vr.ok) {
      throw makeValidationError(vr.errors);
    }

    return response;
  }
}
