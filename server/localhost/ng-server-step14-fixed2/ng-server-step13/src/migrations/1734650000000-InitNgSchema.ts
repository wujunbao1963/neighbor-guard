import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 1 baseline schema.
 *
 * Notes:
 * - Table names are prefixed with `ng_` to avoid collisions in a shared DB.
 * - We keep many event details in jsonb (`raw_event`) so later contract tweaks
 *   do not force immediate DB migrations.
 */
export class InitNgSchema1734650000000 implements MigrationInterface {
  name = 'InitNgSchema1734650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_edge_devices (
        id uuid PRIMARY KEY,
        circle_id uuid NOT NULL,
        name text NULL,
        device_key_hash text NOT NULL,
        capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz NULL,
        last_seen_at timestamptz NULL
      );
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS ng_edge_devices_device_key_hash_uq ON ng_edge_devices(device_key_hash);',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_edge_devices_circle_id_idx ON ng_edge_devices(circle_id);',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_events (
        event_id uuid PRIMARY KEY,
        circle_id uuid NOT NULL,
        edge_device_id uuid NOT NULL REFERENCES ng_edge_devices(id) ON DELETE RESTRICT,

        title text NOT NULL,
        description text NULL,
        event_type text NOT NULL,
        severity text NOT NULL,
        notification_level text NOT NULL,
        status text NOT NULL,

        occurred_at timestamptz NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),

        explain_summary text NOT NULL,
        alarm_state text NULL,
        zones_visited jsonb NULL,
        key_signals jsonb NULL,

        raw_event jsonb NOT NULL
      );
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_events_circle_received_at_idx ON ng_events(circle_id, received_at DESC);',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_events_edge_device_id_idx ON ng_events(edge_device_id);',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_event_idempotency (
        id bigserial PRIMARY KEY,
        edge_device_id uuid NOT NULL REFERENCES ng_edge_devices(id) ON DELETE CASCADE,
        idempotency_key text NOT NULL,
        event_id uuid NOT NULL REFERENCES ng_events(event_id) ON DELETE CASCADE,
        payload_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS ng_event_idempotency_device_key_uq ON ng_event_idempotency(edge_device_id, idempotency_key);',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_event_idempotency_event_id_idx ON ng_event_idempotency(event_id);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order.
    await queryRunner.query('DROP TABLE IF EXISTS ng_event_idempotency;');
    await queryRunner.query('DROP TABLE IF EXISTS ng_events;');
    await queryRunner.query('DROP TABLE IF EXISTS ng_edge_devices;');
  }
}
