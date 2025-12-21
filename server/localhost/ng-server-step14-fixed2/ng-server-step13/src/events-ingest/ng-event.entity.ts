import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';

@Entity({ name: 'ng_events' })
export class NgEvent {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'circle_id', type: 'uuid' })
  circleId!: string;

  @Column({ name: 'edge_device_id', type: 'uuid' })
  edgeDeviceId!: string;

  @ManyToOne(() => NgEdgeDevice)
  @JoinColumn({ name: 'edge_device_id' })
  edgeDevice!: NgEdgeDevice;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'severity', type: 'text' })
  severity!: string;

  @Column({ name: 'notification_level', type: 'text' })
  notificationLevel!: string;

  @Column({ name: 'status', type: 'text' })
  status!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'acked_at', type: 'timestamptz', nullable: true })
  ackedAt!: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'explain_summary', type: 'jsonb' })
  explainSummary!: Record<string, any>;

  @Column({ name: 'alarm_state', type: 'text', nullable: true })
  alarmState!: string | null;

  @Column({ name: 'zones_visited', type: 'jsonb', nullable: true })
  zonesVisited!: any[] | null;

  @Column({ name: 'key_signals', type: 'jsonb', nullable: true })
  keySignals!: any[] | null;

  @Column({ name: 'raw_event', type: 'jsonb' })
  rawEvent!: Record<string, any>;
}
