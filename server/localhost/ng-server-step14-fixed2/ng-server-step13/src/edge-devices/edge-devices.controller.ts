import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EdgeDevicesService } from './edge-devices.service';
import { RegisterEdgeDeviceDto } from './dto/register-edge-device.dto';
import { UpdateEdgeDeviceDto } from './dto/update-edge-device.dto';
import { JwtUser } from '../auth/auth.types';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { makeNotFoundError, makeValidationError } from '../common/errors/ng-http-error';

@Controller('api/circles/:circleId/edge/devices')
@UseGuards(AuthGuard('jwt'))
export class EdgeDevicesController {
  constructor(
    private readonly edgeDevices: EdgeDevicesService,
    private readonly contracts: ContractsValidatorService,
  ) {}

  @Post()
  async register(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Body() body: RegisterEdgeDeviceDto,
    @Req() req: { user: JwtUser },
  ) {
    const vr = this.contracts.validateDeviceRegisterRequest(body);
    if (!vr.ok) throw makeValidationError(vr.errors);

    const out = await this.edgeDevices.register(req.user.userId, circleId, body);
    const vo = this.contracts.validateDeviceRegisterResponse(out);
    if (!vo.ok) throw makeValidationError(vo.errors);
    return out;
  }

  @Get()
  async list(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Req() req: { user: JwtUser },
  ) {
    return this.edgeDevices.list(req.user.userId, circleId);
  }

  @Patch(':deviceId')
  async setEnabled(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @Body() body: UpdateEdgeDeviceDto,
    @Req() req: { user: JwtUser },
  ) {
    try {
      return await this.edgeDevices.setEnabled(req.user.userId, circleId, deviceId, body.enabled);
    } catch (e: any) {
      if (e?.message === 'DEVICE_NOT_FOUND') throw makeNotFoundError('Device not found');
      throw e;
    }
  }

  @Post(':deviceId/rotate-key')
  async rotateKey(
    @Param('circleId', new ParseUUIDPipe({ version: '4' })) circleId: string,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @Req() req: { user: JwtUser },
  ) {
    try {
      return await this.edgeDevices.rotateKey(req.user.userId, circleId, deviceId);
    } catch (e: any) {
      if (e?.message === 'DEVICE_NOT_FOUND') throw makeNotFoundError('Device not found');
      throw e;
    }
  }
}
