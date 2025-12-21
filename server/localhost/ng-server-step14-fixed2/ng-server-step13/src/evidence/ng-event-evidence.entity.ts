import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity({ name: 'ng_event_evidence' })
@Unique('uq_ng_event_evidence_event', ['eventId'])
@Unique('uq_ng_event_evidence_session', ['sessionId'])
export class NgEventEvidence {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Index()
  @Column({ name: 'circle_id', type: 'uuid' })
  circleId!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  // NOTE: Some DBs use column name `status` (older), others used `evidence_status`.
  // We align entity to `status` and provide a migration to rename if needed.
  @Column({ name: 'status', type: 'text' })
  evidenceStatus!: 'ARCHIVED' | 'VERIFYING' | 'FAILED';

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'manifest', type: 'jsonb' })
  manifest!: Record<string, any>;

  @Column({ name: 'report_package', type: 'jsonb', nullable: true })
  reportPackage!: Record<string, any> | null;

  @Column({ name: 'warnings', type: 'jsonb', nullable: true })
  warnings!: string[] | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
