import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 4: Align ng_events.explain_summary with contract v1 (ExplainSummary is an object).
 */
export class ExplainSummaryJsonb1734651000000 implements MigrationInterface {
  name = 'ExplainSummaryJsonb1734651000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert text -> jsonb. Existing text values become JSON strings.
    await queryRunner.query(`
      ALTER TABLE ng_events
      ALTER COLUMN explain_summary TYPE jsonb
      USING to_jsonb(explain_summary);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Convert jsonb -> text (JSON stringified).
    await queryRunner.query(`
      ALTER TABLE ng_events
      ALTER COLUMN explain_summary TYPE text
      USING explain_summary::text;
    `);
  }
}
