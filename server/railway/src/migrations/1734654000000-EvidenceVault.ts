import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 7B: Evidence Vault persistence (sessions, items, and event evidence).
 */
export class EvidenceVault1734654000000 implements MigrationInterface {
  name = 'EvidenceVault1734654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_evidence_sessions (
        id uuid PRIMARY KEY,
        circle_id uuid NOT NULL,
        event_id uuid NOT NULL,
        edge_device_id uuid NOT NULL,
        status text NOT NULL,
        evidence_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_evidence_sessions_circle_event
      ON ng_evidence_sessions(circle_id, event_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_evidence_items (
        id uuid PRIMARY KEY,
        session_id uuid NOT NULL REFERENCES ng_evidence_sessions(id) ON DELETE CASCADE,
        sha256 text NOT NULL,
        item_type text NOT NULL,
        content_type text NOT NULL,
        size bigint NOT NULL,
        time_range jsonb NOT NULL,
        device_ref jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ng_evidence_items_session_sha256 UNIQUE(session_id, sha256)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_evidence_items_session
      ON ng_evidence_items(session_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_event_evidence (
        id uuid PRIMARY KEY,
        circle_id uuid NOT NULL,
        event_id uuid NOT NULL,
        session_id uuid NOT NULL,
        evidence_status text NOT NULL,
        completed_at timestamptz NOT NULL,
        archived_at timestamptz NULL,
        manifest jsonb NOT NULL,
        report_package jsonb NOT NULL DEFAULT '{"included":false}'::jsonb,
        warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ng_event_evidence_event UNIQUE(event_id),
        CONSTRAINT uq_ng_event_evidence_session UNIQUE(session_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_event_evidence_circle_event
      ON ng_event_evidence(circle_id, event_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ng_event_evidence;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ng_evidence_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ng_evidence_sessions;`);
  }
}
