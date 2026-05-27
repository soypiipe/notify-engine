import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { NotificationsService } from "./notifications.service";

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationProcessor.name);

    constructor(private notificationsService: NotificationsService) {
        super();
    }

    async process(job: Job): Promise<any> {
        try{

            this.logger.log(`Processing job ${job.id}`);
    
            const { id } = job.data;
    
            const notification = await this.notificationsService.findOne(id);

            this.logger.log(`Sending notification to: ${notification.recipient}`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
    
            this.logger.log(`✅ Notification sent to: ${notification.recipient}`);
    
            await this.notificationsService.updateStatus(id, 'sent')
    
            return { status: 'sent' };
            
        }catch(error: any){
            this.logger.error(`Error processing job: ${error.message}`);
            throw error
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