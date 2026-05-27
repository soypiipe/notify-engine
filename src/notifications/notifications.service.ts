import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
@Injectable()
export class NotificationsService{
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @InjectQueue('notifications') private readonly notificationQueue: Queue
    ){}

    async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
        const notification = this.notificationRepository.create({
            recipient: createNotificationDto.recipient,
            subject: createNotificationDto.subject,
            body: createNotificationDto.body,
            channel: createNotificationDto.channel || 'email',
            status: 'pending'
        });

        const saved = await this.notificationRepository.save(notification);

        const jobNotification = await this.notificationQueue.add('notification-process', {
            id: saved.id
        },{
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
            removeOnFail: false,
        })

        this.logger.log(`Notification created: ${saved.id}`);
        this.logger.log(`Job Id: ${jobNotification.id}`)

        return saved;
    }

    async findOne(id: string): Promise<Notification> {
        const notification = await this.notificationRepository.findOne({ where: {id}  });
        if(!notification) {
            throw new NotFoundException(`Notification with ID ${id} not found`)
        }

        return notification
    }

    async findAll(): Promise<Notification[]> {
        return await this.notificationRepository.find();
    }

    async updateStatus(id: string, status: 'sent' | 'failed'){
        await this.notificationRepository.update(id, { status })
    }
}