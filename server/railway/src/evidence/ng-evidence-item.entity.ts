import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/**
 * Evidence items recorded under an upload session.
 *
 * NOTE on DB alignment:
 * We are using a persistent Railway Postgres across steps, so the real schema can
 * be ahead of earlier migrations.
 *
 * The current shared DB schema (as observed) includes BOTH:
 *  - normalized columns (time_range_start_at, device_ref_kind, object_key, etc.)
 *  - legacy JSONB columns (time_range, device_ref)
 *
 * We map both and always write BOTH forms on insert.
 */
@Entity({ name: 'ng_evidence_items' })
@Unique('uq_ng_evidence_items_session_sha256', ['sessionId', 'sha256'])
export class NgEvidenceItem {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Index()
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Index()
  @Column({ name: 'circle_id', type: 'uuid' })
  circleId!: string;

  @Index()
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'sha256', type: 'text' })
  sha256!: string;

  // Contract field is `type`.
  @Column({ name: 'type', type: 'text' })
  type!: string;

  @Column({ name: 'content_type', type: 'text' })
  contentType!: string;

  // bigint is kept as string to avoid JS precision issues.
  @Column({ name: 'size', type: 'bigint' })
  size!: string;

  // Normalized time range
  @Column({ name: 'time_range_start_at', type: 'timestamptz' })
  timeRangeStartAt!: Date;

  @Column({ name: 'time_range_end_at', type: 'timestamptz' })
  timeRangeEndAt!: Date;

  // Normalized device ref
  @Column({ name: 'device_ref_kind', type: 'text' })
  deviceRefKind!: string;

  @Column({ name: 'device_ref_id', type: 'text' })
  deviceRefId!: string;

  @Column({ name: 'device_ref_display_name', type: 'text', nullable: true })
  deviceRefDisplayName!: string | null;

  // Storage object key (S3 key or equivalent)
  @Column({ name: 'object_key', type: 'text' })
  objectKey!: string;

  // Legacy JSONB (kept for compatibility)
  @Column({ name: 'time_range', type: 'jsonb', nullable: true })
  timeRange!: Record<string, any> | null;

  @Column({ name: 'device_ref', type: 'jsonb', nullable: true })
  deviceRef!: Record<string, any> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
