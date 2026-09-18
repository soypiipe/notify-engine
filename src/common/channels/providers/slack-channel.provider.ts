import { Injectable, Logger } from "@nestjs/common";
import { IChannel } from "../interfaces/channel.interface";
import { ConfigService } from "@nestjs/config";
import { IncomingWebhook } from "@slack/webhook";

@Injectable()
export class SlackChannel implements IChannel {
    private readonly logger = new Logger(SlackChannel.name);
    private readonly webhook?: IncomingWebhook;

    constructor(private readonly configService: ConfigService) {
        const slackUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');

        if (!slackUrl) {
            this.logger.error('SLACK_WEBHOOK_URL not configured in environment');
            return;
        }

        this.webhook = new IncomingWebhook(slackUrl);
    }

    async send(recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string }> {
        if (!this.webhook) {
            return { success: false, error: 'Slack webhook not configured' };
        }

        try {
            const text = `*${subject}*\n${body}`;

            await this.webhook.send({ text });

            this.logger.log(`Slack message sent successfully to ${recipient}`);
            return { success: true };

        } catch (error: any) {
            this.logger.error(`Error sending Slack message: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
