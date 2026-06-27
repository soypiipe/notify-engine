import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationProcessor } from './notifications.processor';
import { QueuesModule } from 'src/common/queues/queues.module';
import { ChannelsModule } from 'src/common/channels/channels.module';
import { ClassifierService } from './classifier.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification]),
        QueuesModule,
        ChannelsModule,
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationProcessor, ClassifierService],
    exports: [NotificationsService],
})
export class NotificationsModule {}
