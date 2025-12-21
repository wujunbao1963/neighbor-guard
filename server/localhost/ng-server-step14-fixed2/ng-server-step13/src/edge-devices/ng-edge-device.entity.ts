import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'ng_edge_devices' })
export class NgEdgeDevice {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'circle_id' })
  circleId!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  // Deterministic hash (HMAC-SHA256 with server pepper).
  @Index({ unique: true })
  @Column({ type: 'text', name: 'device_key_hash' })
  deviceKeyHash!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  capabilities!: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt!: Date | null;
}
