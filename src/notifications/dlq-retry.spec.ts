import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ClassifierService } from './classifier.service';
import { Notification } from './entities/notification.entity';
import { SlackChannel } from 'src/common/channels/providers/slack-channel.provider';
import { IChannel } from 'src/common/channels/interfaces/channel.interface';

const API_KEY = 'test-key';

/**
 * Prueba del endpoint POST /notifications/dlq/:id/retry de punta a punta con
 * el controller y el servicio reales. Solo se simulan los bordes: la base
 * (repositorio con estado que respeta las condiciones del WHERE), el canal de
 * envío, y el job de BullMQ, cuyo retry() hace lo que haría el worker: llamar
 * a processAndSend.
 */
describe('POST /notifications/dlq/:id/retry', () => {
    let app: INestApplication;
    let service: NotificationsService;
    let row: Notification;
    let channel: jest.Mocked<IChannel>;
    let job: { id: string; data: { id: string }; getState: jest.Mock; retry: jest.Mock };
    let statusWhenRetried: string | undefined;

    beforeEach(async () => {
        row = {
            id: 'notif-1',
            recipient: 'user@example.com',
            subject: 'Subject',
            body: 'Body',
            channel: 'email',
            status: 'failed',
            externalMessageId: undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const repository = {
            findOne: jest.fn(async ({ where }) => (where.id === row.id ? { ...row } : null)),
            update: jest.fn(async (criteria: string | { id: string; status?: string }, patch: Partial<Notification>) => {
                const id = typeof criteria === 'string' ? criteria : criteria.id;
                const requiredStatus = typeof criteria === 'string' ? undefined : criteria.status;
                if (id !== row.id || (requiredStatus !== undefined && row.status !== requiredStatus)) {
                    return { affected: 0 };
                }
                Object.assign(row, patch);
                return { affected: 1 };
            }),
        };

        channel = { send: jest.fn().mockResolvedValue({ success: true, externalId: 'ext-1' }) };
        statusWhenRetried = undefined;

        job = {
            id: 'job-1',
            data: { id: 'notif-1' },
            getState: jest.fn().mockResolvedValue('failed'),
            // Lo que hace el worker al recibir el job reencolado.
            retry: jest.fn(async () => {
                statusWhenRetried = row.status;
                await service.processAndSend(job.data.id);
            }),
        };
        const queue = { getJob: jest.fn(async (id: string) => (id === job.id ? job : undefined)) };

        const moduleRef = await Test.createTestingModule({
            controllers: [NotificationsController],
            providers: [
                NotificationsService,
                { provide: getRepositoryToken(Notification), useValue: repository },
                { provide: 'QUEUE_ADAPTER', useValue: {} },
                { provide: ClassifierService, useValue: { getChannelByType: () => channel } },
                { provide: SlackChannel, useValue: {} },
                { provide: getQueueToken('notifications'), useValue: queue },
                { provide: ConfigService, useValue: { get: () => API_KEY } },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
        service = moduleRef.get(NotificationsService);
    });

    afterEach(async () => {
        await app.close();
    });

    it('reopens the failed row, resets the attempts, and the send really happens', async () => {
        const response = await request(app.getHttpServer())
            .post('/notifications/dlq/job-1/retry')
            .set('x-api-key', API_KEY);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, jobId: 'job-1', notificationId: 'notif-1' });

        // La fila salió de 'failed' ANTES de reencolar el job...
        expect(statusWhenRetried).toBe('pending');
        // ...con los contadores reiniciados...
        expect(job.retry).toHaveBeenCalledWith('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
        // ...y el envío ocurrió de verdad.
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send).toHaveBeenCalledWith('user@example.com', 'Subject', 'Body');
        expect(row.status).toBe('sent');
        expect(row.externalMessageId).toBe('ext-1');
    });

    it('does not retry the job when the row is no longer failed', async () => {
        row.status = 'sent';

        const response = await request(app.getHttpServer())
            .post('/notifications/dlq/job-1/retry')
            .set('x-api-key', API_KEY);

        expect(response.status).toBe(409);
        expect(job.retry).not.toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
        expect(row.status).toBe('sent');
    });

    it('puts the row back to failed when job.retry() fails', async () => {
        job.retry.mockRejectedValue(new Error('redis unavailable'));

        const response = await request(app.getHttpServer())
            .post('/notifications/dlq/job-1/retry')
            .set('x-api-key', API_KEY);

        expect(response.status).toBe(500);
        expect(row.status).toBe('failed');
        expect(channel.send).not.toHaveBeenCalled();
    });

    it('rejects the request without the API key', async () => {
        const response = await request(app.getHttpServer()).post('/notifications/dlq/job-1/retry');

        expect(response.status).toBe(401);
        expect(job.retry).not.toHaveBeenCalled();
        expect(row.status).toBe('failed');
    });
});
