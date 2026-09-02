import { BadRequestException, Injectable } from '@nestjs/common';
import { IChannel } from 'src/common/channels/interfaces/channel.interface';
import type { RecipientType } from 'src/common/channels/interfaces/recipient-type';
import { EmailChannel } from 'src/common/channels/providers/email-channel.provider';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';
import { SmsChannel } from 'src/common/channels/providers/sms-channel.provider';

@Injectable()
export class ClassifierService {

    constructor(private readonly emailChannel: EmailChannel,
        private readonly slackChannel: SlackChannel,
        private readonly smsChannel: SmsChannel
    ){}

    getChannelByType(channel: RecipientType){
        if(!channel) {
            throw new BadRequestException(`Invalid channel type: ${channel}`);
        }

        return this.getChannel(channel)
    }

    private getChannel(type: RecipientType): IChannel {
        switch (type) {
            case 'email':
                return this.emailChannel;
            case 'phone':
                return this.smsChannel;
            case 'slack':
                return this.slackChannel;
            default:
                throw new BadRequestException(`Unsupported channel type: ${type}`);
        }
    }
}
