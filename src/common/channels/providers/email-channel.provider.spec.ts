import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();
jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: { send: mockSend },
    })),
}));

import { EmailChannel } from './email-channel.provider';

describe('EmailChannel', () => {
    let channel: EmailChannel;
    let configService: ConfigService;

    beforeEach(() => {
        mockSend.mockReset();
        configService = {
            get: jest.fn().mockReturnValue('fake-resend-api-key'),
        } as unknown as ConfigService;
        channel = new EmailChannel(configService);
    });

    it('returns success with the externalId when Resend accepts the email', async () => {
        mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

        const result = await channel.send('user@example.com', 'Subject', '<p>Body</p>');

        expect(result).toEqual({ success: true, externalId: 'email-123' });
        expect(mockSend).toHaveBeenCalledWith({
            from: 'Acme <onboarding@resend.dev>',
            to: ['user@example.com'],
            subject: 'Subject',
            html: '<p>Body</p>',
        });
    });

    it('returns success:false with the Resend error message when Resend rejects the email', async () => {
        mockSend.mockResolvedValue({
            data: null,
            error: { message: 'Invalid `to` field' },
        });

        const result = await channel.send('bad-recipient', 'Subject', 'body');

        expect(result).toEqual({ success: false, error: 'Invalid `to` field' });
    });

    it('returns success:false when the Resend call throws unexpectedly', async () => {
        mockSend.mockRejectedValue(new Error('network down'));

        const result = await channel.send('user@example.com', 'Subject', 'body');

        expect(result).toEqual({ success: false, error: 'network down' });
    });
});
