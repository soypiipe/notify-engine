import { Module } from '@nestjs/common';
import { EmailChannel } from './providers/email-channel.provider';
import { SlackChannel } from './providers/slack-channel.provider';
import { SmsChannel } from './providers/sms-channel.provider';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    providers: [EmailChannel, SlackChannel, SmsChannel],
    exports: [EmailChannel, SlackChannel, SmsChannel],
})
export class ChannelsModule {}

