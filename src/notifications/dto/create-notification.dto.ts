import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, IsIn, Validate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { IsValidRecipientFormatConstraint } from './validators/recipient-format.validator';
import type { RecipientType } from 'src/common/channels/interfaces/recipient-type';

export class CreateNotificationDto {
    @ApiProperty({
        description: 'Recipient: email, phone number, or slack channel (#channel-name)',
        example: 'user@example.com',
    })
    @IsNotEmpty()
    @Validate(IsValidRecipientFormatConstraint)
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
    @IsIn(['email', 'phone', 'slack'])
    channel?: RecipientType;
}