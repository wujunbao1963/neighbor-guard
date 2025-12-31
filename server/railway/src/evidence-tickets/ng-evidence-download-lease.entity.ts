import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EvidenceLeaseType = 'download' | 'meta';

@Entity('ng_evidence_download_leases')
export class NgEvidenceDownloadLease {
  @PrimaryGeneratedColumn('uuid', { name: 'lease_id' })
  leaseId!: string;

  @Column('uuid', { name: 'ticket_id' })
  ticketId!: string;

  @Column('uuid', { name: 'requester_user_id' })
  requesterUserId!: string;

  @Column('text', { name: 'lease_type' })
  leaseType!: EvidenceLeaseType;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
