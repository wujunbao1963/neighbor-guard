import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * v7.7+ authoritative edge event snapshot.
 *
 * Hard rule: this table stores EDGE authoritative state only; app collaboration state is stored elsewhere.
 */
@Entity('ng_edge_events')
@Unique('uq_ng_edge_events_circle_event', ['circleId', 'eventId'])
@Index('idx_ng_edge_events_circle_updated', ['circleId', 'edgeUpdatedAt'])
export class NgEdgeEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'circle_id' })
  circleId!: string;

  @Column({ type: 'text', name: 'event_id' })
  eventId!: string;

  @Column({ type: 'text', name: 'edge_instance_id' })
  edgeInstanceId!: string;

  @Column({ type: 'text', name: 'threat_state' })
  threatState!: string;

  @Column({ type: 'text', name: 'trigger_reason', nullable: true })
  triggerReason!: string | null;

  @Column({ type: 'timestamptz', name: 'edge_updated_at' })
  edgeUpdatedAt!: Date;

  @Column({ type: 'bigint', name: 'last_sequence', default: 0 })
  lastSequence!: string; // bigint comes back as string in pg driver

  @Column({ type: 'jsonb', name: 'summary_json' })
  summaryJson!: unknown;

  // Step 3: hash of the last applied payload (stable JSON + sha256).
  @Column({ type: 'text', name: 'last_payload_hash', nullable: true })
  lastPayloadHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'last_upsert_received_at' })
  lastUpsertReceivedAt!: Date;
}
