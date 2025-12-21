import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { NgEventNote } from '../events-collab/ng-event-note.entity';
import { NgEvidenceSession } from '../evidence/ng-evidence-session.entity';
import { NgEventEvidence } from '../evidence/ng-event-evidence.entity';
import { EventsReadController } from './events-read.controller';
import { EventsReadService } from './events-read.service';
import { CirclesModule } from '../circles/circles.module';

@Module({
  imports: [
    ContractsModule,
    CirclesModule,
    TypeOrmModule.forFeature([NgEvent, NgEventNote, NgEvidenceSession, NgEventEvidence]),
  ],
  controllers: [EventsReadController],
  providers: [EventsReadService],
})
export class EventsReadModule {}
