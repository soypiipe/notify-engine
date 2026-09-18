import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SQSClient } from '@aws-sdk/client-sqs';
import { BullMQQueueAdapter } from './bull-mqqueue-adapter';
import { SQSQueueAdapter } from './sqs-queue.adapter';

// Leído directamente de process.env (no vía ConfigService): esta decisión se
// toma en tiempo de definición del módulo, antes de que ConfigModule termine
// de inicializarse. main.ts hace `import 'dotenv/config'` como primer import
// para garantizar que process.env ya esté poblado en este punto.
const isSqsProvider = process.env.QUEUE_PROVIDER === 'sqs';

@Module({
    imports: [
        ConfigModule,
        // Solo se registra la cola de BullMQ (y por lo tanto solo se abre
        // conexión a Redis) cuando ese es el provider activo.
        ...(isSqsProvider ? [] : [BullModule.registerQueue({ name: 'notifications' })]),
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
        // Solo se registra (y por lo tanto solo se instancia) el adapter del
        // provider activo — el otro nunca se construye, así que su
        // dependencia (p.ej. @InjectQueue en BullMQQueueAdapter) tampoco se
        // resuelve cuando no aplica.
        ...(isSqsProvider ? [SQSQueueAdapter] : [BullMQQueueAdapter]),
        {
            provide: 'QUEUE_ADAPTER',
            useExisting: isSqsProvider ? SQSQueueAdapter : BullMQQueueAdapter,
        },
    ],
    exports: [
        'SQS_CLIENT',
        'QUEUE_ADAPTER',
        ...(isSqsProvider ? [] : [BullModule]),
    ],
})
export class QueuesModule { }
