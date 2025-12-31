import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvidenceAccessTickets1738654000000 implements MigrationInterface {
  name = 'EvidenceAccessTickets1738654000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ng_evidence_access_tickets (
        ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL,
        event_id text NOT NULL,
        requester_user_id uuid NOT NULL,
        evidence_key text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_evidence_access_tickets_circle_event
      ON ng_evidence_access_tickets(circle_id, event_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ng_evidence_access_tickets_expires
      ON ng_evidence_access_tickets(expires_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ng_evidence_access_tickets;`);
  }
}
