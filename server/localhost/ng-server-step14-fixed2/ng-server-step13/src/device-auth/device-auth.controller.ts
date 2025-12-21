import { Controller, Get, UseGuards } from '@nestjs/common';
import { DeviceKeyAuthGuard } from './device-key-auth.guard';
import { NgDevice } from './ng-device.decorator';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';

@Controller('api/edge/devices')
export class DeviceAuthController {
  @Get('me')
  @UseGuards(DeviceKeyAuthGuard)
  async me(@NgDevice() device: NgEdgeDevice) {
    return {
      deviceId: device.id,
      circleId: device.circleId,
      capabilities: device.capabilities,
      createdAt: device.createdAt?.toISOString?.() ?? null,
      lastSeenAt: device.lastSeenAt?.toISOString?.() ?? null,
    };
  }
}
