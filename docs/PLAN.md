# Plan — notify-engine

Fuente de verdad del avance. `STATUS.yaml` se genera desde este archivo;
no se edita a mano.

Estados de tarea: `[ ]` pendiente · `[~]` en progreso · `[x]` completada
Estados de fase: no_iniciada · en_progreso · completada

Reconstruido el 2026-10-05 a partir del código, el historial de git, el
README y la autoauditoría de 2026-09-17. Las fases 0 a 6 ya existían de
hecho; solo se marcan `[x]` las tareas que el código demuestra. Las fases
7 a 12 son el trabajo de la auditoría y lo que falta. El orden del archivo es
el orden de trabajo (reordenado y renumerado el 2026-10-05): este proyecto es
una pieza de portafolio.

---

## Fase 0 — Contexto
**Estado:** completada

- [x] Describir el problema y a quién le sirve (`README.md`, "Why this project exists")
- [x] Definir alcance: qué entra y qué NO entra (`notas/00-contexto.md`)
- [x] Inventariar lo que ya existía: migración de un sistema .NET de certificados a NestJS (`notas/00-contexto.md`)

---

## Fase 1 — Diseño
**Estado:** completada

- [x] Contrato de API con OpenAPI y validación de entrada (commit 34919fa)
- [x] Modelo de datos: entidad `Notification` (`src/notifications/entities/notification.entity.ts`)
- [x] Decisiones técnicas registradas en `DECISIONES.md` (reconstruidas en la migración)

---

## Fase 2 — Construcción: notificación asíncrona por email con BullMQ
**Estado:** completada

Rebanada: `POST /notifications` → PostgreSQL → cola BullMQ → worker → Resend.

- [x] API de notificaciones con persistencia TypeORM
- [x] Procesamiento asíncrono con BullMQ y reintentos con backoff exponencial
- [x] Dead-letter por lista `failed` de BullMQ y listado de jobs fallidos (`GET /notifications/dlq/jobs`). El reintento manual (`POST /notifications/dlq/:id/retry`) existe pero no reenvía: auditoría del 2026-10-05, ver Fase 7
- [x] Envío de email con Resend (`EmailChannel`)

---

## Fase 3 — Construcción: cola intercambiable (BullMQ / SQS)
**Estado:** completada

Rebanada: la misma notificación viaja por BullMQ o por SQS según `QUEUE_PROVIDER`.

- [x] Interfaz `IQueue` con `BullMQQueueAdapter` y `SQSQueueAdapter`
- [x] Consumer de SQS con polling (`SQSConsumerService`) y emulación local con Floci
- [x] `processAndSend()` centralizado en `NotificationsService`, compartido por ambos consumers
- [x] Solo se inicializa la infraestructura del provider activo (con `sqs` no se abre conexión a Redis)

---

## Fase 4 — Construcción: multicanal
**Estado:** completada

Rebanada: la misma notificación sale por email, Slack o SMS según su canal.

- [x] Interfaz `IChannel` y `ClassifierService` que resuelve el canal
- [x] Canales email (Resend), Slack (webhook) y SMS (Twilio, integrado)
- [x] Canal explícito en el DTO y validación del formato del recipient por canal

---

## Fase 5 — Construcción: observabilidad
**Estado:** completada

- [x] Trazas OpenTelemetry exportadas a Grafana Tempo
- [x] Stack local de observabilidad en `docker-compose.yml` (Tempo, Prometheus, Grafana)

---

## Fase 6 — Endurecimiento (autoauditado)
**Estado:** completada

Resuelta a partir de la autoauditoría de 2026-09-17
(`auditorias/2026-09-17-autoauditoria.md`). La hizo la misma sesión que
escribió el código: **no sustituye a la auditoría independiente** de la
Fase 7. Los números son los ítems de esa autoauditoría.

- [x] 1. Vulnerabilidad de multer: override a 2.3.0 (cerraba las 4 advisories de entonces; hoy hay nuevas, ver Fase 7)
- [x] 2. API key obligatoria en todos los endpoints (`ApiKeyGuard`)
- [x] 3. Rate limiting con `@nestjs/throttler` (60/min global, 10/min en `POST /notifications`)
- [x] 4. Idempotencia en `processAndSend` con claim atómico y estado `'sending'`
- [x] 5. Worker de BullMQ solo se registra si `QUEUE_PROVIDER` no es `sqs`
- [x] 6. `markAsFailed` único, llamado por ambos providers al agotar `MAX_ATTEMPTS`
- [x] 7. Documentar DLQ y `RedrivePolicy` de SQS en el README (restaurado en la migración)
- [x] 8. `getDLQJobs()` resuelve el recipient real con un batch query
- [x] 9. Redacción de la URL en spans OTel salientes (Slack, Resend)
- [x] 10. `SmsChannel` implementado con Twilio; sin credenciales falla de forma controlada
- [x] 11. `helmet`
- [x] 12. `alertGroup` conectado al webhook de Slack, sin romper la operación principal si falla
- [x] 13. Eliminado el test e2e de boilerplate
- [x] 14. Swagger solo cuando `NODE_ENV !== 'production'`
- [x] 15. Quitado `defaultJobOptions.backoff` que nunca aplicaba
- [x] 16. Corregido el comentario engañoso sobre la Dead Letter Queue
- [x] 17. Tests unitarios: `ClassifierService`, `EmailChannel`, `processAndSend` (12 tests en verde al 2026-10-05)

---

## Fase 7 — Auditoría independiente y corrección del bug de DLQ
**Estado:** completada

Ejecutada por el agente `auditor`, que no escribió el código. Los hallazgos
vuelven a este plan como tareas nuevas. No aplica auditoría de UI: el
proyecto no tiene frontend.

- [x] Auditoría de seguridad independiente (`auditorias/2026-10-05-seguridad.md`: 0 altos, 3 medios, 5 bajos)
- [x] Auditoría de arquitectura independiente (`auditorias/2026-10-05-arquitectura.md`: 1 alto, 5 medios, 4 bajos)
- [x] **[ALTA]** Corregir el reintento manual de DLQ, que es un no-op: tras agotar intentos la fila queda en `'failed'`, `retryDLQJob` solo llama a `job.retry()` y el claim de `processAndSend` solo acepta `'pending'`, así que no se reenvía nada y el job sale de la lista `failed`. Resuelto con la opción A (`retryDLQJob` reabre la fila de forma atómica y reinicia los contadores; el claim no se toca), registrada en `DECISIONES.md`, y cubierto con `src/notifications/dlq-retry.spec.ts`
- [x] Resolver las vulnerabilidades de dependencias de producción que `npm audit` reportó el 2026-10-05 (36: `axios`, `@grpc/grpc-js`, `brace-expansion`, `fast-uri` y `multer` 2.2.0–2.3.0; advisories nuevas respecto a la autoauditoría, que cerró en 0). Hecho con `npm audit fix` sin `--force` y subiendo el override de `multer` de 2.3.0 a 2.4.0 (menor, no cambio de versión mayor). Resultado: `npm audit --omit=dev` → 0; `npx jest` (12 tests) y `npm run build` en verde. No se arrancó la app contra Postgres/Redis
- [x] Incorporar los hallazgos de la auditoría al plan: los dos medios de seguridad prioritarios en la Fase 8 y el resto de los medios y bajos en la Fase 9

---

## Fase 8 — CI y hallazgos de seguridad prioritarios
**Estado:** no_iniciada

CI, y junto con él dos hallazgos medios de seguridad que conviene cerrar
antes que el resto: el filtro global que devuelve el mensaje crudo de los
errores al cliente, y el `docker-compose.yml` que publica Redis sin
contraseña en todas las interfaces.

- [ ] Workflow de GitHub Actions: instalar con `npm ci`, compilar y correr los tests
- [ ] Tests en verde en CI
- [ ] **[MEDIA]** El filtro global devuelve `exception.message` de errores que no son HTTP (`http-exception.filter.ts:30-31`): responder siempre `'Internal server error'` y agregar `ParseUUIDPipe` a `:id`. El 500 de `GET /notifications/abc` es una inferencia por lectura, no se ejecutó
- [ ] **[MEDIA]** `docker-compose.yml` publica Redis (sin `requirepass`), Postgres, Adminer, Floci, Tempo, Prometheus y Grafana en todas las interfaces: prefijar `127.0.0.1:`, activar `requirepass` por variable de entorno, fijar versiones en vez de `:latest` y documentar que es solo para desarrollo
- [ ] Vulnerabilidades en dependencias de desarrollo: quedan 29 high, todas en la cadena de jest 29 (`braces` → `micromatch` → `jest-*`, más `@types/jest`). Arreglarlas exige subir a jest 30 (`npm audit fix --force`, cambio de versión mayor), por eso no se hizo. Solo afectan al entorno de desarrollo y a CI, no al código que corre en producción. Decidir cuándo subir jest, junto con el CI de esta fase

---

## Fase 9 — Hallazgos medios y bajos de la auditoría independiente
**Estado:** no_iniciada

Hallazgos de las auditorías del 2026-10-05 (`auditorias/2026-10-05-seguridad.md`
y `2026-10-05-arquitectura.md`) que no son de severidad alta ni están en la
Fase 8. Se agregan como fase nueva porque la Fase 6 ya está cerrada.

Decisión pendiente del dueño:

- [ ] Decidir sobre `synchronize` y migraciones. Ambas auditorías confirmaron que `databaseConfig` y `awsConfig` (`src/common/config/database.config.ts`) son configuración muerta que contradice la efectiva (`src/app.module.ts:41`) y trae defaults de credenciales. Propuesta de los auditores: borrarlas o hacer que TypeORM y `SQSClient` las consuman (una sola fuente), y evaluar una migración inicial con `migrationsRun`. El motivo de usar `synchronize` en vez de migraciones sigue `[RAZÓN NO DOCUMENTADA]`: lo decide el dueño

Seguridad:
- [ ] **[MEDIA]** Sin `trust proxy`: detrás de un balanceador todos los clientes comparten el bucket del throttler. Configurarlo con el número de saltos o la subred exacta y documentar la topología de despliegue en `DECISIONES.md`
- [ ] **[BAJA]** `ApiKeyGuard`: comparación de tiempo constante (`crypto.timingSafeEqual` sobre hashes), mensaje 401 unificado y validación de `API_KEY` al arrancar
- [ ] **[BAJA]** Una sola API key global y `findAll` sin paginar: documentar el modelo en `DECISIONES.md`, paginar con tope y considerar una key aparte para `dlq/*`
- [ ] **[BAJA]** Enmascarar emails y teléfonos en el `reason` de `markAsFailed` y `alertGroup` (logs, alerta de Slack y spans OTel) y no loguear el recipient en el canal de Slack
- [ ] **[BAJA]** Validación del DTO: `@IsString() @MaxLength(200)` en `recipient`, decidir y documentar la política de HTML en `body`, y corregir que Swagger dice `sms` cuando se acepta `phone`
- [ ] **[BAJA]** Dockerfile: correr como usuario no root y agregar `.dockerignore`

Arquitectura:
- [ ] **[MEDIA]** Un canal de email sin `RESEND_API_KEY` tumba el arranque (`email-channel.provider.ts:12`), contra lo que dice `CLAUDE.md`: hacer el cliente tolerante como Slack y SMS, o declarar que Resend es obligatorio
- [ ] **[MEDIA]** `create` no es atómico: si falla el encolado queda una fila `pending` huérfana y el cliente reintenta y duplica. Marcarla `failed` o registrar el riesgo en `DECISIONES.md`
- [ ] **[BAJA]** Mover `SQSConsumerService` a `notifications/`, que no se registre ni cree `SQS_CLIENT` con valores vacíos en modo BullMQ, y tipar el payload de `IQueue.add` (hoy `any`; el contrato real es `{id: string}`)
- [ ] **[BAJA]** Una única función `isSqsProvider()` en `queue.constants.ts` (hoy se lee de tres formas) y validar `QUEUE_PROVIDER` al arrancar
- [ ] **[BAJA]** Quitar las dependencias sin uso (`uuid`, `@types/uuid`, `@nestjs/axios`, `axios`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/resources`; confirmar con `npx depcheck`) y fijar `type: 'postgres'` en vez de `DB_PROVIDER`
- [ ] **[BAJA]** Sacar la redacción de URLs de OTel de `main.ts` a su propio archivo con test, y que falte `OTEL_EXPORTER_OTLP_ENDPOINT` no genere `undefined/v1/traces`
- [ ] **[BAJA]** Renombrar `bull-mqqueue-adapter.ts` (typo de nombre de archivo)
- [ ] **[BAJA]** Robustez del consumer SQS: un id no uuid retrasa 5 s el resto del lote, y `SQS_QUEUE_URL` sin definir detiene el polling en silencio

---

## Fase 10 — Reconciliación de notificaciones atascadas en `'sending'`
**Estado:** no_iniciada

Hoy, si `channel.send()` tiene éxito pero el update a `'sent'`
falla, la fila queda en `'sending'` a propósito (para no reenviar) y nada
la detecta ni alerta.

- [ ] Decidir la estrategia (p. ej. job periódico que alerte sobre `'sending'` con más de N minutos y sin `externalMessageId`) y registrarla en `DECISIONES.md`
- [ ] Cubrir también los otros dos caminos hacia `'sending'` que halló la auditoría: (a) `getChannelByType` se llama después del claim y fuera del `try` que revierte a `'pending'`; (b) el proceso muere entre el claim y el envío y el reintento se da por completado sin enviar (en SQS el mensaje se borra)
- [ ] Implementar la detección y la alerta
- [ ] Tests de la reconciliación

---

## Fase 11 — Pruebas
**Estado:** no_iniciada

Cobertura de los caminos críticos que hoy solo se verificaron a mano o con mocks.

- [ ] Test e2e real del flujo completo (requiere Postgres y una cola vivos; evaluar service containers en CI)
- [ ] Spec unitario de `SlackChannel`
- [ ] Tests de los caminos críticos que la auditoría halló sin cobertura: simetría de fallo en el límite de `MAX_ATTEMPTS` (`NotificationProcessor.onQueueFailed` y `SQSConsumerService.handleFailedAttempt`), `markAsFailed` y `alertGroup`, `create`, `getDLQJobs` y `retryDLQJob`, `ApiKeyGuard`, `IsValidRecipientFormatConstraint`, `SmsChannel`, y el caso "envío OK pero `updateStatus` falla"
- [ ] Probar `SmsChannel` con credenciales reales de Twilio. Depende de una cuenta de Twilio con saldo: es una dependencia externa conocida, no un descuido

---

## Fase 12 — Deuda de lint
**Estado:** no_iniciada

Unos 57 errores y warnings previos de `npm run lint`
(`no-unsafe-*` por `catch (error: any)`, un import sin usar en
`notifications.controller.ts`, un `Invalid type "never"` en
`classifier.service.ts`). **No se corre `npm run lint` con `--fix` en
bloque**: reformatear todo `src/` en un commit entierra el historial real.

- [ ] Proponer cómo resolverlo sin un diff masivo (incluye si el script `lint` debe perder el `--fix`) y discutirlo antes de tocar código
- [ ] Ejecutar lo acordado

---

## Bloqueos

Cosas que impiden avanzar y no dependen de mí. Si está vacío, se deja vacío.

- (ninguno)
