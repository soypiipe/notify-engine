import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { InjectQueue } from '@nestjs/bullmq';
import * as Bullmq from 'bullmq';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { IQueue } from 'src/common/queues/interfaces/queue.interface';
import { ClassifierService } from './classifier.service';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly tracer = trace.getTracer('notify-engine');

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @Inject('QUEUE_ADAPTER') private readonly queue: IQueue,
        private readonly classifierService: ClassifierService,
        @Optional() @InjectQueue('notifications') private readonly notificationQueue?: Bullmq.Queue,
    ) {}

    async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
        const span = this.tracer.startSpan('notification.create');

        try {
            const notification = this.notificationRepository.create({
                recipient: createNotificationDto.recipient,
                subject: createNotificationDto.subject,
                body: createNotificationDto.body,
                channel: createNotificationDto.channel || 'email',
                status: 'pending',
            });

            const saved = await this.notificationRepository.save(notification);

            const jobNotification = await this.queue.add('notification-process', { id: saved.id });

            this.logger.log(`Notification created: ${saved.id}`);
            this.logger.log(`Job Id: ${jobNotification.id}`);

            return saved;
        } catch (error: any) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            span.recordException(error);
            throw error;
        } finally {
            span.end();
        }
    }

    async findOne(id: string): Promise<Notification> {
        const notification = await this.notificationRepository.findOne({ where: { id } });
        if (!notification) {
            throw new NotFoundException(`Notification with ID ${id} not found`);
        }
        return notification;
    }

    async findAll(): Promise<Notification[]> {
        return await this.notificationRepository.find();
    }

    async updateStatus(id: string, status: 'sent' | 'failed', externalMessageId?: string) {
        await this.notificationRepository.update(id, {
            status,
            ...(externalMessageId && { externalMessageId }),
        });
    }

    async processAndSend(id: string){
        const span = this.tracer.startSpan('notification.process');
        try {
            const notification = await this.findOne(id);
            const channel = this.classifierService.getChannelByType(notification.channel);

            const result = await channel.send(
                notification.recipient, 
                notification.subject, 
                notification.body);
            
            if (!result.success) {
                throw new Error(result.error || 'Unknown channel error');
            }

            await this.updateStatus(id, 'sent', result.externalId);

            this.logger.log(`Notification ${id} sent successfully via ${notification.channel}`);

            return { status: 'sent', externalId: result.externalId };


        } catch (error: any) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
            });
            span.recordException(error);
            throw error; // BullMQ maneja el reintento
        } finally {
            span.end();
        }
        
    }

    async getDLQJobs() {
        if (!this.notificationQueue) {
            throw new BadRequestException('DLQ management is only available with the BullMQ provider');
        }

        const dlqJobs = await this.notificationQueue.getFailed();

        return {
            totalFailed: dlqJobs.length,
            jobs: dlqJobs.map(job => ({
                jobId: job.id,
                notificationId: job.data?.id,
                recipient: job.data?.recipient,
                attempts: job.attemptsMade,
                maxAttempts: job.opts.attempts,
                failedReason: job.failedReason,
                createdAt: new Date(job.timestamp),
            })),
        };
    }

    async retryDLQJob(jobId: string) {
        if (!this.notificationQueue) {
            throw new BadRequestException('DLQ management is only available with the BullMQ provider');
        }

        const job = await this.notificationQueue.getJob(jobId);

        if (!job) {
            throw new NotFoundException(`Job with ID ${jobId} does not exist`);
        }

        const status = await job.getState();
        if (status !== 'failed') {
            throw new BadRequestException(
                `Job ${jobId} cannot be retried because it is in state: ${status}`,
            );
        }

        await job.retry();

        this.logger.log(`Job ${job.id} retried for notification ${job.data?.id}`);

        return {
            success: true,
            jobId: job.id,
            notificationId: job.data?.id,
            message: `Job ${job.id} has been re-queued for processing`,
        };
    }
}
