/**
 * Número máximo de intentos de envío antes de marcar una notificación como
 * 'failed', compartido entre ambos providers de cola para que su
 * comportamiento al fallar sea equivalente:
 * - BullMQ: `attempts` en `bull-mqqueue-adapter.ts` (comparado contra
 *   `job.attemptsMade` en `notifications.processor.ts`).
 * - SQS: comparado contra el atributo `ApproximateReceiveCount` del mensaje
 *   en `sqs-consumer.service.ts`.
 *
 * También debe coincidir con `maxReceiveCount` en el RedrivePolicy de la
 * cola SQS (ver README).
 */
export const MAX_ATTEMPTS = 3;
