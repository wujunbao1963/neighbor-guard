import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10.5 hotfix: align `ng_evidence_items` with the persistent Railway schema.
 *
 * The shared Railway Postgres (used across steps) has a more normalized evidence
 * item schema (time_range_start_at, device_ref_kind, object_key, etc.).
 * Earlier steps created only JSONB columns.
 *
 * To keep BOTH fresh DBs and persistent DBs working, we add the normalized
 * columns if missing (as NULL-able columns).
 */
export class EvidenceItemsNormalizedColumns1734657500000
  implements MigrationInterface
{
  name = 'EvidenceItemsNormalizedColumns1734657500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'ng_evidence_items'
        ) THEN
          ALTER TABLE ng_evidence_items
            ADD COLUMN IF NOT EXISTS circle_id uuid NULL,
            ADD COLUMN IF NOT EXISTS event_id uuid NULL,
            ADD COLUMN IF NOT EXISTS time_range_start_at timestamptz NULL,
            ADD COLUMN IF NOT EXISTS time_range_end_at timestamptz NULL,
            ADD COLUMN IF NOT EXISTS device_ref_kind text NULL,
            ADD COLUMN IF NOT EXISTS device_ref_id text NULL,
            ADD COLUMN IF NOT EXISTS device_ref_display_name text NULL,
            ADD COLUMN IF NOT EXISTS object_key text NULL;
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op: don't drop columns in shared DBs
  }
}
