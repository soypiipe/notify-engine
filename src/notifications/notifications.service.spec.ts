import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { ClassifierService } from './classifier.service';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';
import { IQueue } from 'src/common/queues/interfaces/queue.interface';
import { IChannel } from 'src/common/channels/interfaces/channel.interface';

describe('NotificationsService.processAndSend', () => {
    let service: NotificationsService;
    let notificationRepository: jest.Mocked<Pick<Repository<Notification>, 'findOne' | 'update'>>;
    let classifierService: jest.Mocked<Pick<ClassifierService, 'getChannelByType'>>;
    let channel: jest.Mocked<IChannel>;

    const baseNotification: Notification = {
        id: 'notif-1',
        recipient: 'user@example.com',
        subject: 'Subject',
        body: 'Body',
        channel: 'email',
        status: 'pending',
        externalMessageId: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        notificationRepository = {
            findOne: jest.fn(),
            update: jest.fn(),
        };
        channel = { send: jest.fn() };
        classifierService = {
            getChannelByType: jest.fn().mockReturnValue(channel),
        };

        service = new NotificationsService(
            notificationRepository as unknown as Repository<Notification>,
            {} as IQueue,
            classifierService as unknown as ClassifierService,
            {} as SlackChannel,
            undefined,
        );
    });

    it('sends via the resolved channel and marks the notification as sent', async () => {
        notificationRepository.findOne.mockResolvedValue({ ...baseNotification });
        notificationRepository.update.mockResolvedValue({ affected: 1 } as any);
        channel.send.mockResolvedValue({ success: true, externalId: 'ext-123' });

        const result = await service.processAndSend('notif-1');

        expect(classifierService.getChannelByType).toHaveBeenCalledWith('email');
        expect(channel.send).toHaveBeenCalledWith('user@example.com', 'Subject', 'Body');
        // Claim atómico pending->sending, y luego el update final a 'sent'.
        expect(notificationRepository.update).toHaveBeenNthCalledWith(
            1,
            { id: 'notif-1', status: 'pending' },
            { status: 'sending' },
        );
        expect(notificationRepository.update).toHaveBeenNthCalledWith(
            2,
            'notif-1',
            { status: 'sent', externalMessageId: 'ext-123' },
        );
        expect(result).toEqual({ status: 'sent', externalId: 'ext-123' });
    });

    it('does not resend when another worker already claimed the notification', async () => {
        notificationRepository.findOne
            .mockResolvedValueOnce({ ...baseNotification }) // lookup inicial
            .mockResolvedValueOnce({ ...baseNotification, status: 'sent', externalMessageId: 'ext-999' }); // estado actual tras el claim fallido
        notificationRepository.update.mockResolvedValue({ affected: 0 } as any);

        const result = await service.processAndSend('notif-1');

        expect(channel.send).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'sent', externalId: 'ext-999' });
    });

    it('reverts the claim to pending and rethrows when the channel reports failure', async () => {
        notificationRepository.findOne.mockResolvedValue({ ...baseNotification });
        notificationRepository.update.mockResolvedValue({ affected: 1 } as any);
        channel.send.mockResolvedValue({ success: false, error: 'provider rejected the message' });

        await expect(service.processAndSend('notif-1')).rejects.toThrow('provider rejected the message');

        expect(notificationRepository.update).toHaveBeenNthCalledWith(
            1,
            { id: 'notif-1', status: 'pending' },
            { status: 'sending' },
        );
        expect(notificationRepository.update).toHaveBeenNthCalledWith(
            2,
            { id: 'notif-1', status: 'sending' },
            { status: 'pending' },
        );
    });

    it('reverts the claim to pending and rethrows when the channel throws unexpectedly', async () => {
        notificationRepository.findOne.mockResolvedValue({ ...baseNotification });
        notificationRepository.update.mockResolvedValue({ affected: 1 } as any);
        channel.send.mockRejectedValue(new Error('network timeout'));

        await expect(service.processAndSend('notif-1')).rejects.toThrow('network timeout');

        expect(notificationRepository.update).toHaveBeenNthCalledWith(
            2,
            { id: 'notif-1', status: 'sending' },
            { status: 'pending' },
        );
    });
});
