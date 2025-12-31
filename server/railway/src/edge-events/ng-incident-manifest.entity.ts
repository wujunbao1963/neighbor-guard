import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Authoritative incident manifest snapshot per (circleId,eventId).
 * This is NOT the same as evidence uploads; it's an index/manifest declared by Edge.
 */
@Entity('ng_incident_manifests')
@Index('uniq_ng_incident_manifests_circle_event', ['circleId','eventId'], { unique: true })
@Index('idx_ng_incident_manifests_circle_updated', ['circleId','edgeUpdatedAt'])
export class NgIncidentManifest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'circle_id' })
  circleId!: string;

  @Column({ type: 'text', name: 'event_id' })
  eventId!: string;

  @Column({ type: 'text', name: 'edge_instance_id' })
  edgeInstanceId!: string;

  @Column({ type: 'timestamptz', name: 'edge_updated_at' })
  edgeUpdatedAt!: Date;

  @Column({ type: 'bigint', name: 'last_sequence', default: 0 })
  lastSequence!: string; // bigint

  @Column({ type: 'text', name: 'last_payload_hash', nullable: true })
  lastPayloadHash!: string | null;

  @Column({ type: 'jsonb', name: 'manifest_json' })
  manifestJson!: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'last_upsert_received_at' })
  lastUpsertReceivedAt!: Date;
}
