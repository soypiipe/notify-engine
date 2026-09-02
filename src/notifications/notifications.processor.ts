import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { NotificationsService } from "./notifications.service";
@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationProcessor.name);

    constructor(
        private notificationsService: NotificationsService
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        const { id } = job.data;
        return await this.notificationsService.processAndSend(id);
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

            this.alertGroup(job.data.id, job.data, error.message);
        }
    }

    private alertGroup(jobId: string, data: any, razon: string) {
        this.logger.log(`ALERT - Job ${jobId} failed: `, data, `Razon: ${razon}`);
    }
}