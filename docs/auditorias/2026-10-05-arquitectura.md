# Auditoría de arquitectura — notify-engine

Fecha: 2026-10-05. Auditor: agente `auditor` independiente (no escribió el
código). Alcance: `src/`, `package.json`, `docker-compose.yml`, `Dockerfile`,
`README.md`, `CLAUDE.md`, `docs/DECISIONES.md` y `docs/PLAN.md` como
contraste. Solo lectura. Ejecutó `npx jest` (3 suites, 12 tests en verde) y
`npm run build` (compila). No se pudo ejecutar la app (sin Docker).

**Nota de la sesión que lo guardó:** los números de línea del informe
original no eran fiables (citaban líneas hasta 623 en archivos de 237). Aquí
van corregidos donde se verificaron y, donde no, solo archivo y función.
Verificado al guardar, leyendo el código: el hallazgo alto (ver abajo), el
claim y `getChannelByType` (`notifications.service.ts:115-127`),
`markAsFailed` (`:81`), `retryDLQJob` (`:208-226`), el constructor de
`EmailChannel` (`email-channel.provider.ts:12`), que `uuid`, `axios`,
`@nestjs/axios`, `@opentelemetry/sdk-trace-node` y `@opentelemetry/resources`
no se importan en `src/`, y que no existe `.dockerignore`.

## Resumen

La arquitectura es coherente y los principios de `CLAUDE.md` se cumplen en
casi todo (claim atómico, recipient fuera del payload, política de reintentos
en el adapter, `MAX_ATTEMPTS` compartido, sin endpoint de DLQ para SQS).
**1 hallazgo alto, 5 medios y 4 bajos.** El alto es un bug funcional: el
reintento manual de DLQ no reenvía nada. Hay también una contradicción real
entre `CLAUDE.md` y el código con el canal de email.

## Hallazgos

### [ALTA] El reintento manual de DLQ (`POST /notifications/dlq/:id/retry`) es un no-op silencioso
**Dónde:** `src/notifications/notifications.service.ts`: `markAsFailed`
(`:81-85`, deja `status = 'failed'`), el claim de `processAndSend`
(`:115-117`, solo acepta `status: 'pending'`) y `retryDLQJob` (`:226`,
`job.retry()`).
**Qué pasa:** al agotarse los intentos, `markAsFailed` deja la fila en
`'failed'`. Si el operador reintenta el job, BullMQ lo ejecuta de nuevo y
llama a `processAndSend`; el claim `update({id, status:'pending'}, ...)`
afecta 0 filas porque la fila está en `'failed'`. Entra por la rama
"Duplicate processAndSend", loguea un warning, devuelve `{status:'failed'}`
sin lanzar, y el job termina como `completed`.
**Por qué importa:** la función de reintento documentada (README, y marcada
como hecha en el plan) responde que re-encoló, pero nunca envía. Además el
job sale de la lista `failed`, así que el operador cree que se resolvió.
Ninguna transición lleva `failed → pending`. Ningún test cubre `getDLQJobs`,
`retryDLQJob` ni `markAsFailed`.
**Verificación:** confirmado por lectura del código en la sesión que lo
guardó; el auditor recomienda confirmarlo con un test de integración.
**Propuesta (decide el dueño, según `CLAUDE.md`):** que `retryDLQJob` pase la
fila `failed → pending` antes de `job.retry()`, o que el claim acepte
`'failed'` en un reintento manual. Registrar la decisión en `DECISIONES.md` y
agregar un test del flujo completo.

### [MEDIA] Un canal de email mal configurado tumba el arranque, contra lo que dice `CLAUDE.md`
**Dónde:** `src/common/channels/providers/email-channel.provider.ts:12`
(`new Resend(this.configService.get('RESEND_API_KEY'))` en el constructor).
**Qué pasa:** el auditor verificó que `new Resend(undefined)` lanza `Missing
API key`. Slack y SMS toleran la falta de configuración y devuelven
`success:false` al enviar; email es el único que no. Con la variable vacía el
contenedor de Nest no levanta, también para quien solo quiere SQS y Slack.
**Por qué importa:** `CLAUDE.md` declara "un canal mal configurado devuelve
`{success:false,error}` sin lanzar". El spec de email no prueba este caso.
**Propuesta:** construir el cliente de forma tolerante, como Slack y SMS, o
declarar explícitamente que Resend es obligatorio.

### [MEDIA] Filas atascadas en `'sending'`, además del caso ya documentado (Fase 9)
**Dónde:** `notifications.service.ts`: `getChannelByType` se llama después
del claim (`:127`) y fuera del `try` interno que revierte a `'pending'`
(`:129-144`).
**Qué pasa:** el caso "envío OK pero falla `updateStatus`" ya está
documentado y planeado. Hay dos caminos más, no documentados: (a) si
`getChannelByType` lanza, la fila queda en `'sending'` para siempre; (b) si
el proceso muere entre el claim y el envío (deploy, OOM), el mensaje se
redelivera, el claim falla y el job se da por completado sin enviar; en SQS
el mensaje se borra.
**Por qué importa:** pérdida silenciosa de notificaciones, sin
`externalMessageId` ni alerta. `updatedAt` existe y serviría para detectarlo.
**Propuesta:** resolver el canal antes del claim, o cubrirlo con el mismo
revert; ampliar la Fase 9 a (a) y (b).

### [MEDIA] Escritura en DB y encolado no son atómicos
**Dónde:** `notifications.service.ts:39-41` (`save()` y luego `queue.add()`).
**Qué pasa:** si Redis o SQS fallan, el cliente recibe un 500 pero la fila
`pending` ya existe y nadie la procesará; si el cliente reintenta, crea un
duplicado.
**Propuesta:** como mínimo, marcar la fila como `failed` si falla el
encolado, o registrar el riesgo en `DECISIONES.md`. Un outbox sería
sobreingeniería para un caso de estudio; decide el dueño.

### [MEDIA] Sin migraciones, y dos declaraciones de `synchronize` que no coinciden
**Dónde:** `src/app.module.ts:41` (`=== 'development'`) y
`src/common/config/database.config.ts:9` (`!== 'production'`).
**Qué pasa:** confirmado. `databaseConfig` y `awsConfig` se cargan en
`ConfigModule.forRoot({load:[...]})` y ningún `get('database…')` ni
`get('aws…')` las consume: configuración muerta, con defaults de credenciales
que nunca se usan. El valor efectivo sí cumple `CLAUDE.md`. Con `NODE_ENV`
ausente (`.env.example` lo deja vacío) `synchronize` es `false` y una base
vacía no recibe el esquema.
**Por qué importa:** quien lea `database.config.ts` creerá que `synchronize`
está activo en staging; un cambio de entidad en producción exige SQL manual
sin historial.
**Propuesta:** (1) borrar `databaseConfig` y `awsConfig`, o hacer que TypeORM
y `SQSClient` las consuman (una sola fuente). (2) Sobre migraciones: para un
servicio con estado cuyo esquema ya cambió (`'sending'`,
`externalMessageId`), una migración inicial más `migrationsRun` es
proporcionada. Decide el dueño; hoy `DECISIONES.md` dice `[RAZÓN NO
DOCUMENTADA]`.

### [MEDIA] Cobertura de tests insuficiente en los caminos críticos
**Dónde:** solo existen `classifier.service.spec.ts`,
`notifications.service.spec.ts` (4 casos de `processAndSend`) y
`email-channel.provider.spec.ts`. No hay carpeta `test/`.
**Qué pasa:** lo que existe es de buena calidad (verifica el claim, el no
reenvío y el revert). Faltan tests de: `NotificationProcessor.onQueueFailed`
y `SQSConsumerService.handleFailedAttempt` (la simetría entre providers que
`CLAUDE.md` declara como principio); `markAsFailed`/`alertGroup`; `create`;
`getDLQJobs`/`retryDLQJob` (que habría detectado el hallazgo alto);
`ApiKeyGuard`; `IsValidRecipientFormatConstraint`; los canales Slack y SMS; y
el caso "envío OK pero `updateStatus` falla". `classifier.service.spec.ts` es
casi tautológico (un `switch` de tres casos).
**Propuesta:** priorizar la simetría BullMQ/SQS en el límite de
`MAX_ATTEMPTS`, el guard y los dos endpoints de DLQ.

### [BAJA] Acoplamientos que rompen la abstracción `IQueue` y el sentido de capas
**Dónde:** `notifications.service.ts` (imports de `bullmq`,
`@Optional() @InjectQueue('notifications')`), `sqs-consumer.service.ts`,
`queues.module.ts`, `bull-mqqueue-adapter.ts`.
- `NotificationsService` importa `bullmq` directamente para
  `getDLQJobs`/`retryDLQJob`; con `QUEUE_PROVIDER=sqs`, esos endpoints
  responden 400. Documentado en el README y coherente con `CLAUDE.md`: es
  asimetría de diseño, no contradicción.
- `SQSConsumerService` vive en `common/queues/` pero depende de
  `NotificationsService` (dependencia `common → notifications` invertida), se
  registra siempre en `NotificationsModule` y, en modo BullMQ, loguea "SQS
  Consumer started" y crea un `SQS_CLIENT` con `region` y `endpoint` vacíos.
  El patrón de selección condicional del resto no se aplica a este provider.
- `IQueue.add(jobName, data: any)`: `BullMQQueueAdapter` ignora todo salvo
  `data.id`. El contrato real es `{id: string}`; el `any` lo oculta.
**Propuesta:** mover el consumer a `notifications/`, junto al processor; tipar
el payload de `add`. No requiere una abstracción nueva.

### [BAJA] Selección del provider con `process.env` duplicada y sin validar
**Dónde:** `queues.module.ts` y `notifications.module.ts` (constante
`isSqsProvider` duplicada) y `sqs-consumer.service.ts` (lee lo mismo por
`ConfigService`).
**Qué pasa:** tres lecturas de la misma variable por tres vías. Funciona
porque `main.ts` importa `dotenv/config` primero; cualquier otro punto de
entrada (un e2e, un script) no vería el `.env`. Además `QUEUE_PROVIDER` no se
valida: un valor mal escrito cae en silencio en BullMQ. La decisión de
fondo es aceptable; el riesgo es la duplicación.
**Propuesta:** una única función `isSqsProvider()` en `queue.constants.ts` y
validar el valor al arrancar.

### [BAJA] Dependencias declaradas sin uso
**Dónde:** `package.json`: `uuid`, `@types/uuid`, `@nestjs/axios`, `axios`,
`@opentelemetry/sdk-trace-node`, `@opentelemetry/resources` (ninguna se
importa en `src/`, verificado). `DB_PROVIDER` se lee con `get<any>(...)` pero
solo `pg` está instalado, así que el "proveedor de BD" es fingido.
**Por qué importa:** superficie de dependencias y de CVE sin necesidad,
contra el estándar de revisar antes de agregar una dependencia.
**Propuesta:** confirmar con `npx depcheck` y quitarlas; fijar
`type: 'postgres'`.

### [BAJA] Detalles menores de mantenibilidad
- ~65 líneas de redacción de URLs de OTel dentro de `main.ts`; mejor en un
  archivo de telemetría con test. Si falta `OTEL_EXPORTER_OTLP_ENDPOINT`, la
  URL queda `undefined/v1/traces`.
- Typo de nombre de archivo: `bull-mqqueue-adapter.ts`, inconsistente con
  `sqs-queue.adapter.ts`.
- `findAll()` devuelve toda la tabla sin paginar.
- No existe `.dockerignore` y el `Dockerfile` hace `COPY . .` en el stage
  builder (un `.env` local podría quedar en una capa intermedia, no en la
  imagen final); el runtime corre como root.

## Revisado y sin hallazgos

- **Claim atómico con `'sending'`:** cumple `CLAUDE.md`; la condición está en
  el `WHERE` y es segura ante concurrencia.
- **`processAndSend()` como punto único:** ambos consumers delegan en él;
  `markAsFailed` también es compartido. La duplicación se limita al cálculo de
  "¿se agotaron los intentos?", distinto por naturaleza de cada API.
- **Política de reintentos solo en `BullMQQueueAdapter.add()`**, sin
  `defaultJobOptions`; `MAX_ATTEMPTS` se usa en adapter, processor y consumer.
- **Recipient fuera del payload del job;** `getDLQJobs` lo resuelve contra la
  base.
- **Swagger fuera de producción, helmet, `ValidationPipe`, throttler,
  `ApiKeyGuard` que falla cerrado.**
- **Sin WhatsApp ni endpoint de DLQ para SQS**, como pide `CLAUDE.md`.
- **Abstracciones justificadas:** `IQueue` tiene dos implementaciones reales,
  `IChannel` tres. `ClassifierService` es un `switch` de tres ramas, de valor
  marginal pero que no rompe la regla.
- **README vs. código:** coinciden, salvo el no-op del hallazgo alto.
- **Build y tests:** compila y los 12 tests pasan; los imports `src/...` se
  reescriben a rutas relativas en `dist/`.

## No se pudo revisar

Comportamiento real contra Postgres, Redis, SQS (Floci), Resend, Slack y
Twilio: lo del no-op del DLQ y las filas atascadas sale de leer el código, no
de ejecutarlo. Si `endpoint: ''` y `region: ''` en el `SQSClient` dan
problemas contra AWS real. La autoauditoría de 2026-09-17 no se leyó completa.
Seguridad a fondo y rendimiento quedan fuera de esta auditoría.
