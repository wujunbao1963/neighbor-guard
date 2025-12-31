import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ng_circle_members' })
@Index(['circleId', 'userId'], { unique: true })
export class NgCircleMember {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'uuid', name: 'circle_id' })
  circleId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ name: 'role', type: 'text' })
  role!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
