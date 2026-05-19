export class Notification {
    id!: string;
    recipient!: string;
    subject!: string;
    body!: string;
    channel!: string;
    status!: 'pending' | 'sent' | 'failed';
    createdAt!: Date;
    updatedAt!: Date;
}