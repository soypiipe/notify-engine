import { Injectable, Logger } from "@nestjs/common";
import { IChannel } from "../interfaces/channel.interface";
import { Resend } from 'resend';
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailChannel implements IChannel{
    private readonly logger = new Logger(EmailChannel.name);
    private readonly resend: Resend;

    constructor(private readonly configService: ConfigService){
        this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    }
    
    async send(recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string; externalId?: string }> {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Acme <onboarding@resend.dev>',
                to: [recipient],
                subject: subject,
                html: body,
            });

            if (error) {
                this.logger.error(`Resend error: ${error.message}`);
                return { success: false, error: error.message };
            }

            this.logger.log(`Email sent successfully: ${data?.id}`);
            return { success: true, externalId: data?.id };

        } catch (error: any) {
            this.logger.error(`Unexpected error sending email: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

}