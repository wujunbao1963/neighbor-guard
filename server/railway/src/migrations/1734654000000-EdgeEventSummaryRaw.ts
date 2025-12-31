import { MigrationInterface, QueryRunner } from 'typeorm';

export class EdgeEventSummaryRaw1734654000000 implements MigrationInterface {
  name = 'EdgeEventSummaryRaw1734654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_edge_event_summaries_raw (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        edge_instance_id text NOT NULL,
        threat_state text NOT NULL,
        edge_updated_at timestamptz NOT NULL,
        payload jsonb NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_edge_event_summaries_raw_circle ON ng_edge_event_summaries_raw(circle_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_edge_event_summaries_raw_event ON ng_edge_event_summaries_raw(circle_id, event_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ng_edge_event_summaries_raw;');
  }
}
