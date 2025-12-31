import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 5: Improve list performance for GET /events by indexing (circle_id, occurred_at, event_id).
 */
export class EventsOccuredAtIndex1734652000000 implements MigrationInterface {
  name = 'EventsOccuredAtIndex1734652000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ng_events_circle_occurred_event_idx ON ng_events(circle_id, occurred_at DESC, event_id DESC);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ng_events_circle_occurred_event_idx;');
  }
}
