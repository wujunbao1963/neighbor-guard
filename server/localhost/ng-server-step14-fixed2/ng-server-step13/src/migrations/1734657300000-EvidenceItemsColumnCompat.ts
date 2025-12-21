import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10.3 hotfix: Align persistent DB schemas for ng_evidence_items.
 *
 * Some early runs created `ng_evidence_items` without optional columns like
 * `time_range` (jsonb). TypeORM will SELECT those columns if they are mapped
 * in the entity.
 *
 * This migration safely adds any missing columns using `IF NOT EXISTS`.
 */
export class EvidenceItemsColumnCompat1734657300000
  implements MigrationInterface
{
  name = 'EvidenceItemsColumnCompat1734657300000';

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
            ADD COLUMN IF NOT EXISTS content_type text NULL,
            ADD COLUMN IF NOT EXISTS size bigint NULL,
            ADD COLUMN IF NOT EXISTS time_range jsonb NULL,
            ADD COLUMN IF NOT EXISTS device_ref jsonb NULL;
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: we don't want to drop columns in shared DBs.
  }
}
