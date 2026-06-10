import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { BullMQQueueAdapter } from 'src/common/queues/bull-mqqueue-adapter';

@Injectable()
export class NotificationsService{
    private readonly logger = new Logger(NotificationsService.name);
    private readonly tracer = trace.getTracer('notify-engine');


    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @InjectQueue('notifications') private readonly notificationQueue: Queue,
        private readonly queue: BullMQQueueAdapter
    ){}

    async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
        const span = this.tracer.startSpan('notification.create');

        try {
            const notification = this.notificationRepository.create({
                recipient: createNotificationDto.recipient,
                subject: createNotificationDto.subject,
                body: createNotificationDto.body,
                channel: createNotificationDto.channel || 'email',
                status: 'pending'
            });

            const saved = await this.notificationRepository.save(notification);

            const jobNotification = await this.queue.add('notification-process', { id: saved.id });

            this.logger.log(`Notification created: ${saved.id}`);
            this.logger.log(`Job Id: ${jobNotification.id}`);

            return saved;
        } catch (error: any) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
            });
            span.recordException(error);
            throw error;
        } finally {
            span.end();
        }
    }

    async findOne(id: string): Promise<Notification> {
        const notification = await this.notificationRepository.findOne({ where: {id}  });
        if(!notification) {
            throw new NotFoundException(`Notification with ID ${id} not found`)
        }

        return notification
    }

    async findAll(): Promise<Notification[]> {
        return await this.notificationRepository.find();
    }

    async updateStatus(id: string, status: 'sent' | 'failed'){
        await this.notificationRepository.update(id, { status })
    }

    async getDLQJobs() {
        const dlqJobs = await this.notificationQueue.getFailed();

        const dlqJobsData = dlqJobs.map(job => ({
            jobId: job.id,
            notificationId: job.data?.id,
            recipient: job.data?.recipient,
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts,
            failedReason: job.failedReason,
            createdAt: new Date(job.timestamp),
        }));

        return {
            totalFailed: dlqJobs.length,
            jobs: dlqJobsData,
        };
    }

    async retryDLQJob(jobId: string) {
        const job = await this.notificationQueue.getJob(jobId);

        if (!job) {
            throw new NotFoundException(`Job with ID ${jobId} does not exist`);
        }

        const status = await job.getState();
        if (status !== 'failed') {
            throw new BadRequestException(
                `Job ${jobId} cannot be retried because it is in state: ${status}`
            );
        }

        const notificationId = job.data?.id;

        await job.retry();

        this.logger.log(`Job ${job.id} retried for notification ${notificationId}`);

        return {
            success: true,
            jobId: job.id,
            notificationId,
            message: `Job ${job.id} has been re-queued for processing`,
        };
    }
}