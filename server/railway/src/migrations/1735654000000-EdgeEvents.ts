import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 2: create authoritative edge events snapshot table (v7.7+).
 */
export class EdgeEvents1735654000000 implements MigrationInterface {
  name = 'EdgeEvents1735654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_edge_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        edge_instance_id text NOT NULL,
        threat_state text NOT NULL,
        trigger_reason text NULL,
        edge_updated_at timestamptz NOT NULL,
        last_sequence bigint NOT NULL DEFAULT 0,
        summary_json jsonb NOT NULL,
        last_upsert_received_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ng_edge_events_circle_event UNIQUE (circle_id, event_id)
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_edge_events_circle_updated ON ng_edge_events (circle_id, edge_updated_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_edge_events_circle_state_updated ON ng_edge_events (circle_id, threat_state, edge_updated_at);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ng_edge_events');
  }
}
