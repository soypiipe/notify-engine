import { BadRequestException, Injectable } from '@nestjs/common';
import { IChannel } from 'src/common/channels/interfaces/channel.interface';
import { EmailChannel } from 'src/common/channels/providers/email-channel.provider';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';
import { SmsChannel } from 'src/common/channels/providers/sms-channel.provider';

export type RecipientType = 'email' | 'phone' | 'slack';

@Injectable()
export class ClassifierService {

    constructor(private readonly emailChannel: EmailChannel,
        private readonly slackChannel: SlackChannel,
        private readonly smsChannel: SmsChannel
    ){}

    resolveRecipientType(recipient: string): RecipientType {
        const target = recipient.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;

        const slackRegex = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/;

        if (emailRegex.test(target)) {
            return 'email';
        }

        if (phoneRegex.test(target)) {
            return 'phone';
        }

        if (slackRegex.test(target)) {
            return 'slack';
        }

        throw new BadRequestException(`Invalid format: ${recipient}`);
    }

    getChannel(type: RecipientType): IChannel {
        switch (type) {
            case 'email':
                return this.emailChannel;
            case 'phone':
                return this.smsChannel;
            case 'slack':
                return this.slackChannel;
        }
    }
}
