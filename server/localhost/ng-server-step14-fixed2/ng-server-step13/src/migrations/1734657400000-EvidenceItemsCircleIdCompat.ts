import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10.4 hotfix:
 * Align ng_evidence_items for persistent Railway DBs.
 *
 * We have seen the following variants in the wild:
 * - ng_evidence_items includes circle_id uuid NOT NULL
 * - ng_evidence_items was created earlier without circle_id
 *
 * This migration safely adds missing columns with IF NOT EXISTS.
 */
export class EvidenceItemsCircleIdCompat1734657400000
  implements MigrationInterface
{
  name = 'EvidenceItemsCircleIdCompat1734657400000';

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
            ADD COLUMN IF NOT EXISTS circle_id uuid NULL;

          CREATE INDEX IF NOT EXISTS idx_ng_evidence_items_circle
          ON ng_evidence_items(circle_id);
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op (don't drop columns/indexes in shared DBs)
  }
}
