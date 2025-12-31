import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { NgEvidenceItem } from './ng-evidence-item.entity';
import { NgEvidenceSession } from './ng-evidence-session.entity';
import { NgEventEvidence } from './ng-event-evidence.entity';
import { CirclesModule } from '../circles/circles.module';

@Module({
  imports: [
    ContractsModule,
    DeviceAuthModule,
    CirclesModule,
    TypeOrmModule.forFeature([NgEvent, NgEvidenceSession, NgEvidenceItem, NgEventEvidence]),
  ],
  controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceStorageService],
})
export class EvidenceModule {}
