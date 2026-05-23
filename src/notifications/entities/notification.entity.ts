import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 200,
    })
    recipient!: string;

    @Column({
        type: 'varchar',
        length: 255,
    })
    subject!: string;

    @Column({
        type: 'text',
    })
    body!: string;

    @Column({
        type: 'varchar',
        length: 20,
        default: 'email',
    })
    channel!: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 10,
        default: 'pending',
    })
    status!: 'pending' | 'sent' | 'failed';

    @Index()
    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}