import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeValidationError } from '../common/errors/ng-http-error';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';
import { EvidenceTicketsService } from './evidence-tickets.service';

@Controller('/api/circles/:circleId/events/:eventId/evidence')
export class EvidenceTicketsController {
  constructor(
    private readonly svc: EvidenceTicketsService,
    private readonly circles: CirclesService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  @Post('tickets')
  @UseGuards(AuthGuard('jwt'))
  async createTicket(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const v = this.contracts.validateAppEvidenceTicketCreateRequest(body);
    if (!v.ok) {
      throw makeValidationError(v.errors);
    }
    const typed = body as { evidenceKey: string; ttlSec: number };

    const row = await this.svc.createTicket({
      circleId,
      eventId,
      requesterUserId: req.user.userId,
      evidenceKey: typed.evidenceKey,
      ttlSec: typed.ttlSec,
    });

    const response = {
      ok: true,
      ticketId: row.ticketId,
      evidenceKey: row.evidenceKey,
      expiresAt: row.expiresAt.toISOString(),
      accessMode: 'TICKET_ONLY',
    };

    const vr = this.contracts.validateAppEvidenceTicketCreateResponse(response);
    if (!vr.ok) {
      throw makeValidationError(vr.errors);
    }

    return response;
  }
}
