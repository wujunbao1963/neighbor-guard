import { Module } from '@nestjs/common';
import { EvidenceTicketsModule } from '../evidence-tickets/evidence-tickets.module';
import { AdminMaintenanceController } from './admin-maintenance.controller';

@Module({
  imports: [EvidenceTicketsModule],
  controllers: [AdminMaintenanceController],
})
export class AdminModule {}
