import { BadRequestException } from '@nestjs/common';
import { ClassifierService } from './classifier.service';
import { EmailChannel } from 'src/common/channels/providers/email-channel.provider';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';
import { SmsChannel } from 'src/common/channels/providers/sms-channel.provider';

describe('ClassifierService', () => {
    let service: ClassifierService;
    let emailChannel: EmailChannel;
    let slackChannel: SlackChannel;
    let smsChannel: SmsChannel;

    beforeEach(() => {
        emailChannel = {} as EmailChannel;
        slackChannel = {} as SlackChannel;
        smsChannel = {} as SmsChannel;
        service = new ClassifierService(emailChannel, slackChannel, smsChannel);
    });

    it('returns EmailChannel for "email"', () => {
        expect(service.getChannelByType('email')).toBe(emailChannel);
    });

    it('returns SmsChannel for "phone"', () => {
        expect(service.getChannelByType('phone')).toBe(smsChannel);
    });

    it('returns SlackChannel for "slack"', () => {
        expect(service.getChannelByType('slack')).toBe(slackChannel);
    });

    it('throws BadRequestException when channel is falsy', () => {
        expect(() => service.getChannelByType(undefined as any)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for an unsupported channel type', () => {
        expect(() => service.getChannelByType('fax' as any)).toThrow(BadRequestException);
    });
});
