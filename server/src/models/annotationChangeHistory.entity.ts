import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  EntityManager,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export const AnnotationChangeHistoryKindSave = 1;
export const AnnotationChangeHistoryKindDelete = 2;

@Entity()
@Index('IDX_history_user_id', ['user', 'id'])
export class AnnotationChangeHistory extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  kind: number;

  @Column({ type: 'int' })
  annotationId: number;

  @Column({ type: 'varchar', length: 64 })
  uid: string;

  @Column({ type: 'json' })
  data: any;

  @ManyToOne(() => User, (user) => user.annotations)
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  public static async getLatestIdForUser(
    user: User,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager
      ? manager.getRepository(AnnotationChangeHistory)
      : AnnotationChangeHistory.getRepository();
    const result = await repository
      .createQueryBuilder('history')
      .where('history."userId" = :userId', { userId: user.id })
      .select('MAX(history.id)', 'max')
      .getRawOne<{ max: string | null }>();
    if (!result?.max) {
      return 0;
    }
    return Number(result.max);
  }
}
