import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ng_event_status_idempotency' })
export class NgEventStatusIdempotency {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Index()
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'client_request_id', type: 'uuid' })
  clientRequestId!: string;

  @Column({ name: 'payload_hash', type: 'text' })
  payloadHash!: string;

  @Column({ name: 'status', type: 'text' })
  status!: string;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
