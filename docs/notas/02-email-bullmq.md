# Fase 2 — Notificación asíncrona por email con BullMQ

Escrita el 2026-10-05 desde el historial de git. Es corta a propósito: no
hay notas de esa época, y no se inventa historia que no esté escrita.

## Qué se hizo, según el historial

- `e0f0810` (2026-05-23): API de notificaciones con persistencia TypeORM.
  `c77ba38` (mismo día): README del "bloque A".
- `3e08d53` (2026-05-26): procesamiento asíncrono con BullMQ.
- `2f83bb8` (2026-05-30): dead-letter con reintento manual.

El envío por email con Resend aparece en el historial desde `91518cc`
(2026-06-18), en un commit cuyo mensaje habla de vulnerabilidades de npm; el
historial no dice cuándo funcionó por primera vez de punta a punta.

## Cómo quedó

El DLQ de BullMQ es la lista `failed` de la propia cola; no hay una cola
separada. Se consulta con `GET /notifications/dlq/jobs` y se reintenta con
`POST /notifications/dlq/:id/retry`.
