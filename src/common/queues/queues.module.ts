import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SQSClient } from '@aws-sdk/client-sqs';
import { BullMQQueueAdapter } from './bull-mqqueue-adapter';
import { SQSQueueAdapter } from './sqs-queue.adapter';
import { IQueue } from './interfaces/queue.interface';

@Module({
    imports: [
        ConfigModule,
        BullModule.registerQueue({ name: 'notifications' }),
    ],
    providers: [
        {
            provide: 'SQS_CLIENT',
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                return new SQSClient({
                    region: configService.get<string>('AWS_REGION') || '',
                    credentials: {
                        accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID') || '',
                        secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
                    },
                    endpoint: configService.get<string>('AWS_ENDPOINT_URL') || '',
                });
            },
        },
        BullMQQueueAdapter,
        SQSQueueAdapter,
        {
            provide: 'QUEUE_ADAPTER',
            inject: [ConfigService, BullMQQueueAdapter, SQSQueueAdapter],
            useFactory: (
                configService: ConfigService,
                bullmq: BullMQQueueAdapter,
                sqs: SQSQueueAdapter,
            ): IQueue => {
                return configService.get<string>('QUEUE_PROVIDER') === 'sqs' ? sqs : bullmq;
            },
        },
    ],
    exports: ['SQS_CLIENT', 'QUEUE_ADAPTER', BullModule],
})
export class QueuesModule { }