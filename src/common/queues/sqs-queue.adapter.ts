import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { IQueue } from './interfaces/queue.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SQSQueueAdapter extends IQueue {
    constructor(
        @Inject('SQS_CLIENT') private readonly sqsClient: SQSClient,
        private readonly configService: ConfigService,
    ) {
        super();
    }

    async add(jobName: string, data: any): Promise<{ id: string }> {
        const params = {
            QueueUrl: this.configService.get<string>('SQS_QUEUE_URL'),
            MessageBody: JSON.stringify({ jobName, data }),
        };

        const result = await this.sqsClient.send(new SendMessageCommand(params));

        if (!result?.MessageId) {
            throw new InternalServerErrorException('Failed to send message to SQS');
        }

        return { id: result.MessageId };
    }
}