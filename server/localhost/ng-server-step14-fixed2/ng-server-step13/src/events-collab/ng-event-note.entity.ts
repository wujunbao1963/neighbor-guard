import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ng_event_notes' })
export class NgEventNote {
  @PrimaryColumn({ name: 'note_id', type: 'uuid' })
  noteId!: string;

  @Index()
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'circle_id', type: 'uuid' })
  circleId!: string;

  @Column({ name: 'client_note_id', type: 'uuid', nullable: true })
  clientNoteId!: string | null;

  @Column({ name: 'text', type: 'text' })
  text!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;
}
