import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});

console.log('🚀 OpenTelemetry SDK initialized');
console.log(`📤 Exporting to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);

sdk.start();

console.log('✅ OpenTelemetry SDK started');

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Validación global
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Swagger
    const config = new DocumentBuilder()
        .setTitle('Notify Engine API')
        .setDescription(
            'Multi-channel asynchronous notification routing service',
        )
        .setVersion('1.0.0')
        .addTag('notifications')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(
        `🚀 Server running on http://localhost:${port}`,
    );
    console.log(
        `📚 Swagger docs on http://localhost:${port}/api/docs`,
    );
}

bootstrap();