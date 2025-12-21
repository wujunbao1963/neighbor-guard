import { MigrationInterface, QueryRunner } from 'typeorm';

export class TopoMapBackup1734658000000 implements MigrationInterface {
  name = 'TopoMapBackup1734658000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ng_topomaps" (
        "topo_map_id" uuid NOT NULL,
        "circle_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "data" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ng_topomaps" PRIMARY KEY ("topo_map_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ng_topomaps_circle_id" ON "ng_topomaps" ("circle_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "ng_topomaps"');
  }
}
