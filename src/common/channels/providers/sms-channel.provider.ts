import { Injectable, Logger } from "@nestjs/common";
import { IChannel } from "../interfaces/channel.interface";
import { ConfigService } from "@nestjs/config";
import twilio from "twilio";

@Injectable()
export class SmsChannel implements IChannel {
    private readonly logger = new Logger(SmsChannel.name);
    private readonly client?: ReturnType<typeof twilio>;
    private readonly fromNumber?: string;

    constructor(private readonly configService: ConfigService) {
        const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER');

        if (!accountSid || !authToken || !this.fromNumber) {
            this.logger.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not configured in environment');
            return;
        }

        this.client = twilio(accountSid, authToken);
    }

    async send(recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string; externalId?: string }> {
        if (!this.client || !this.fromNumber) {
            return { success: false, error: 'Twilio client not configured' };
        }

        try {
            const message = await this.client.messages.create({
                to: recipient,
                from: this.fromNumber,
                body,
            });

            this.logger.log(`SMS sent successfully: ${message.sid}`);
            return { success: true, externalId: message.sid };

        } catch (error: any) {
            this.logger.error(`Error sending SMS: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
