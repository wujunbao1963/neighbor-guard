import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 9 hotfix: In some earlier runs, `ng_evidence_sessions` was created without
 * the `evidence_id` column. Because the migration was already marked as executed
 * on the target DB, editing the original migration won't fix existing databases.
 */
export class EvidenceSessionEvidenceId1734656000000 implements MigrationInterface {
  name = 'EvidenceSessionEvidenceId1734656000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ng_evidence_sessions
      ADD COLUMN IF NOT EXISTS evidence_id uuid NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ng_evidence_sessions
      DROP COLUMN IF EXISTS evidence_id;
    `);
  }
}
