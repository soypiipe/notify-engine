# Auditoría de seguridad — notify-engine

Fecha: 2026-10-05. Auditor: agente `auditor` independiente (no escribió el
código). Alcance: toda la base de código (`src/`, `package.json`,
`docker-compose.yml`, `Dockerfile`, `.env.example`, `docker/`) y el historial
de git (19 commits, `--all`). Solo lectura. No se pudo ejecutar la app (sin
Docker).

**Nota de la sesión que lo guardó:** los números de línea del informe
original no eran fiables (citaban líneas más allá del final de los
archivos). Aquí van corregidos donde se verificaron contra el código y, donde
no, se cita solo archivo y función. Verificados al guardar: filtro de
excepciones (`http-exception.filter.ts:30-31`), guard (`api-key.guard.ts:27`),
puertos de `docker-compose.yml`, ausencia de `.dockerignore` y de `USER` en el
`Dockerfile`.

## Resumen

No hay secretos versionados ni vulnerabilidades en dependencias de
producción. **Sin hallazgos de severidad alta.** 3 medios y 5 bajos. Los
medios: errores internos filtrados al cliente, ausencia de `trust proxy` para
el throttler, y `docker-compose` que publica servicios sin autenticación.

## Hallazgos

### [MEDIA] 1. El filtro global devuelve `exception.message` de errores que no son HTTP
**Dónde:** `src/common/filters/http-exception.filter.ts:30-31`.
**Qué pasa:** para cualquier `Error` que no sea `HttpException` (TypeORM, pg,
ioredis, AWS SDK) el mensaje crudo va en la respuesta JSON con status 500.
**Caso concreto (inferido por lectura, no ejecutado):** `GET /notifications/abc`
no valida el `id` (no hay `ParseUUIDPipe`); Postgres lanzaría
`invalid input syntax for type uuid` y el cliente recibiría ese texto como
500. Fallos de conexión a Redis, Postgres o SQS filtrarían host y puerto.
**Por qué importa:** contradice el estándar "mensaje genérico hacia afuera,
detalle en el log", y convierte entrada inválida en 500 en vez de 400. El log
sí guarda el stack.
**Propuesta:** que las ramas no-HTTP respondan siempre `'Internal server
error'`; `ParseUUIDPipe` en `:id`; validación de formato en `dlq/:id/retry`
(ahí el id es un jobId de BullMQ, no un uuid).

### [MEDIA] 2. Rate limiting detrás de proxy: no hay `trust proxy`
**Dónde:** `src/main.ts` (sin `set('trust proxy')`; `grep` de `trust proxy` y
`X-Forwarded` en `src`: 0 coincidencias); throttler en `src/app.module.ts`.
**Qué pasa:** `ThrottlerGuard` identifica al cliente por `req.ip`. Detrás de un
balanceador, todos los clientes comparten un bucket (10/min en POST, 60/min el
resto) y el throttler se vuelve un DoS autoinfligido. Activar `trust proxy:
true` a ciegas permitiría falsificar `X-Forwarded-For` y evadir el límite.
**Mitigante:** el throttler corre antes del guard de API key, así que también
limita intentos de adivinar la key.
**Propuesta:** documentar la topología de despliegue en `DECISIONES.md` y
configurar `trust proxy` con el número de saltos o la subred exacta.

### [MEDIA] 3. `docker-compose` publica servicios sin autenticación en todas las interfaces
**Dónde:** `docker-compose.yml`: Redis `6379:6379` sin `requirepass`
(comentado en la línea 48), Postgres `${DB_PORT}:5432`, Adminer `8080:8080`,
Floci `4566:4566`, Tempo `3200`, `4317`, `4318`, Prometheus `9090`, Grafana
`4000:3000`.
**Qué pasa:** los puertos no llevan prefijo `127.0.0.1:`, así que escuchan en
`0.0.0.0`. En una VM o red compartida, Redis queda abierto: se pueden leer,
escribir o borrar los jobs de BullMQ. Además todos los componentes usan el
mismo usuario de Postgres, dueño del esquema (no hay permisos por rol).
**Por qué importa:** el repo es público y el compose es lo que la gente copia.
Es defendible para un proyecto local, pero no está documentado.
**Propuesta:** prefijar `127.0.0.1:`, activar `requirepass` por variable de
entorno, fijar versiones (`floci`, `grafana`, `prometheus`, `tempo` van en
`:latest`) y dejar una nota de que es solo para desarrollo.

### [BAJA] 4. Dos declaraciones de `synchronize`: sin riesgo hoy, trampa latente
**Dónde:** `src/app.module.ts:41` (`=== 'development'`, la efectiva) y
`src/common/config/database.config.ts:9` (`!== 'production'`).
**Evidencia:** `databaseConfig` solo se importa y se carga en `load: [...]`;
ningún `configService.get('database...')` la consume.
**Riesgo real hoy:** ninguno; el valor efectivo cumple lo declarado en
`CLAUDE.md`. **Riesgo latente:** quien migre a `forRoot(databaseConfig)`
activaría `synchronize` en cualquier `NODE_ENV` distinto de `production`, y
con `synchronize: true` TypeORM puede alterar o borrar columnas en una base
real. La config muerta también trae defaults de credenciales (`admin`/`test`,
y `test`/`test` para AWS) que se usarían en silencio.
**Propuesta:** borrar `databaseConfig` y `awsConfig` (también sin uso) o
unificar en una sola fuente. Ya figura en el plan (hoy Fase 9; en el momento del informe, Fase 7).

### [BAJA] 5. La comparación de la API key no es de tiempo constante
**Dónde:** `src/common/guards/api-key.guard.ts:27` (`apiKey !== expectedApiKey`).
**Qué pasa:** en teoría permite un ataque de temporización; en la práctica el
throttler y el ruido de red lo hacen inviable.
**Bien:** con `API_KEY` vacía o sin definir el guard falla cerrado (401). No
hay fail-open.
**Matiz:** el mensaje `'API_KEY is not configured on the server'` revela una
mala configuración al exterior.
**Propuesta:** `crypto.timingSafeEqual` sobre hashes SHA-256; mensaje 401
unificado; validar `API_KEY` al arrancar (fail-fast).

### [BAJA] 6. Autorización de un solo nivel y `GET` sin paginación
**Dónde:** `notifications.controller.ts` (`findAll`, `findOne`),
`notifications.service.ts` (`find()` sin límite).
**Qué pasa:** una única API key global da acceso a todas las notificaciones
(destinatarios, asunto y cuerpo, posiblemente con datos personales) y a los
endpoints de DLQ. No hay identidad por cliente ni separación de privilegios.
`findAll` devuelve toda la tabla.
**Propuesta:** documentar el modelo (key única, un solo consumidor) en
`DECISIONES.md`; paginar `findAll` con tope; considerar una key o rol aparte
para `dlq/*`, porque el retry reenvía mensajes.

### [BAJA] 7. Datos personales en logs y alertas
**Dónde:** `slack-channel.provider.ts` (log de éxito con `recipient`) y
`notifications.service.ts` (`markAsFailed`, `alertGroup` incluyen `reason`).
**Qué pasa:** para Slack el recipient es un nombre de canal, no PII. El
`reason` es el `error.message` del proveedor y los errores de Resend o Twilio
a veces citan el destinatario (posible, no verificado sin ejecutar). Los spans
OTel (`recordException`, `setStatus`) pueden llevar ese mensaje.
**Mitigante:** el job nunca guarda el recipient (solo `{id}`), coherente con
`CLAUDE.md`.
**Propuesta:** enmascarar emails y teléfonos con regex en `reason` antes de
loguear o alertar; no loguear el recipient en Slack.

### [BAJA] 8. Validación de entrada: huecos menores
**Dónde:** `dto/create-notification.dto.ts`,
`dto/validators/recipient-format.validator.ts`, `email-channel.provider.ts`.
- `recipient` sin `@IsString()` ni `@MaxLength(200)`; la columna es
  `varchar(200)`: un recipient largo pasa el DTO y falla al insertar (500 y,
  con el hallazgo 1, filtra el error de Postgres). Un array o número se
  coerciona a string en el regex.
- El regex de email es permisivo (admite `<`, `>` y comas).
- `body` se envía como `html:` sin sanitizar. Es un diseño (cliente
  autenticado y de confianza), pero permite inyectar enlaces desde la API en
  correos con remitente legítimo.
- Swagger describe `sms` pero `@IsIn` acepta `phone`: inconsistencia de
  documentación.
- Positivo: `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y
  `transform`.
**Propuesta:** `@IsString() @MaxLength(200)` en `recipient`; decidir y
documentar la política de HTML en `body`.

## Revisado y sin hallazgos

- **Secretos en el historial git:** 19 commits revisados con patrones de
  Resend, Twilio, Slack, AWS y asignaciones `*SECRET/TOKEN/PASSWORD/API_KEY=`.
  Nada real. `.env` nunca se versionó y `.env.example` siempre estuvo vacío.
  Un commit antiguo tenía `GF_SECURITY_ADMIN_PASSWORD=admin` (contraseña por
  defecto de Grafana, ya reemplazada por una variable; no requiere rotación).
- **`npm audit`:** 29 high, todos en la cadena de jest 29 (desarrollo);
  `npm audit --omit=dev` da 0. El `Dockerfile` instala solo producción en la
  etapa final.
- **Swagger fuera de producción:** coherente con `CLAUDE.md`. Es lista negra:
  con `NODE_ENV` sin definir queda activo.
- **Redacción de URLs en spans OTel:** correcta para Slack y Resend en los
  hooks de `http` y `undici`.
- **Consumer SQS:** el `JSON.parse` está dentro del `try/catch`; consultas
  parametrizadas (sin SQL crudo en todo `src`). Robustez menor: un id no uuid
  retrasa 5 s el lote restante, y `SQS_QUEUE_URL` sin definir detiene el
  polling con solo un log de error.
- **Endpoint de reintento de DLQ:** protegido por `ApiKeyGuard`; verifica
  existencia y estado `failed`. *(La auditoría de arquitectura halló que el
  reintento no reenvía: ver su informe.)*
- **Webhooks entrantes:** el proyecto no recibe ninguno; no aplica.
- **`helmet` activo; sin CORS** (coherente con una API servidor a servidor).
- **Dockerfile:** multi-stage, pero corre como root (sin `USER`) y no hay
  `.dockerignore`: recomendado endurecerlo.

## No se pudo revisar

Comportamiento en ejecución (el 500 con `GET /notifications/abc`, el
contenido real de errores de Resend y Twilio); la configuración real de la
cola SQS (no hay infraestructura como código); `docker/prometheus` y
`docker/tempo` en detalle; las imágenes `:latest` con un escáner; los tests
como cobertura de seguridad (no hay tests del guard ni del filtro).
