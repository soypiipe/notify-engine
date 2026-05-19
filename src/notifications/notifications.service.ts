import { Injectable, Logger } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private notifications: Map<string, Notification> = new Map();

    create(createNotificationDto: CreateNotificationDto): Notification {
        const id = Math.random().toString(36).substring(7);
        const notification: Notification = {
            id,
            recipient: createNotificationDto.recipient,
            subject: createNotificationDto.subject,
            body: createNotificationDto.body,
            channel: createNotificationDto.channel || 'email',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.notifications.set(id, notification);
        this.logger.log(`Notification created: ${id}`);

        return notification;
    }

    findOne(id: string): Notification | null {
        return this.notifications.get(id) || null;
    }

    findAll(): Notification[] {
        return Array.from(this.notifications.values());
    }
}