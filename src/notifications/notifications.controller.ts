import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({
        summary: 'Create a new notification',
        description: 'Receives a notification and queues it for delivery',
    })
    @ApiResponse({
        status: 202,
        description: 'Notification accepted for processing',
        type: Notification,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid input',
    })
    create(@Body() createNotificationDto: CreateNotificationDto): Notification {
        return this.notificationsService.create(createNotificationDto);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Get notification status',
        description: 'Retrieve the status of a notification by ID',
    })
    @ApiParam({
        name: 'id',
        description: 'Notification ID',
    })
    @ApiResponse({
        status: 200,
        description: 'Notification found',
        type: Notification,
    })
    @ApiResponse({
        status: 404,
        description: 'Notification not found',
    })
    findOne(@Param('id') id: string): Notification {
        const notification = this.notificationsService.findOne(id);
        if (!notification) {
            throw new Error('Notification not found');
        }
        return notification;
    }

    @Get()
    @ApiOperation({
        summary: 'Get all notifications',
    })
    @ApiResponse({
        status: 200,
        type: [Notification],
    })
    findAll(): Notification[] {
        return this.notificationsService.findAll();
    }
}