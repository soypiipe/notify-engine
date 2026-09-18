import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { InjectQueue } from '@nestjs/bullmq';
import * as Bullmq from 'bullmq';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { IQueue } from 'src/common/queues/interfaces/queue.interface';
import { ClassifierService } from './classifier.service';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly tracer = trace.getTracer('notify-engine');

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @Inject('QUEUE_ADAPTER') private readonly queue: IQueue,
        private readonly classifierService: ClassifierService,
        private readonly slackChannel: SlackChannel,
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

    /**
     * Punto único donde un intento de envío se da por agotado, sin importar
     * el provider de cola (BullMQ o SQS): actualiza el status a 'failed' y
     * dispara la alerta de ops. Mantiene ambos providers con el mismo
     * comportamiento al fallar.
     */
    async markAsFailed(id: string, reason: string) {
        await this.updateStatus(id, 'failed');
        this.logger.error(`Notification ${id} marked as failed after exhausting retries: ${reason}`);
        await this.alertGroup(id, reason);
    }

    /**
     * Alerta de ops real vía el webhook de Slack (reusa SlackChannel, el mismo
     * canal que usan las notificaciones normales). Si el webhook falla o no está
     * configurado, solo loguea el problema — una alerta rota no debe hacer
     * fallar markAsFailed, que ya escribió el status en DB correctamente.
     */
    private async alertGroup(notificationId: string, reason: string) {
        const subject = '🚨 Notification failed permanently';
        const body = `Notification \`${notificationId}\` failed permanently after exhausting retries.\nReason: ${reason}`;

        try {
            const result = await this.slackChannel.send('ops-alerts', subject, body);
            if (!result.success) {
                this.logger.warn(`Failed to send ops alert to Slack for notification ${notificationId}: ${result.error}`);
            }
        } catch (error: any) {
            this.logger.warn(`Unexpected error sending ops alert to Slack for notification ${notificationId}: ${error.message}`);
        }
    }

    async processAndSend(id: string){
        const span = this.tracer.startSpan('notification.process');
        try {
            const notification = await this.findOne(id);

            // Claim atómico: solo pasa de 'pending' a 'sending' si nadie más lo hizo antes.
            // Si otro worker (o un reintento tras un send exitoso) ya lo tomó, affected === 0.
            const claim = await this.notificationRepository.update(
                { id, status: 'pending' },
                { status: 'sending' },
            );

            if (claim.affected === 0) {
                const current = await this.findOne(id);
                this.logger.warn(
                    `Duplicate processAndSend detected for ${id}: status is already '${current.status}', skipping resend`,
                );
                return { status: current.status, externalId: current.externalMessageId };
            }

            const channel = this.classifierService.getChannelByType(notification.channel);

            let result: Awaited<ReturnType<typeof channel.send>>;
            try {
                result = await channel.send(
                    notification.recipient,
                    notification.subject,
                    notification.body);

                if (!result.success) {
                    throw new Error(result.error || 'Unknown channel error');
                }
            } catch (sendError: any) {
                // El envío en sí falló (no el update posterior): liberamos el claim para
                // que un reintento legítimo pueda volver a intentar el envío.
                await this.notificationRepository.update(
                    { id, status: 'sending' },
                    { status: 'pending' },
                );
                throw sendError;
            }

            // Si el envío tuvo éxito pero esto falla, la notificación queda a propósito
            // en 'sending' (no se revierte a 'pending'): ya se envió de verdad, así que
            // reintentar volvería a enviar un duplicado. Queda como inconsistencia visible
            // para reconciliación/alerta manual en vez de un reenvío silencioso.
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

        // El job solo guarda { id } (ver BullMQQueueAdapter.add), nunca recipient —
        // job.data?.recipient siempre era undefined. En vez de denormalizar el
        // recipient dentro del payload del job (quedaría desactualizado si la
        // notificación cambia), lo resolvemos aquí contra la DB, que es la fuente
        // de verdad. Es un endpoint de ops de bajo tráfico, un batch query alcanza.
        const notificationIds = dlqJobs
            .map(job => job.data?.id)
            .filter((id): id is string => Boolean(id));

        const notifications = notificationIds.length
            ? await this.notificationRepository.find({ where: { id: In(notificationIds) } })
            : [];
        const recipientById = new Map(notifications.map(n => [n.id, n.recipient]));

        return {
            totalFailed: dlqJobs.length,
            jobs: dlqJobs.map(job => ({
                jobId: job.id,
                notificationId: job.data?.id,
                recipient: job.data?.id ? recipientById.get(job.data.id) : undefined,
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
