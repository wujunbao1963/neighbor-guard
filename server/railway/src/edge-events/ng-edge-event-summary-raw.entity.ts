import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ng_edge_event_summaries_raw')
export class NgEdgeEventSummaryRaw {
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

  @Column({ type: 'timestamptz', name: 'edge_updated_at' })
  edgeUpdatedAt!: Date;

  @Column({ type: 'jsonb', name: 'payload' })
  payload!: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt!: Date;
}
