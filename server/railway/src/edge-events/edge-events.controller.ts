import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeValidationError } from '../common/errors/ng-http-error';
import { DeviceKeyAuthGuard } from '../device-auth/device-key-auth.guard';
import { EdgeEventsService, EdgeEventSummaryUpsertV77 } from './edge-events.service';
import { IncidentManifestsService, EdgeIncidentManifestUpsertV77 } from './incident-manifests.service';

@Controller('/api/circles/:circleId/edge/events')
export class EdgeEventsController {
  constructor(
    private readonly contracts: ContractsValidatorService,
    private readonly svc: EdgeEventsService,
    private readonly manifests: IncidentManifestsService,
  ) {}

  @Post('summary-upsert')
  @UseGuards(DeviceKeyAuthGuard)
  async summaryUpsert(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Body() body: unknown,
  ) {
    const validation = this.contracts.validateEdgeEventSummaryUpsertRequest(body);
    if (!validation.ok) {
      throw makeValidationError(validation.errors);
    }

    const typed = body as EdgeEventSummaryUpsertV77;

    // Contract requires circleId; also ensure it matches path.
    if (typed.circleId !== circleId) {
      throw makeValidationError([
        {
          instancePath: '/circleId',
          schemaPath: 'path.circleId',
          keyword: 'const',
          params: { allowedValue: circleId },
          message: 'circleId must match URL path parameter',
        } as any,
      ]);
    }

    const upsert = await this.svc.storeSummaryUpsert(typed);

    return {
      ok: true,
      applied: upsert.applied,
      reason: upsert.reason,
      serverReceivedAt: new Date().toISOString(),
    };
  }

  @Post(':eventId/incident/manifest-upsert')
  @UseGuards(DeviceKeyAuthGuard)
  async manifestUpsert(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const validation = this.contracts.validateEdgeIncidentManifestUpsertRequest(body);
    if (!validation.ok) {
      throw makeValidationError(validation.errors);
    }

    const typed = body as EdgeIncidentManifestUpsertV77;

    if (typed.circleId !== circleId) {
      throw makeValidationError([
        {
          instancePath: '/circleId',
          schemaPath: 'path.circleId',
          keyword: 'const',
          params: { allowedValue: circleId },
          message: 'circleId must match URL path parameter',
        } as any,
      ]);
    }

    if (typed.eventId !== eventId) {
      throw makeValidationError([
        {
          instancePath: '/eventId',
          schemaPath: 'path.eventId',
          keyword: 'const',
          params: { allowedValue: eventId },
          message: 'eventId must match URL path parameter',
        } as any,
      ]);
    }

    const upsert = await this.manifests.storeManifestUpsert(typed);

    return {
      ok: true,
      applied: upsert.applied,
      reason: upsert.reason,
      serverReceivedAt: new Date().toISOString(),
    };
  }
}
