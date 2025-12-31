import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ng_evidence_access_tickets')
@Index('idx_ng_evidence_access_tickets_circle_event', ['circleId', 'eventId'])
@Index('idx_ng_evidence_access_tickets_expires', ['expiresAt'])
export class NgEvidenceAccessTicket {
  @PrimaryGeneratedColumn('uuid', { name: 'ticket_id' })
  ticketId!: string;

  @Column({ type: 'uuid', name: 'circle_id' })
  circleId!: string;

  @Column({ type: 'text', name: 'event_id' })
  eventId!: string;

  @Column({ type: 'uuid', name: 'requester_user_id' })
  requesterUserId!: string;

  @Column({ type: 'text', name: 'evidence_key' })
  evidenceKey!: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
