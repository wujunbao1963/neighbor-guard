import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { ContractsModule } from '../common/contracts/contracts.module';

import { NgTopoMap } from './ng-topomap.entity';
import { TopoMapController } from './topomap.controller';
import { TopoMapService } from './topomap.service';

@Module({
  imports: [TypeOrmModule.forFeature([NgTopoMap]), DeviceAuthModule, ContractsModule],
  controllers: [TopoMapController],
  providers: [TopoMapService],
})
export class TopoMapModule {}
