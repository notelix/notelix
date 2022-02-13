import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

const AnnotationChangeHistoryKindSave = 1;
const AnnotationChangeHistoryKindDelete = 2;

@Entity()
@Index(['user'])
export class AnnotationChangeHistory extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  kind: number;

  @Column({ type: 'int' })
  annotationId: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  uid: string;

  @Column({ type: 'json' })
  data: any;

  @ManyToOne(() => User, (user) => user.annotations)
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  public static async getLatestIdForUser(user: User) {
    return (
      await AnnotationChangeHistory.getRepository()
        .createQueryBuilder()
        .where({ user: user })
        .orderBy('id', 'DESC')
        .select(['id'])
        .getRawOne()
    ).id;
  }
}
