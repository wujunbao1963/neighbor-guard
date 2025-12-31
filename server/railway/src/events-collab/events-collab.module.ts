import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { NgEvent } from '../events-ingest/ng-event.entity';
import { NgEventNote } from './ng-event-note.entity';
import { NgEventStatusIdempotency } from './ng-event-status-idempotency.entity';
import { EventsCollabController } from './events-collab.controller';
import { EventsCollabService } from './events-collab.service';
import { CirclesModule } from '../circles/circles.module';

@Module({
  imports: [
    ContractsModule,
    CirclesModule,
    TypeOrmModule.forFeature([NgEvent, NgEventNote, NgEventStatusIdempotency]),
  ],
  controllers: [EventsCollabController],
  providers: [EventsCollabService],
})
export class EventsCollabModule {}
