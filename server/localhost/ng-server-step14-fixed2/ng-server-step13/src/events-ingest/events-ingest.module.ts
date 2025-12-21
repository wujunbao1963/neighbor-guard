import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { NgEvent } from './ng-event.entity';
import { NgEventIdempotency } from './ng-event-idempotency.entity';
import { EventsIngestController } from './events-ingest.controller';
import { EventsIngestService } from './events-ingest.service';

@Module({
  imports: [
    ContractsModule,
    DeviceAuthModule,
    TypeOrmModule.forFeature([NgEvent, NgEventIdempotency]),
  ],
  controllers: [EventsIngestController],
  providers: [EventsIngestService],
})
export class EventsIngestModule {}
