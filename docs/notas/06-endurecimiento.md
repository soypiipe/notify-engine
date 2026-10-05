# Fase 6 — Endurecimiento (autoauditado)

Escrita el 2026-10-05 desde `auditorias/2026-09-17-autoauditoria.md`. La
razón de cada decisión está en `DECISIONES.md`; aquí va lo que no cabe allí.

## Quién la hizo

La misma sesión de IA que escribió el código. Por eso la Fase 7 pide una
auditoría independiente: esta no cuenta como tal.

## Orden: SUPOSICIÓN en parte

El orden de los ítems (Fases 0 a 5 de la autoauditoría: multer, auth y rate
limit, idempotencia, simetría de colas, higiene, limpieza) viene del propio
documento de la autoauditoría. El historial de git no lo respalda: casi todo
aterrizó en un solo commit, `b8453f7` (2026-09-17), junto con el cierre del
multicanal. Lo único con commit propio y anterior es la corrección de
vulnerabilidades de npm de `91518cc` (2026-06-18).

## Verificado el 2026-10-05

- Se confirmó en el código la API key, el throttler, helmet, el claim
  atómico, `markAsFailed` en ambos providers, el registro condicional de
  BullMQ, el batch query del DLQ, la redacción de URL en OTel, Swagger
  condicionado y la implementación de Twilio. Los 12 tests pasan.
- **El ítem 1 se desactualizó:** la autoauditoría cerró `npm audit` en 0;
  hoy reporta 36 vulnerabilidades (3 moderate, 33 high), incluida una nueva
  sobre multer 2.2.0–2.3.0. Es advisories posteriores, no una regresión del
  trabajo de entonces. Va a la Fase 7.
- **El ítem 7 estaba mal documentado:** decía que la sección de DLQ estaba
  en el README, pero el commit `a7c326d` (reescritura del README) la había
  eliminado. Se restauró desde `b8453f7` en la migración.
- **El ítem 14 describe mal `synchronize`.** Ver `DECISIONES.md`.

## Anécdota de proceso: un proceso huérfano contaminando las pruebas

Durante la FASE 4 de la autoauditoría apareció un `node dist/main.js`
corriendo desde antes de que esa sesión empezara a trabajar (probablemente
de una sesión manual previa), escuchando en el puerto 3000 y conectado al
mismo Redis, Postgres y `.env`. Era un segundo worker de BullMQ y consumer
de SQS compitiendo en silencio contra cada notificación de prueba. Explica
el "puerto 3000 ocupado, no relacionado" que se anotó en verificaciones
anteriores (Fase 2 de la autoauditoría, ítem 4 de la Fase 4) y por qué la
verificación del ítem 9 parecía fallar de forma sistemática: la causa no era
el hook de OTel. Se terminó con `kill -9`.

Lección: si hay notificaciones procesándose sin haber arrancado
`npm run start:dev`, o jobs en el DLQ que no se reconocen, revisar
`ps aux | grep dist/main` antes de asumir un bug del código.

## Otros hallazgos de la autoauditoría que siguen abiertos

- Filas atascadas en `'sending'` sin detección ni alerta (Fase 9).
- `npm run lint` lleva `--fix` y reformatea todo `src/` (el código usa 4
  espacios y comillas simples; la config declara otra cosa), y reporta ~57
  errores previos (Fase 11).
- No se escribió spec de `SlackChannel` ni un e2e real (Fase 10).
