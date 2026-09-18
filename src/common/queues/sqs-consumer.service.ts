import { DeleteMessageCommand, Message, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "src/notifications/notifications.service";
import { MAX_ATTEMPTS } from "src/common/constants/queue.constants";

@Injectable()
export class SQSConsumerService implements OnModuleInit {
    private readonly logger = new Logger(SQSConsumerService.name);
    private readonly RETRY_DELAY_MS = 5000; // 5 segundos si hay error

    constructor(
        @Inject('SQS_CLIENT') private readonly sqsClient: SQSClient,
        private readonly configService: ConfigService,
        private notificationsService: NotificationsService
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
                    // Necesario para saber cuándo un mensaje agotó sus intentos y debe
                    // marcarse 'failed' (equivalente a job.attemptsMade en BullMQ).
                    MessageSystemAttributeNames: ['ApproximateReceiveCount' as const],
                };

                const result = await this.sqsClient.send(new ReceiveMessageCommand(params));

                if (!result?.Messages?.length) {
                    continue;
                }

                this.logger.log(`Received ${result.Messages.length} message(s) from SQS`);

                const { Messages } = result;

                for (const message of Messages) {
                    // Declarado fuera del try: el catch necesita saber a qué notificación
                    // corresponde el mensaje aunque el fallo ocurra en processMessage().
                    let notificationId: string | undefined;

                    try {
                        const bodyParsed = JSON.parse(message.Body ?? '');
                        notificationId = bodyParsed.data?.id;

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

                        await this.handleFailedAttempt(notificationId, message, queueUrl, error);
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
        await this.notificationsService.processAndSend(notificationId);
    }

    /**
     * Equivalente SQS de NotificationProcessor.onQueueFailed(): si el mensaje
     * ya agotó MAX_ATTEMPTS entregas (ApproximateReceiveCount), da la
     * notificación por fallida y saca el mensaje de la cola. Si todavía le
     * quedan intentos, no hace nada más: se deja el mensaje para que SQS lo
     * reentregue solo tras el VisibilityTimeout, igual que hoy.
     */
    private async handleFailedAttempt(
        notificationId: string | undefined,
        message: Message,
        queueUrl: string,
        error: any,
    ): Promise<void> {
        if (!notificationId) {
            return;
        }

        const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');

        if (receiveCount >= MAX_ATTEMPTS) {
            await this.notificationsService.markAsFailed(notificationId, error.message);
            await this.deleteMessage(message.ReceiptHandle, queueUrl);
            this.logger.warn(
                `Notification ${notificationId} reached max attempts (${receiveCount}/${MAX_ATTEMPTS}), marked as failed and removed from queue`,
            );
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
