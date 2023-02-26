import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  getManager,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { meilisearchClient } from '../meilisearch';

@Entity()
@Index(['user', 'url', 'host'])
export class Annotation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
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
    setTimeout(async () => {
      await meilisearchClient.IndexAnnotation(annotation);
    });

    const existing = await Annotation.findOne({ id: annotation.id });
    if (existing) {
      Object.assign(existing, annotation);
      await existing.save();
      return;
    }

    await getManager().query(
      `insert into annotation (id, uid, url, title, host, data, "userId", created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [
        annotation.id,
        annotation.uid,
        annotation.url,
        annotation.title,
        annotation.host,
        annotation.data,
        0,
        annotation.created_at,
        annotation.updated_at,
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
}
