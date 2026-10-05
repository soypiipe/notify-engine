# notify-engine

Motor de notificaciones multicanal y asíncrono con NestJS. Pieza de
portafolio técnico, documentada como caso de estudio.

## Dónde está cada cosa

- Esta carpeta es el repositorio del proyecto, montado como submódulo del
  segundo cerebro. El repo es **público**: nada de secretos, datos
  personales ni contexto de negocio en los archivos versionados.
- El plan, las notas y las decisiones están en `docs/`, versionados junto
  al código.
- Las reglas de trabajo comunes están en `METODOLOGIA.md`, en la raíz del
  segundo cerebro (dos niveles arriba). Este archivo solo añade lo
  específico de este proyecto.

Antes de tocar código: leer `docs/PLAN.md` para saber en qué fase y tarea
vamos, y la nota de la fase actual en `docs/notas/`.

## Stack

- NestJS 11 + TypeScript, Node 24
- TypeORM + PostgreSQL 16
- BullMQ + Redis y AWS SQS (emulado con Floci), intercambiables con `QUEUE_PROVIDER=bullmq|sqs`
- Canales: Resend (email), Slack (webhook), SMS con Twilio
- OpenTelemetry → Grafana Tempo; Prometheus y Grafana en el compose
- Seguridad de la API: API key en `x-api-key`, `@nestjs/throttler`, `helmet`

## Cómo correrlo

```bash
cp .env.example .env      # y completar los valores
npm run docker:up         # Postgres, Adminer, Redis, Floci, Tempo, Prometheus, Grafana
npm install
npm run start:dev         # Swagger en /api/docs (solo si NODE_ENV != production)
npm test                  # 12 tests unitarios
```

Si hay notificaciones procesándose sin que hayas arrancado la app, revisar
`ps aux | grep dist/main` antes de asumir un bug: un proceso huérfano ya
contaminó pruebas una vez (`docs/notas/06-endurecimiento.md`).

## Principios de este proyecto

Los generales están en `METODOLOGIA.md`. Aquí lo propio:

- **Las decisiones de arquitectura las tomo yo.** Úsame como rubber duck:
  debate opciones, explica el porqué de cada trade-off y no escribas la
  solución completa sin que yo entienda el razonamiento. También es
  preparación para entrevistas.
- La lógica de enviar vive en `NotificationsService.processAndSend()`, no en
  los workers. Ambos providers de cola deben comportarse igual.
- Un canal mal configurado devuelve `{ success: false, error }`; no lanza
  excepciones que tumben el worker.
- La política de reintentos (`MAX_ATTEMPTS`) es una sola constante
  compartida por BullMQ y SQS.

## Lo que NO se hace aquí

- **No correr `npm run lint` (lleva `--fix`) sobre todo `src/`.** Un diff
  masivo de formato entierra el historial real. Se resuelve como tarea
  propia, discutida antes (Fase 12).
- No reformatear código que no es parte de la tarea en curso.
- No reintroducir el test e2e de boilerplate. Un e2e real es la Fase 11.
- No reemplazar el claim atómico con `'sending'` por un check simple
  `if (status === 'sent')`: no cubre la carrera entre workers.
- No guardar el recipient en el payload del job (`getDLQJobs` lo resuelve
  contra la base).
- No poner `defaultJobOptions` de reintentos en la configuración raíz de
  BullMQ: la política vive en `BullMQQueueAdapter.add()`.
- No agregar un endpoint de inspección del DLQ de SQS; se inspecciona con
  herramientas de AWS.
- No crear abstracciones nuevas sin una segunda implementación real o un
  requisito escrito. Un canal nuevo (p. ej. WhatsApp) no existe y no se
  prepara de antemano.
- No dar SMS por verificado hasta probarlo con credenciales reales de
  Twilio.
- No exponer Swagger en producción.
- No usar `synchronize` fuera de `NODE_ENV=development`.

## Ciclo de trabajo

1. Leer `docs/PLAN.md`, marcar la tarea `[~]`.
2. Implementar solo esa tarea.
3. Escribir en `docs/notas/<fase>.md` qué se hizo y por qué.
4. Tests y commit — un commit por tarea, con código y documentación juntos.
5. Regenerar `docs/STATUS.yaml`.

Si aparece trabajo no previsto, se agrega al plan como tarea aparte. No se
mezcla con la tarea en curso.
