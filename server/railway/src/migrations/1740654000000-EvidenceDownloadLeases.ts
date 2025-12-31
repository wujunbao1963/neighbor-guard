import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvidenceDownloadLeases1740654000000 implements MigrationInterface {
  name = 'EvidenceDownloadLeases1740654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_evidence_download_leases (
        lease_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL,
        requester_user_id uuid NOT NULL,
        lease_type text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ng_evidence_download_leases_ticket_type
        ON ng_evidence_download_leases(ticket_id, lease_type);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_evidence_download_leases_expires
        ON ng_evidence_download_leases(expires_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ng_evidence_download_leases;`);
  }
}
