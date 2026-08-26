import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
@Index('UQ_static_token_token', ['tokenDigest'], { unique: true })
export class StaticToken extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'staticToken', type: 'varchar', length: 64 })
  tokenDigest: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
