import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { databaseConfig, awsConfig } from './common/config/database.config';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { NotificationsModule } from './notifications/notifications.module';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [databaseConfig, awsConfig],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: configService.get<any>('DB_PROVIDER'),
                host: configService.get<string>('DB_HOST'),
                port: configService.get<number>('DB_PORT', 5432),
                username: configService.get<string>('DB_USER'),
                password: configService.get<string>('DB_PASSWORD'),
                database: configService.get<string>('DB_NAME'),
                entities: [__dirname + '/**/*.entity{.ts,.js}'], // Carga automática de entidades
                synchronize: configService.get<string>('NODE_ENV') === 'development', // ⚠️ ¡Ojo! Solo usa true en desarrollo. En producción usa migraciones.
            })
        }),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                connection: {
                    host: configService.get<string>('REDIS_HOST'),
                    port: configService.get<number>('REDIS_PORT', 6379),
                    maxRetriesPerRequest: null,
                }
            })
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
export class AppModule implements OnModuleInit { 
    constructor(private dataSource: DataSource) { }

    onModuleInit() {
        // Este método se ejecuta automáticamente cuando el módulo se inicializa
        if (this.dataSource.isInitialized) {
            console.log('✅ ¡Conexión a PostgreSQL establecida con éxito desde TypeORM!');
            // Opcional: Muestra el nombre de la base de datos actual para estar seguro
            console.log(`BBDD Conectada: ${this.dataSource.options.database}`);
        } else {
            console.log('❌ La base de datos no está inicializada.');
        }
    }
}
