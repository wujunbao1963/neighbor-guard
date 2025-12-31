import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type NgEvidenceSessionStatus = 'OPEN' | 'COMPLETED';

@Entity({ name: 'ng_evidence_sessions' })
export class NgEvidenceSession {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Index()
  @Column({ name: 'circle_id', type: 'uuid' })
  circleId!: string;

  @Index()
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'edge_device_id', type: 'uuid' })
  edgeDeviceId!: string;

  @Column({ name: 'status', type: 'text' })
  status!: NgEvidenceSessionStatus;

  // Some DBs (especially when sharing a persistent Railway Postgres) were
  // created with additional NOT NULL columns. We keep this optional in
  // the entity and always set it on insert to satisfy those schemas.
  @Column({ name: 'manifest_hash', type: 'text', nullable: true })
  manifestHash!: string | null;

  @Column({ name: 'evidence_id', type: 'uuid', nullable: true })
  evidenceId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
