import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvidenceDownloadAudit1739654000000 implements MigrationInterface {
  name = 'EvidenceDownloadAudit1739654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_evidence_download_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL,
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        requester_user_id uuid NOT NULL,
        evidence_key text NOT NULL,
        requested_range text NULL,
        upstream_status int NOT NULL,
        bytes_sent bigint NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_evidence_dl_audit_circle_event ON ng_evidence_download_audit(circle_id, event_id, created_at DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_evidence_dl_audit_ticket ON ng_evidence_download_audit(ticket_id, created_at DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ng_evidence_download_audit');
  }
}
