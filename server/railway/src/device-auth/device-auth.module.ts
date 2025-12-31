import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';
import { DeviceAuthService } from './device-auth.service';
import { DeviceKeyAuthGuard } from './device-key-auth.guard';
import { DeviceAuthController } from './device-auth.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([NgEdgeDevice])],
  controllers: [DeviceAuthController],
  providers: [DeviceAuthService, DeviceKeyAuthGuard],
  exports: [DeviceAuthService, DeviceKeyAuthGuard],
})
export class DeviceAuthModule {}
