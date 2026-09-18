// Debe ser el primer import: puebla process.env desde .env antes de que se
// evalúe cualquier decorador @Module() (ver AppModule, NotificationsModule,
// QueuesModule), que deciden en tiempo de definición si registran o no la
// infraestructura de BullMQ/Redis según QUEUE_PROVIDER.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_KEY_HEADER } from './common/guards/api-key.guard';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { Span } from '@opentelemetry/api';
import type { ClientRequest, IncomingMessage } from 'http';

// Hosts de canales externos cuya URL saliente puede filtrar datos sensibles a
// los spans exportados a Tempo. El caso concreto y verificable hoy: el
// webhook de Slack (`SLACK_WEBHOOK_URL`) lleva el secreto del webhook
// incrustado en el path de la URL, y las instrumentaciones de OTel capturan
// la URL completa (`url.full`) como atributo del span por defecto — sin
// esto, ese secreto queda expuesto en cada trace. Resend no expone nada
// sensible en la URL (la auth va por header, que estas instrumentaciones no
// capturan salvo que se configure explícitamente vía headersToSpanAttributes,
// cosa que no hacemos), pero se incluye igual por defensa en profundidad.
// Ninguna de las dos instrumentaciones usadas aquí captura el body/contenido
// de la request como atributo de span (no es el comportamiento por defecto
// de OTel, precisamente por el riesgo de PII), así que no hay nada que
// redactar en ese frente hoy.
const REDACTED_URL_HOSTS = ['hooks.slack.com', 'api.resend.com'];

function isTrackedHost(host: string): boolean {
    return REDACTED_URL_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
}

function redactUrlForHost(host: string, path: string): string {
    // Para Slack el path ES el secreto (token del webhook) → se redacta entero.
    // Para el resto, alcanza con no exponer el query string.
    const isSecretPath = host === 'hooks.slack.com' || host.endsWith('.hooks.slack.com');
    const redactedPath = isSecretPath ? '/[REDACTED]' : path.split('?')[0];
    return `https://${host}${redactedPath}`;
}

// @opentelemetry/instrumentation-http instrumenta el módulo `http`/`https` nativo.
function redactHttpOutgoingUrl(span: Span, request: ClientRequest | IncomingMessage): void {
    if (!('getHeader' in request)) {
        return; // Solo nos interesan las requests salientes (ClientRequest), no las entrantes.
    }

    const host = request.getHeader('host');
    if (typeof host !== 'string' || !isTrackedHost(host)) {
        return;
    }

    span.setAttribute(ATTR_URL_FULL, redactUrlForHost(host, request.path ?? ''));
}

// @opentelemetry/instrumentation-undici instrumenta fetch()/undici — que es lo
// que usan tanto el SDK de Resend como @slack/webhook (ninguno de los dos usa
// el módulo http/https directamente), así que el hook de arriba nunca se
// dispara para sus llamadas: necesitan este segundo hook.
function redactUndiciOutgoingUrl(span: Span, request: { origin: string; path: string }): void {
    let host: string;
    try {
        host = new URL(request.origin).host;
    } catch {
        return;
    }

    if (!isTrackedHost(host)) {
        return;
    }

    span.setAttribute(ATTR_URL_FULL, redactUrlForHost(host, request.path));
}

const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
        getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-http': {
                requestHook: redactHttpOutgoingUrl,
            },
            '@opentelemetry/instrumentation-undici': {
                requestHook: redactUndiciOutgoingUrl,
            },
        }),
    ],
});

console.log('🚀 OpenTelemetry SDK initialized');
console.log(`📤 Exporting to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);

sdk.start();

console.log('✅ OpenTelemetry SDK started');

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.use(helmet());

    // Validación global
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Swagger — no se monta en producción: /api/docs no tiene ApiKeyGuard
    // (a diferencia de los endpoints reales de notifications) y expone el
    // shape completo de la API a quien lo encuentre.
    const isSwaggerEnabled = process.env.NODE_ENV !== 'production';
    if (isSwaggerEnabled) {
        const config = new DocumentBuilder()
            .setTitle('Notify Engine API')
            .setDescription(
                'Multi-channel asynchronous notification routing service',
            )
            .setVersion('1.0.0')
            .addTag('notifications')
            .addApiKey(
                { type: 'apiKey', name: API_KEY_HEADER, in: 'header' },
                API_KEY_HEADER,
            )
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document);
    }

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(
        `🚀 Server running on http://localhost:${port}`,
    );
    if (isSwaggerEnabled) {
        console.log(
            `📚 Swagger docs on http://localhost:${port}/api/docs`,
        );
    }
}

bootstrap();