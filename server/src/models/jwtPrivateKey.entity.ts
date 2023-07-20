import {BaseEntity, Column, Entity, PrimaryGeneratedColumn,} from 'typeorm';

@Entity()
export class JwtPrivateKey extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({type: 'varchar', length: 4096})
    privateKey: string;

    @Column({type: 'varchar', length: 4096})
    publicKey: string;
}
