import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { DeviceKeyAuthGuard } from '../device-auth/device-key-auth.guard';
import { NgDevice } from '../device-auth/ng-device.decorator';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeNotFoundError, makeValidationError } from '../common/errors/ng-http-error';

import { TopoMapService } from './topomap.service';

@Controller('api/circles/:circleId/topomap')
export class TopoMapController {
  constructor(
    private readonly topo: TopoMapService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  // Device → Cloud backup
  @Put()
  @UseGuards(DeviceKeyAuthGuard)
  async putTopoMap(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @NgDevice() _device: any,
    @Body() body: unknown,
  ) {
    const vr = this.contracts.validateTopoMapRequest(body);
    if (!vr.ok) throw makeValidationError(vr.errors);

    const b: any = body;
    await this.topo.upsert(circleId, { version: b.version, data: b.data });
    return { ok: true };
  }

  // App → read backup
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getTopoMap(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
  ) {
    const found = await this.topo.get(circleId);
    if (!found) throw makeNotFoundError('TopoMap not found');

    const out = {
      version: found.version,
      data: found.data,
    };
    const vo = this.contracts.validateTopoMapResponse(out);
    if (!vo.ok) throw makeValidationError(vo.errors);
    return out;
  }
}
