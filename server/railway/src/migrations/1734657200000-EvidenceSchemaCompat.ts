import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evidence schema compatibility for persistent DBs.
 *
 * Some early runs created slightly different column names:
 * - ng_evidence_items: `type` vs `item_type`
 * - ng_event_evidence: `status` vs `evidence_status`
 *
 * Because earlier migrations used `CREATE TABLE IF NOT EXISTS`, existing DBs
 * won't be updated. This migration makes the schema compatible for BOTH cases.
 */
export class EvidenceSchemaCompat1734657200000 implements MigrationInterface {
  name = 'EvidenceSchemaCompat1734657200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ng_evidence_items: item_type -> type
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_evidence_items'
            AND column_name = 'item_type'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_evidence_items'
            AND column_name = 'type'
        ) THEN
          ALTER TABLE ng_evidence_items RENAME COLUMN item_type TO type;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_evidence_items'
            AND column_name = 'type'
        ) THEN
          ALTER TABLE ng_evidence_items ADD COLUMN type text NULL;
        END IF;
      END $$;
    `);

    // ng_event_evidence: evidence_status -> status
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_event_evidence'
            AND column_name = 'evidence_status'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_event_evidence'
            AND column_name = 'status'
        ) THEN
          ALTER TABLE ng_event_evidence RENAME COLUMN evidence_status TO status;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ng_event_evidence'
            AND column_name = 'status'
        ) THEN
          ALTER TABLE ng_event_evidence ADD COLUMN status text NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting is intentionally a no-op because renames depend on prior state.
  }
}
