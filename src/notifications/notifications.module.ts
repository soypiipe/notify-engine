import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './entities/notification.entity';
import { NotificationProcessor } from './notifications.processor';
import { QueuesModule } from 'src/common/queues/queues.module';
import { BullModule } from '@nestjs/bullmq';
import { ClassifierService } from './classifier.service';
import { ChannelsModule } from 'src/common/channels/channels.module';
import { SQSConsumerService } from 'src/common/queues/sqs-consumer.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification]),
        BullModule.registerQueue({ name: 'notifications' }),
        QueuesModule,
        ChannelsModule,
    ],
    controllers: [NotificationsController],
    providers: [
        NotificationsService,
        NotificationProcessor,
        SQSConsumerService,
        ClassifierService
    ],
    exports: [NotificationsService],
})
export class NotificationsModule { }