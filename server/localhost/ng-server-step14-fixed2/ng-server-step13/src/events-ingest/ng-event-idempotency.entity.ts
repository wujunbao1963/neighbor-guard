import {
  Column,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';
import { NgEvent } from './ng-event.entity';

@Entity({ name: 'ng_event_idempotency' })
@Index(['edgeDeviceId', 'idempotencyKey'], { unique: true })
export class NgEventIdempotency {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'edge_device_id', type: 'uuid' })
  edgeDeviceId!: string;

  @ManyToOne(() => NgEdgeDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'edge_device_id' })
  edgeDevice!: NgEdgeDevice;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => NgEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: NgEvent;

  @Column({ name: 'payload_hash', type: 'text' })
  payloadHash!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
