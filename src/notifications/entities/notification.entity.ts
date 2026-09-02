import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { RecipientType } from 'src/common/channels/interfaces/recipient-type';

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
    channel!: RecipientType;

    @Index()
    @Column({
        type: 'varchar',
        length: 10,
        default: 'pending',
    })
    status!: 'pending' | 'sent' | 'failed';

    @Column({ nullable: true })
    externalMessageId?: string;

    @Index()
    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}