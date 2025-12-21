import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EdgeDevicesController } from './edge-devices.controller';
import { EdgeDevicesService } from './edge-devices.service';
import { NgEdgeDevice } from './ng-edge-device.entity';
import { CirclesModule } from '../circles/circles.module';
import { ContractsModule } from '../common/contracts/contracts.module';

@Module({
  imports: [TypeOrmModule.forFeature([NgEdgeDevice]), CirclesModule, ContractsModule],
  controllers: [EdgeDevicesController],
  providers: [EdgeDevicesService],
  exports: [EdgeDevicesService],
})
export class EdgeDevicesModule {}
