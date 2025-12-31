import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../common/contracts/contracts.module';
import { CirclesModule } from '../circles/circles.module';
import { NgIncidentManifest } from '../edge-events/ng-incident-manifest.entity';
import { NgEvidenceAccessTicket } from './ng-evidence-access-ticket.entity';
import { NgEvidenceDownloadAudit } from './ng-evidence-download-audit.entity';
import { NgEvidenceDownloadLease } from './ng-evidence-download-lease.entity';
import { EvidenceTicketsController } from './evidence-tickets.controller';
import { EvidenceTicketResolveController } from './evidence-ticket-resolve.controller';
import { EvidenceTicketDownloadController } from './evidence-ticket-download.controller';
import { EvidenceTicketMetaController } from './evidence-ticket-meta.controller';
import { EvidenceTicketsService } from './evidence-tickets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NgEvidenceAccessTicket, NgIncidentManifest, NgEvidenceDownloadAudit, NgEvidenceDownloadLease]),
    CirclesModule,
    ContractsModule,
  ],
  controllers: [EvidenceTicketsController, EvidenceTicketResolveController, EvidenceTicketDownloadController, EvidenceTicketMetaController],
  providers: [EvidenceTicketsService],
  exports: [EvidenceTicketsService],
})
export class EvidenceTicketsModule {}
