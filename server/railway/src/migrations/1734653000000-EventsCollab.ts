import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 6: Collaboration primitives.
 *
 * Adds:
 * - ng_events.updated_at (server-side last modification time)
 * - ng_events.acked_at / resolved_at (derived from status transitions)
 * - ng_event_notes (human/system notes)
 * - ng_event_status_idempotency (clientRequestId idempotency for status updates)
 */
export class EventsCollab1734653000000 implements MigrationInterface {
  name = 'EventsCollab1734653000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ng_events
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS acked_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS resolved_at timestamptz NULL;
    `);

    // Best-effort backfill to keep the new updated_at sensible for existing rows.
    await queryRunner.query(`
      UPDATE ng_events
      SET updated_at = received_at
      WHERE updated_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_event_notes (
        note_id uuid PRIMARY KEY,
        event_id uuid NOT NULL REFERENCES ng_events(event_id) ON DELETE CASCADE,
        circle_id uuid NOT NULL,
        client_note_id uuid NULL,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by_id uuid NULL
      );
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_event_notes_event_id_created_at_idx ON ng_event_notes(event_id, created_at ASC);',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_event_notes_circle_id_idx ON ng_event_notes(circle_id);',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ng_event_notes_event_client_note_uq
       ON ng_event_notes(event_id, client_note_id)
       WHERE client_note_id IS NOT NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_event_status_idempotency (
        id bigserial PRIMARY KEY,
        event_id uuid NOT NULL REFERENCES ng_events(event_id) ON DELETE CASCADE,
        client_request_id uuid NOT NULL,
        payload_hash text NOT NULL,
        status text NOT NULL,
        updated_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS ng_event_status_idem_event_client_uq ON ng_event_status_idempotency(event_id, client_request_id);',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_event_status_idem_event_id_idx ON ng_event_status_idempotency(event_id);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ng_event_status_idempotency;');
    await queryRunner.query('DROP TABLE IF EXISTS ng_event_notes;');

    // Drop columns individually to keep compatibility across Postgres versions.
    await queryRunner.query('ALTER TABLE ng_events DROP COLUMN IF EXISTS resolved_at;');
    await queryRunner.query('ALTER TABLE ng_events DROP COLUMN IF EXISTS acked_at;');
    await queryRunner.query('ALTER TABLE ng_events DROP COLUMN IF EXISTS updated_at;');
  }
}
