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

// Misma decisión, misma fuente (process.env, ya poblado por el
// `import 'dotenv/config'` en main.ts) que en queues.module.ts.
const isSqsProvider = process.env.QUEUE_PROVIDER === 'sqs';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification]),
        // Igual que en QueuesModule: sin esto, en modo SQS no hay ninguna
        // conexión a Redis abierta por NotificationsModule.
        ...(isSqsProvider ? [] : [BullModule.registerQueue({ name: 'notifications' })]),
        QueuesModule,
        ChannelsModule,
    ],
    controllers: [NotificationsController],
    providers: [
        NotificationsService,
        // El Worker de BullMQ (WorkerHost) abre su propia conexión a Redis y
        // hace polling en cuanto Nest lo instancia, sin importar lo que haga
        // en process(). La única forma de que no dependa de Redis en modo
        // SQS es que Nest nunca lo instancie.
        ...(isSqsProvider ? [] : [NotificationProcessor]),
        SQSConsumerService,
        ClassifierService
    ],
    exports: [NotificationsService],
})
export class NotificationsModule { }
