import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { NgErrorCodes, NgHttpError, makeValidationError } from '../common/errors/ng-http-error';
import { EventsCollabService } from './events-collab.service';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';

@Controller('/api/circles/:circleId/events')
@UseGuards(AuthGuard('jwt'))
export class EventsCollabController {
  constructor(
    private readonly svc: EventsCollabService,
    private readonly contracts: ContractsValidatorService,
    private readonly circles: CirclesService,
  ) {}

  @Patch(':eventId/status')
  async updateStatus(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: unknown,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const v = this.contracts.validateStatusUpdateRequest(body);
    if (!v.ok) {
      throw makeValidationError(v.errors);
    }

    const result = await this.svc.updateStatus(circleId, eventId, body as any);

    const outV = this.contracts.validateStatusUpdateResponse(result);
    if (!outV.ok) {
      throw new NgHttpError({
        statusCode: 500,
        error: 'Internal Server Error',
        code: NgErrorCodes.INTERNAL,
        message: 'Server response does not match contracts',
        timestamp: new Date().toISOString(),
        details: { schema: 'events.status.update.response', errors: outV.errors },
        retryable: true,
      });
    }

    return result;
  }

  @Post(':eventId/notes')
  async createNote(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: unknown,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const v = this.contracts.validateNotesCreateRequest(body);
    if (!v.ok) {
      throw makeValidationError(v.errors);
    }

    const result = await this.svc.createNote(circleId, eventId, body as any);

    const outV = this.contracts.validateNotesCreateResponse(result);
    if (!outV.ok) {
      throw new NgHttpError({
        statusCode: 500,
        error: 'Internal Server Error',
        code: NgErrorCodes.INTERNAL,
        message: 'Server response does not match contracts',
        timestamp: new Date().toISOString(),
        details: { schema: 'events.notes.create.response', errors: outV.errors },
        retryable: true,
      });
    }

    return result;
  }
}
