import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'test',
    database: process.env.DB_NAME || 'notify-engine',
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
}));

export const awsConfig = registerAs('aws', () => ({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
}));