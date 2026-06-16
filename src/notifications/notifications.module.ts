import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationProcessor } from './notifications.processor';
import { QueuesModule } from 'src/common/queues/queues.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification]),
        QueuesModule,
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationProcessor],
    exports: [NotificationsService],
})
export class NotificationsModule {}
