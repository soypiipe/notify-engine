import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { NotificationsService } from "./notifications.service";
import { MAX_ATTEMPTS } from "src/common/constants/queue.constants";
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

        const maxAttempts = job.opts.attempts ?? MAX_ATTEMPTS;

        if (job.attemptsMade >= maxAttempts) {
            await this.notificationsService.markAsFailed(job.data.id, error.message);
        }
    }
}
