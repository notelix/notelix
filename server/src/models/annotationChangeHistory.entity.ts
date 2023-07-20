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
import {User} from './user.entity';

export const AnnotationChangeHistoryKindSave = 1;
export const AnnotationChangeHistoryKindDelete = 2;

@Entity()
@Index(['user'])
export class AnnotationChangeHistory extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({type: 'int'})
    kind: number;

    @Column({type: 'int'})
    annotationId: number;

    @Column({type: 'varchar', length: 64})
    uid: string;

    @Column({type: 'json'})
    data: any;

    @ManyToOne(() => User, (user) => user.annotations)
    user: User;

    @CreateDateColumn({name: 'created_at'})
    created_at: Date;

    @UpdateDateColumn({name: 'updated_at'})
    updated_at: Date;

    public static async getLatestIdForUser(user: User) {
        const latestAnnotationChangeHistory = (
            await AnnotationChangeHistory.getRepository()
                .createQueryBuilder()
                .where({user})
                .select('MAX(id)', 'max')
                .getRawOne()
        ).max;
        if (!latestAnnotationChangeHistory) {
            return 0;
        }
        return latestAnnotationChangeHistory;
    }
}
