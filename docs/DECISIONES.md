# Decisiones — notify-engine

Qué se decidió y por qué. Si una decisión se revierte, se agrega una
entrada nueva; la vieja no se borra.

Reconstruido el 2026-10-05 desde `README.md` y la autoauditoría de
2026-09-17 (`auditorias/2026-09-17-autoauditoria.md`). Esas fuentes no
registran fechas por decisión, así que no se inventan. Donde ninguna fuente
da la razón, dice `[RAZÓN NO DOCUMENTADA]`.

---

## Una cola intercambiable detrás de `IQueue`
**Decisión:** BullMQ y SQS se exponen por un mismo contrato (`IQueue`) con un adapter cada uno; `QUEUE_PROVIDER` elige cuál.
**Alternativas descartadas:** atarse a una sola tecnología de cola.
**Razón:** demostrar que un sistema de notificaciones no debe quedar amarrado a una cola. BullMQ (Redis) da un ciclo de desarrollo rápido; SQS es el destino de producción, emulado en local con Floci.

## Canal explícito en el DTO
**Decisión:** el canal (`email`, `phone`, `slack`) viene en la petición y no se infiere del formato del recipient.
**Alternativas descartadas:** inferirlo del formato.
**Razón:** evitar ambigüedad; un teléfono y el nombre de un canal de Slack pueden ser ambos cadenas arbitrarias.

## `processAndSend()` vive en el servicio, no en los workers
**Decisión:** la lógica de "buscar, resolver canal, enviar, actualizar estado, trazar" está en `NotificationsService`.
**Alternativas descartadas:** duplicarla en el worker de BullMQ y en el consumer de SQS.
**Razón:** nació dentro de `NotificationProcessor`; cuando apareció el segundo consumer, duplicarla se rechazó. Es el caso que la regla anti-abstracción describe: la abstracción se extrae cuando llega la segunda implementación real.

## Idempotencia con claim atómico y estado `'sending'`
**Decisión:** antes de enviar, `UPDATE ... SET status='sending' WHERE id=? AND status='pending'`; si no afecta filas, se sale sin reenviar. Si el envío falla de verdad, se revierte a `'pending'`.
**Alternativas descartadas:** un check simple `if (status === 'sent') return`.
**Razón:** el check simple no cubre el caso real (envío OK y luego el update a `'sent'` falla, dejando `'pending'`) ni la carrera de dos workers SQS leyendo `'pending'` a la vez. El update condicional es una sola sentencia atómica. Se probó contra Postgres real con dos conexiones concurrentes.

## Una fila atascada en `'sending'` se deja atascada a propósito
**Decisión:** si `channel.send()` tuvo éxito pero el update a `'sent'` falla, no se revierte a `'pending'`.
**Alternativas descartadas:** revertir para permitir reintento.
**Razón:** un reintento volvería a enviar un mensaje real. Se prefiere una inconsistencia visible a un duplicado silencioso. Consecuencia abierta: nada detecta esas filas todavía (Fase 9 del plan).

## Simetría de fallo entre BullMQ y SQS
**Decisión:** un solo `NotificationsService.markAsFailed()` y una constante compartida `MAX_ATTEMPTS = 3`. BullMQ usa `attemptsMade`; SQS usa `ApproximateReceiveCount`.
**Alternativas descartadas:** dejar que cada provider decida cuándo fallar.
**Razón:** SQS no tiene el equivalente nativo de la semántica de reintentos y DLQ de BullMQ; sin esto, con SQS la notificación quedaba en `'pending'` para siempre.

## Solo se inicializa la infraestructura del provider activo
**Decisión:** `QueuesModule` y `NotificationsModule` leen `process.env.QUEUE_PROVIDER` al definirse el módulo y solo registran `BullModule.registerQueue` si el provider no es `sqs`; `QUEUE_ADAPTER` se registra con `useExisting` del adapter activo.
**Alternativas descartadas:** un factory que inyecta ambos adapters y elige con un ternario; condicionar `BullModule.forRootAsync`.
**Razón:** el `Worker` de BullMQ abre la conexión a Redis en cuanto Nest lo instancia, así que la única forma de no depender de Redis es que Nest nunca lo cree. `forRootAsync` se dejó porque solo registra configuración compartida sin abrir conexión (verificado en el código de `@nestjs/bullmq`). Se usa `process.env` y no `ConfigService` porque la decisión se toma al definir el módulo.

## El recipient del DLQ se resuelve con un batch query
**Decisión:** `getDLQJobs()` junta los `notificationId` de los jobs fallidos y consulta la base una vez con `In(...)`.
**Alternativas descartadas:** guardar el recipient en el payload del job.
**Razón:** el job solo guarda `{id}`, por eso `job.data?.recipient` era siempre `undefined`. Denormalizarlo quedaría desactualizado y duplicaría la fuente de verdad. Es un endpoint de operación de bajo tráfico: no justifica optimizar más.

## DLQ de SQS documentada, no automatizada
**Decisión:** la creación de `notifications-dlq` y el `RedrivePolicy` (con `maxReceiveCount` igual a `MAX_ATTEMPTS`) están documentados en el README; no hay script.
**Alternativas descartadas:** un script de aprovisionamiento.
**Razón:** Floci no tiene volumen persistente en `docker-compose.yml`; habría que recrear las colas en cada reinicio del contenedor de todas formas. No hay endpoint de inspección del DLQ de SQS: se inspecciona con herramientas de AWS.

## El reintento manual de DLQ reabre la fila `failed → pending` antes de reintentar el job
**Decisión:** `retryDLQJob` hace un `UPDATE ... SET status='pending' WHERE id=? AND status='failed'`; si no afecta filas, responde 409 y no toca el job. Si afecta una, llama a `job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true })`; si eso falla, devuelve la fila a `'failed'` (`WHERE status='pending'`) y relanza el error. Primero la fila, después el job.
**Alternativas descartadas:** que el claim de `processAndSend` acepte también `'failed'`.
**Razón:** la auditoría independiente del 2026-10-05 halló que el reintento era un no-op: tras agotar intentos la fila queda en `'failed'`, el claim solo acepta `'pending'`, no se enviaba nada y el job salía de la lista de fallidos. Aceptar `'failed'` en el claim habría debilitado la idempotencia de todos los caminos (un reintento automático de BullMQ o una redelivery de SQS podría reenviar una notificación ya fallada), no solo la del reintento manual. Reabrir la fila en el único punto donde un humano decide reintentar deja el claim intacto. Los contadores se reinician porque, con `attemptsMade` ya en `MAX_ATTEMPTS`, el worker volvería a fallar el job de inmediato.

## `alertGroup` reutiliza `SlackChannel` y su fallo no revierte nada
**Decisión:** las alertas de operación salen por el mismo webhook de Slack; van en su propio try/catch y solo loguean un warning si fallan.
**Alternativas descartadas:** dejarlo como placeholder con un comentario.
**Razón:** la infraestructura ya existía y estaba probada. `markAsFailed` ya escribió el estado en la base; una alerta rota no debe convertirse en un error de la operación principal.

## Redacción de URLs en spans OTel, con `instrumentation-undici`
**Decisión:** dos `requestHook` (http y undici) que redactan el path completo para hosts de Slack y recortan el query string para el resto.
**Alternativas descartadas:** confiar solo en `instrumentation-http`.
**Razón:** ni Resend ni `@slack/webhook` usan `http`/`https` nativos sino `fetch()` global, que solo instrumenta undici. El dato sensible real no es el body (OTel no lo captura por defecto) sino `url.full`, que para Slack lleva el secreto del webhook en el path.

## Swagger solo fuera de producción
**Decisión:** `/api/docs` se monta únicamente si `NODE_ENV !== 'production'`.
**Alternativas descartadas:** dejarlo siempre público.
**Razón:** no tiene auth propia, a diferencia de `/notifications`, y expone la forma completa de la API.

## La política de reintentos vive solo en el adapter
**Decisión:** `attempts: MAX_ATTEMPTS` y el backoff exponencial de 2 s se pasan por job desde `BullMQQueueAdapter.add()`; se eliminó `defaultJobOptions.backoff` de `app.module.ts`.
**Alternativas descartadas:** moverla a la configuración raíz de BullMQ.
**Razón:** las opciones por job siempre pisan los defaults, así que el bloque raíz sugería un backoff fijo de 5 s que nunca ocurría. Moverla solo agregaría una capa de indirección.

## `SmsChannel` falla de forma controlada sin credenciales
**Decisión:** el constructor valida las tres variables `TWILIO_*`; si falta alguna loguea el error y `send()` devuelve `{ success: false, error: 'Twilio client not configured' }` en vez de lanzar.
**Alternativas descartadas:** dejar el `throw new Error("Method not implemented.")` original, que rompía el job sin control.
**Razón:** misma política que `EmailChannel` y `SlackChannel`: un canal mal configurado no debe tumbar el worker. Twilio no se ha probado con credenciales reales (Fase 10).

## API key simple y rate limiting
**Decisión:** un guard compara el header `x-api-key` con `API_KEY`, a nivel de clase en `NotificationsController`; `@nestjs/throttler` con un límite global y uno más estricto en `POST /notifications`.
**Alternativas descartadas:** ninguna documentada.
**Razón:** sin ninguna de las dos cosas el servicio era un relay abierto de email y Slack. Los valores concretos (60/min global, 10/min en el POST) son `[RAZÓN NO DOCUMENTADA]`.

## Se borra el test e2e de boilerplate y se escriben tests unitarios
**Decisión:** se eliminaron `test/app.e2e-spec.ts` y `test/jest-e2e.json`; se agregaron specs de `ClassifierService`, `EmailChannel` y `processAndSend`. No se escribió spec de `SlackChannel`.
**Alternativas descartadas:** reescribir el e2e; un spec de Slack.
**Razón:** el e2e probaba un `GET /` que no existe, nunca tuvo script ni CI. Uno real exige Postgres, Redis o SQS vivos y la API key: más que una limpieza. `SlackChannel` repite el patrón de `EmailChannel`. Ambas cosas quedan pendientes en la Fase 10.

## Mapeo de imports en jest
**Decisión:** `"moduleNameMapper": {"^src/(.*)$": "<rootDir>/$1"}` en la configuración de jest.
**Razón:** el proyecto importa con rutas absolutas `src/...` (por `baseUrl`) y jest no las resolvía, así que ningún test sobre `ClassifierService` o `NotificationsService` era escribible.

## `synchronize` de TypeORM solo en desarrollo
**Decisión:** el esquema lo crea TypeORM con `synchronize`, activo únicamente cuando `NODE_ENV=development` (`src/app.module.ts:41`). No hay migraciones.
**Alternativas descartadas:** migraciones. `[RAZÓN NO DOCUMENTADA]` de por qué no se usan.
**Razón:** `[RAZÓN NO DOCUMENTADA]`. El comportamiento está documentado en el README. Hay además una inconsistencia: `databaseConfig` (`src/common/config/database.config.ts:9`) declara `synchronize: NODE_ENV !== 'production'`, está cargada en `ConfigModule` y nada la consume; la autoauditoría la describe como "el mismo criterio" que `TypeOrmModule` y no lo es. Evaluarlo es tarea de la Fase 7.

## Elecciones de tecnología sin razón registrada
- **NestJS:** el origen fue migrar un sistema .NET a NestJS; por qué NestJS y no otro framework: `[RAZÓN NO DOCUMENTADA]`.
- **Floci para emular SQS en local:** el README dice qué es, no por qué se eligió sobre otras opciones: `[RAZÓN NO DOCUMENTADA]`.
- **Resend como proveedor de email:** `[RAZÓN NO DOCUMENTADA]`.
- **Grafana Tempo como backend de trazas:** `[RAZÓN NO DOCUMENTADA]`.
