import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { DeviceKeyAuthGuard } from '../device-auth/device-key-auth.guard';
import { NgDevice } from '../device-auth/ng-device.decorator';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeValidationError } from '../common/errors/ng-http-error';
import { EventsIngestService } from './events-ingest.service';

@Controller('/api/circles/:circleId/events')
export class EventsIngestController {
  constructor(
    private readonly contracts: ContractsValidatorService,
    private readonly svc: EventsIngestService,
  ) {}

  @Post('ingest')
  @UseGuards(DeviceKeyAuthGuard)
  async ingest(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @NgDevice() device: NgEdgeDevice,
    @Body() body: unknown,
  ) {
    const result = this.contracts.validateEventsIngestRequest(body);
    if (!result.ok) {
      throw makeValidationError(result.errors);
    }

    const typed = body as any;
    return this.svc.ingest(device, circleId, typed);
  }
}
