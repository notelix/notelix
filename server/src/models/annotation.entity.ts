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

@Entity()
@Index(['user', 'url', 'host'])
@Index('UQ_annotation_user_uid', ['user', 'uid'], { unique: true })
export class Annotation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  uid: string;

  @Column({ type: 'varchar', length: 32768 })
  url: string;

  @Column({ type: 'varchar', length: 32768, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 32768, default: '' })
  host: string;

  @Column({ type: 'json' })
  data: any;

  @ManyToOne(() => User, (user) => user.annotations, {
    createForeignKeyConstraints: false,
  })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // typeorm bug?.. if we just called save() to insert a record, value of `.id` is ignored, and id was set to auto-increment
  static async agentSyncPersist(annotation) {
    const persistedAnnotation = {
      id: annotation.id,
      uid: annotation.uid,
      url: annotation.url,
      title: annotation.title,
      host: annotation.host,
      data: annotation.data,
      created_at: annotation.created_at,
      updated_at: annotation.updated_at,
    };
    const existing = await Annotation.findOne({
      where: { id: persistedAnnotation.id },
    });
    if (existing) {
      Object.assign(existing, persistedAnnotation);
      await existing.save();
      return;
    }

    await Annotation.getRepository().query(
      `insert into annotation (id, uid, url, title, host, data, "userId", created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [
        persistedAnnotation.id,
        persistedAnnotation.uid,
        persistedAnnotation.url,
        persistedAnnotation.title,
        persistedAnnotation.host,
        persistedAnnotation.data,
        0,
        persistedAnnotation.created_at,
        persistedAnnotation.updated_at,
      ],
    );
  }

  static Neat(annotation: Annotation) {
    return {
      id: annotation.id,
      uid: annotation.uid,
      url: annotation.url,
      host: annotation.host,
      title: annotation.title,
      data: annotation.data,
    };
  }

  static SyncSnapshot(annotation: Annotation) {
    return {
      ...Annotation.Neat(annotation),
      created_at: annotation.created_at,
      updated_at: annotation.updated_at,
    };
  }
}
