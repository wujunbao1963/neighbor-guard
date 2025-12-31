import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ng_evidence_download_audit')
export class NgEvidenceDownloadAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'ticket_id' })
  ticketId!: string;

  @Column('uuid', { name: 'circle_id' })
  circleId!: string;

  @Column('text', { name: 'event_id' })
  eventId!: string;

  @Column('uuid', { name: 'requester_user_id' })
  requesterUserId!: string;

  @Column('text', { name: 'evidence_key' })
  evidenceKey!: string;

  @Column('text', { name: 'requested_range', nullable: true })
  requestedRange!: string | null;

  @Column('int', { name: 'upstream_status' })
  upstreamStatus!: number;

  @Column('bigint', { name: 'bytes_sent', nullable: true })
  bytesSent!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
