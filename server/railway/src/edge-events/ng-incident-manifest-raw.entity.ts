import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Raw landing table for incident packet manifest upserts (v7.7+).
 * Stores the original payload for audit/debug and potential replay.
 */
@Entity('ng_incident_manifests_raw')
@Index('idx_ng_incident_manifests_raw_circle_event_received', ['circleId', 'eventId', 'receivedAt'])
export class NgIncidentManifestRaw {
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

  @Column({ type: 'bigint', name: 'sequence', default: 0 })
  sequence!: string; // bigint from pg driver

  @Column({ type: 'jsonb', name: 'payload' })
  payload!: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt!: Date;
}
