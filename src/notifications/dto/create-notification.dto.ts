import { IsEmail, IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNotificationDto {
    @ApiProperty({
        description: 'Recipient email address',
        example: 'user@example.com',
    })
    @IsEmail()
    @IsNotEmpty()
    recipient!: string;

    @ApiProperty({
        description: 'Notification subject',
        example: 'Order confirmation',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(255)
    subject!: string;

    @ApiProperty({
        description: 'Notification body',
        example: 'Your order #123 has been confirmed',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(5)
    @MaxLength(5000)
    body!: string;

    @ApiProperty({
        description: 'Optional notification channel (email, slack, sms)',
        example: 'email',
        required: false,
    })
    @IsOptional()
    @IsString()
    channel?: string;
}