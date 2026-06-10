import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, NotFoundException } from "@nestjs/common";
import { Job } from "bullmq";
import { NotificationsService } from "./notifications.service";
import { SpanStatusCode, trace } from "@opentelemetry/api";

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationProcessor.name);
    private readonly tracer = trace.getTracer('notify-engine');

    constructor(private notificationsService: NotificationsService) {
        super();
    }

    async process(job: Job): Promise<any> {
        const span = this.tracer.startSpan('notification.process');

        try {
            const { id } = job.data;
            
            const notification = await this.notificationsService.findOne(id);
            
            this.logger.log(`Sending notification to: ${notification.recipient}`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            
            await this.notificationsService.updateStatus(id, 'sent');
            
            return { status: 'sent' };
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

    @OnWorkerEvent('active')
    onQueueActive(job: Job) {
        this.logger.log(`🏃 Job ${job.id} is now active`);
    }

    @OnWorkerEvent('completed')
    onQueueCompleted(job: Job) {
        this.logger.log(`✅ Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    async onQueueFailed(job: Job, error: Error) {
        this.logger.error(`Job ${job.id} failed: ${error.message}`);

        const maxAttempts = job.opts.attempts ?? 1;

        if (job.attemptsMade >= maxAttempts) {
            await this.notificationsService.updateStatus(job.data.id, 'failed');
            this.logger.log(`Updated notification ${job.data.id} status to failed`);

            this.alertGroup(job.data.id, job.data, error.message)
        }
    }

    private alertGroup(jobId: string, data: any, razon: string) {
        this.logger.log(`ALERT - Job ${jobId} failed: `, data, `Razon: ${razon}`);
    }
}