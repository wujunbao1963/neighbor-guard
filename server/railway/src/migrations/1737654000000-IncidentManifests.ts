import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentManifests1737654000000 implements MigrationInterface {
  name = 'IncidentManifests1737654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 4: add message_type column to ingest audit for cross-message auditing.
    await queryRunner.query(
      `ALTER TABLE ng_edge_ingest_audit ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'event_summary_upsert'`,
    );

    // Raw landing table for manifests.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_incident_manifests_raw (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        edge_instance_id text NOT NULL,
        edge_updated_at timestamptz NOT NULL,
        sequence bigint NOT NULL DEFAULT 0,
        payload jsonb NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_incident_manifests_raw_circle_event_received ON ng_incident_manifests_raw (circle_id, event_id, received_at DESC)`,
    );

    // Authoritative manifest snapshot.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_incident_manifests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        edge_instance_id text NOT NULL,
        edge_updated_at timestamptz NOT NULL,
        last_sequence bigint NOT NULL DEFAULT 0,
        last_payload_hash text,
        manifest_json jsonb NOT NULL,
        last_upsert_received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_ng_incident_manifests_circle_event ON ng_incident_manifests (circle_id, event_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ng_incident_manifests_circle_updated ON ng_incident_manifests (circle_id, edge_updated_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ng_incident_manifests_raw`);
    await queryRunner.query(`DROP TABLE IF EXISTS ng_incident_manifests`);
    // Keep message_type column; safe down would remove but could break earlier versions.
  }
}
