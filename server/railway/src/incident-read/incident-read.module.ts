import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { CirclesModule } from '../circles/circles.module';
import { NgIncidentManifest } from '../edge-events/ng-incident-manifest.entity';
import { IncidentReadController } from './incident-read.controller';
import { IncidentReadService } from './incident-read.service';

@Module({
  imports: [TypeOrmModule.forFeature([NgIncidentManifest]), CirclesModule, ContractsModule],
  controllers: [IncidentReadController],
  providers: [IncidentReadService],
})
export class IncidentReadModule {}
