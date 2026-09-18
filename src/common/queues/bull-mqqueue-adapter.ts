import { Injectable } from '@nestjs/common';
import { IQueue } from './interfaces/queue.interface';
import { InjectQueue } from '@nestjs/bullmq';
import * as Bullmq from 'bullmq';
import { MAX_ATTEMPTS } from 'src/common/constants/queue.constants';

@Injectable()
export class BullMQQueueAdapter extends IQueue {
    constructor(@InjectQueue('notifications') private readonly notificationQueue: Bullmq.Queue) {
        super();
    }

    async add(jobName: string, data: any): Promise<{ id: string }> {
        const jobNotification = await this.notificationQueue.add(`${jobName}`, {
            id: data.id
        }, {
            attempts: MAX_ATTEMPTS,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
            removeOnFail: false,
        });

        if (!jobNotification) throw new Error('Job creation failed');

        return { id: jobNotification.id || '' };
    }
}
