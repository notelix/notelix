import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Annotation } from './annotation.entity';

@Entity()
@Index('UQ_user_name', ['name'], { unique: true })
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  password: string;

  @Column({ length: 4096 })
  client_side_encryption: string;

  @Column({ name: 'token_version', type: 'integer', default: 0 })
  tokenVersion: number;

  @OneToMany(() => Annotation, (annotation) => annotation.user)
  annotations: Annotation[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
