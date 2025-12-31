import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { NgHttpError, NgErrorCodes } from '../common/errors/ng-http-error';
import { EventsReadService } from './events-read.service';
import { ListEventsQueryDto } from './dto/list-events.query.dto';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';

@Controller('/api/circles/:circleId/events')
export class EventsReadController {
  constructor(
    private readonly svc: EventsReadService,
    private readonly contracts: ContractsValidatorService,
    private readonly circles: CirclesService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Query() query: ListEventsQueryDto,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const limit = query.limit ?? 50;
    const result = await this.svc.list(circleId, limit, query.cursor);

    const v = this.contracts.validateEventsListResponse(result);
    if (!v.ok) {
      throw new NgHttpError({
        statusCode: 500,
        error: 'Internal Server Error',
        code: NgErrorCodes.INTERNAL,
        message: 'Server response does not match contracts',
        timestamp: new Date().toISOString(),
        details: { schema: 'events.list.response', errors: v.errors },
        retryable: true,
      });
    }

    return result;
  }

  @Get(':eventId')
  @UseGuards(AuthGuard('jwt'))
  async get(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const result = await this.svc.get(circleId, eventId);

    const v = this.contracts.validateEventsGetResponse(result);
    if (!v.ok) {
      throw new NgHttpError({
        statusCode: 500,
        error: 'Internal Server Error',
        code: NgErrorCodes.INTERNAL,
        message: 'Server response does not match contracts',
        timestamp: new Date().toISOString(),
        details: { schema: 'events.get.response', errors: v.errors },
        retryable: true,
      });
    }

    return result;
  }
}
