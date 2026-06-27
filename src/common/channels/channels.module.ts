import { Module } from '@nestjs/common';
import { EmailChannel } from './providers/email-channel.provider';
import { SlackChannel } from './providers/slack-channel.provider';
import { SmsChannel } from './providers/sms-channel.provider';

@Module({
    providers: [EmailChannel, SlackChannel, SmsChannel],
    exports: [EmailChannel, SlackChannel, SmsChannel],
})
export class ChannelsModule {}

