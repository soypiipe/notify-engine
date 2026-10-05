# Plan — notify-engine

Fuente de verdad del avance. `STATUS.yaml` se genera desde este archivo;
no se edita a mano.

Estados de tarea: `[ ]` pendiente · `[~]` en progreso · `[x]` completada
Estados de fase: no_iniciada · en_progreso · completada

Reconstruido el 2026-10-05 a partir del código, el historial de git, el
README y la autoauditoría de 2026-09-17. Las fases 0 a 6 ya existían de
hecho; solo se marcan `[x]` las tareas que el código demuestra. Las fases
7 a 11 son lo que falta, en orden de prioridad: este proyecto es una pieza
de portafolio.

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
- [x] Dead-letter por lista `failed` de BullMQ, con reintento manual (`GET /notifications/dlq/jobs`, `POST /notifications/dlq/:id/retry`)
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

## Fase 7 — Auditoría independiente
**Estado:** no_iniciada

Ejecutada por el agente `auditor`, que no escribió el código. Es la
prioridad 1. Los hallazgos vuelven a este plan como tareas nuevas. No
aplica auditoría de UI: el proyecto no tiene frontend.

- [ ] Auditoría de seguridad independiente
- [ ] Auditoría de arquitectura independiente
- [ ] Evaluar `synchronize`: se desconoce la razón de usar sincronización automática en vez de migraciones. Hoy solo se activa con `NODE_ENV=development` (`src/app.module.ts:41`), pero `databaseConfig` (`src/common/config/database.config.ts:9`) declara `synchronize` con otra condición (`!== 'production'`) y está cargada sin que nada la use
- [x] Resolver las vulnerabilidades de dependencias de producción que `npm audit` reportó el 2026-10-05 (36: `axios`, `@grpc/grpc-js`, `brace-expansion`, `fast-uri` y `multer` 2.2.0–2.3.0; advisories nuevas respecto a la autoauditoría, que cerró en 0). Hecho con `npm audit fix` sin `--force` y subiendo el override de `multer` de 2.3.0 a 2.4.0 (menor, no cambio de versión mayor). Resultado: `npm audit --omit=dev` → 0; `npx jest` (12 tests) y `npm run build` en verde. No se arrancó la app contra Postgres/Redis
- [ ] Vulnerabilidades en dependencias de desarrollo: quedan 29 high, todas en la cadena de jest 29 (`braces` → `micromatch` → `jest-*`, más `@types/jest`). Arreglarlas exige subir a jest 30 (`npm audit fix --force`, cambio de versión mayor), por eso no se hizo. Solo afectan al entorno de desarrollo y a CI, no al código que corre en producción. Decidir cuándo subir jest, junto con la Fase 8 (CI)
- [ ] Incorporar los hallazgos de la auditoría al plan y resolverlos

---

## Fase 8 — CI
**Estado:** no_iniciada

Prioridad 2.

- [ ] Workflow de GitHub Actions: instalar con `npm ci`, compilar y correr los tests
- [ ] Tests en verde en CI

---

## Fase 9 — Reconciliación de notificaciones atascadas en `'sending'`
**Estado:** no_iniciada

Prioridad 3. Hoy, si `channel.send()` tiene éxito pero el update a `'sent'`
falla, la fila queda en `'sending'` a propósito (para no reenviar) y nada
la detecta ni alerta.

- [ ] Decidir la estrategia (p. ej. job periódico que alerte sobre `'sending'` con más de N minutos y sin `externalMessageId`) y registrarla en `DECISIONES.md`
- [ ] Implementar la detección y la alerta
- [ ] Tests de la reconciliación

---

## Fase 10 — Pruebas
**Estado:** no_iniciada

Prioridad 4.

- [ ] Test e2e real del flujo completo (requiere Postgres y una cola vivos; evaluar service containers en CI)
- [ ] Spec unitario de `SlackChannel`
- [ ] Probar `SmsChannel` con credenciales reales de Twilio. Depende de una cuenta de Twilio con saldo: es una dependencia externa conocida, no un descuido

---

## Fase 11 — Deuda de lint
**Estado:** no_iniciada

Prioridad 5. Unos 57 errores y warnings previos de `npm run lint`
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
