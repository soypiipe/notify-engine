import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notification } from "../../notifications/entities/notification.entity";

@Injectable()
export class SQSConsumerService implements OnModuleInit {
    private readonly logger = new Logger(SQSConsumerService.name);
    private readonly RETRY_DELAY_MS = 5000; // 5 segundos si hay error

    constructor(
        @Inject('SQS_CLIENT') private readonly sqsClient: SQSClient,
        private readonly configService: ConfigService,
        @InjectRepository(Notification) private readonly notificationRepository: Repository<Notification>,
    ) { }

    onModuleInit() {
        this.logger.log('SQS Consumer started');
        const provider = this.configService.get<string>('QUEUE_PROVIDER')

        if(provider == 'sqs'){
            this.startPolling();
        }
    }

    private async startPolling() {
        while (true) {
            try {
                const queueUrl = this.configService.get<string>('SQS_QUEUE_URL');

                if (!queueUrl) {
                    this.logger.error('SQS_QUEUE_URL not configured in environment');
                    return;
                }

                const params = {
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: 10,
                    WaitTimeSeconds: 20,
                };

                const result = await this.sqsClient.send(new ReceiveMessageCommand(params));

                if (!result?.Messages?.length) {
                    continue;
                }

                this.logger.log(`Received ${result.Messages.length} message(s) from SQS`);

                const { Messages } = result;

                for (const message of Messages) {
                    try {
                        const bodyParsed = JSON.parse(message.Body ?? '');
                        const notificationId = bodyParsed.data?.id;

                        if (!notificationId) {
                            this.logger.warn(`Invalid notification ID, discarding`, {
                                messageId: message.MessageId,
                            });
                            await this.deleteMessage(message.ReceiptHandle, queueUrl);
                            continue;
                        }

                        this.logger.log(`Processing notification: ${notificationId}`);

                        await this.processMessage(notificationId);

                        await this.deleteMessage(message.ReceiptHandle, queueUrl);

                        this.logger.log(`Notification completed: ${notificationId}`);

                    } catch (error: any) {
                        this.logger.error(
                            `Error processing message: ${error.message}`,
                            {
                                messageId: message.MessageId,
                                errorStack: error.stack,
                            }
                        );
                    }
                }

            } catch (error: any) {
                this.logger.error(
                    `SQS polling error: ${error.message}`,
                    {
                        errorStack: error.stack,
                    }
                );
                this.logger.log(`Retrying in ${this.RETRY_DELAY_MS / 1000}s...`);
                await this.delay(this.RETRY_DELAY_MS);
            }
        }
    }

    private async processMessage(notificationId: string): Promise<void> {
        try {
            const result = await this.notificationRepository.update(
                notificationId,
                { status: 'sent' }
            );

            if (result.affected === 0) {
                this.logger.warn(`Notification not found in database: ${notificationId}`);
            }
        } catch (error: any) {
            throw new Error(`Failed to update status in database: ${error.message}`);
        }
    }

    private async deleteMessage(receiptHandle: string | undefined, queueUrl: string): Promise<void> {
        if (!receiptHandle) {
            this.logger.warn('Empty ReceiptHandle, unable to delete message');
            return;
        }

        try {
            await this.sqsClient.send(
                new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: receiptHandle,
                })
            );
        } catch (error: any) {
            this.logger.error(
                `Error deleting message from SQS: ${error.message}`,
                {
                    errorStack: error.stack,
                }
            );
        }
    }

    // Utilidad para esperar
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}