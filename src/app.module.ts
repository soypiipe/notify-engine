import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { databaseConfig, awsConfig } from './common/config/database.config';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [databaseConfig, awsConfig],
        }),
        NotificationsModule,
    ],
    providers: [
        {
            provide: APP_FILTER,
            useClass: AllExceptionsFilter,
        },
    ],
})
export class AppModule { }
