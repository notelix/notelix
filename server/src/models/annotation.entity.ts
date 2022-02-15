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

@Entity()
@Index(['user', 'url'])
export class Annotation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  uid: string;

  @Column({ type: 'varchar', length: 512 })
  url: string;

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
  static async persist(data) {
    const existing = await Annotation.findOne({ id: data.id });
    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      return;
    }

    await getManager().query(
      `insert into annotation (id, uid, url, data, "userId", created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7);`,
      [
        data.id,
        data.uid,
        data.url,
        data.data,
        0,
        data.created_at,
        data.updated_at,
      ],
    );
  }
}
