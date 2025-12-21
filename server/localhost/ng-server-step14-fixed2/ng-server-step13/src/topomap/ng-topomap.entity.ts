import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ng_topomaps' })
export class NgTopoMap {
  @PrimaryColumn('uuid')
  topo_map_id!: string;

  @Column('uuid')
  circle_id!: string;

  @Column('int')
  version!: number;

  @Column({ type: 'jsonb' })
  data!: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
