import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './entities/notification.entity';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProcessor } from './notifications.processor';

@Module({
    imports: [TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({
        name: 'notifications'
    })],
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationProcessor],
    exports: [NotificationsService],
})
export class NotificationsModule { }