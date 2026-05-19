import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    constructor(private readonly httpAdapterHost: HttpAdapterHost) { }

    catch(exception: unknown, host: ArgumentsHost): void {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();

        let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let details: unknown = null;

        if (exception instanceof HttpException) {
            httpStatus = exception.getStatus();
            const response = exception.getResponse();
            message = (response as any).message || exception.message;
            details = (response as any).error || null;
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        this.logger.error(
            `[${ctx.getRequest().method}] ${ctx.getRequest().url}`,
            exception instanceof Error ? exception.stack : String(exception),
        );

        // 1. Creamos el objeto base
        const errorResponse: Record<string, any> = {
            statusCode: httpStatus,
            timestamp: new Date().toISOString(),
            path: ctx.getRequest().url,
            message,
        };

        // 2. Agregamos los detalles solo si existen, evitando el spread conflictivo
        if (details) {
            errorResponse.details = details;
        }

        httpAdapter.reply(ctx.getResponse(), errorResponse, httpStatus);
    }
}