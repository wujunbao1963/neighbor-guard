import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsValidatorService } from '../common/contracts/contracts-validator.service';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { NgEdgeEvent } from './ng-edge-event.entity';
import { NgEdgeIngestAudit } from './ng-edge-ingest-audit.entity';
import { NgEdgeEventSummaryRaw } from './ng-edge-event-summary-raw.entity';
import { NgIncidentManifest } from './ng-incident-manifest.entity';
import { NgIncidentManifestRaw } from './ng-incident-manifest-raw.entity';
import { EdgeEventsController } from './edge-events.controller';
import { EdgeEventsService } from './edge-events.service';
import { IncidentManifestsService } from './incident-manifests.service';

@Module({
  imports: [DeviceAuthModule, TypeOrmModule.forFeature([NgEdgeEventSummaryRaw, NgEdgeEvent, NgEdgeIngestAudit, NgIncidentManifestRaw, NgIncidentManifest])],
  controllers: [EdgeEventsController],
  providers: [EdgeEventsService, IncidentManifestsService, ContractsValidatorService],
})
export class EdgeEventsModule {}
