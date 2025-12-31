import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ng_circles' })
export class NgCircle {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
