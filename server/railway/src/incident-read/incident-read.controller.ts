import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { NgHttpError, NgErrorCodes } from '../common/errors/ng-http-error';
import { CirclesService } from '../circles/circles.service';
import { JwtUser } from '../auth/auth.types';
import { IncidentReadService } from './incident-read.service';

@Controller('/api/circles/:circleId/events/:eventId/incident')
export class IncidentReadController {
  constructor(
    private readonly svc: IncidentReadService,
    private readonly circles: CirclesService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  @Get('manifest')
  @UseGuards(AuthGuard('jwt'))
  async getManifest(
    @Req() req: { user: JwtUser },
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId') eventId: string,
  ) {
    await this.circles.mustBeMember(req.user.userId, circleId);
    const row = await this.svc.getManifest(circleId, eventId);

    if (!row) {
      throw new NgHttpError({
        statusCode: 404,
        error: 'Not Found',
        code: NgErrorCodes.NOT_FOUND,
        message: 'Incident manifest not found',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }

    const response = {
      ok: true,
      circleId,
      eventId,
      edgeInstanceId: row.edgeInstanceId,
      edgeUpdatedAt: row.edgeUpdatedAt.toISOString(),
      sequence: Number(row.lastSequence),
      manifest: (row.manifestJson as any).manifest ?? (row.manifestJson as any),
    };

    const v = this.contracts.validateAppIncidentManifestGetResponse(response);
    if (!v.ok) {
      throw new NgHttpError({
        statusCode: 500,
        error: 'Internal Server Error',
        code: NgErrorCodes.INTERNAL,
        message: 'Server response does not match contracts',
        timestamp: new Date().toISOString(),
        details: { schema: 'app.incidentManifest.get.response', errors: v.errors },
        retryable: true,
      });
    }

    return response;
  }
}
