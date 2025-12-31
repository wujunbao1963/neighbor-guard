import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10 hotfix: Some persistent DBs already have `manifest_hash` (often NOT NULL)
 * on `ng_evidence_sessions`. Older migrations created the table without it using
 * `CREATE TABLE IF NOT EXISTS`, which doesn't update existing schemas.
 *
 * This migration makes sure the column exists for fresh databases.
 */
export class EvidenceSessionManifestHash1734657000000
  implements MigrationInterface
{
  name = 'EvidenceSessionManifestHash1734657000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ng_evidence_sessions
      ADD COLUMN IF NOT EXISTS manifest_hash text NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ng_evidence_sessions
      DROP COLUMN IF EXISTS manifest_hash;
    `);
  }
}
