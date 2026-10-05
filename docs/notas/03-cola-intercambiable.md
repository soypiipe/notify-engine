# Fase 3 — Cola intercambiable (BullMQ / SQS)

Escrita el 2026-10-05 desde el historial de git y el README.

## Qué se hizo, según el historial

- `3e7aa3f` (2026-06-09): abstracción de cola con el patrón adapter.
- `40182a6` (2026-06-15): "bloque B" completo con el patrón de selección.
- `09213ad` (2026-06-17): consumer de SQS con polling y procesamiento.

## Por qué quedó así

La lógica de enviar vivía dentro de `NotificationProcessor`, específico de
BullMQ. Cuando llegó el consumer de SQS necesitaba exactamente el mismo
comportamiento y se rechazó duplicarlo: pasó a `processAndSend()` en
`NotificationsService`. Ver `DECISIONES.md`.

## Pendiente de esta época que se cerró después

Con SQS, una notificación fallida quedaba en `'pending'` para siempre y el
worker de BullMQ exigía Redis aunque el provider fuera SQS. Ambas cosas se
resolvieron en la Fase 6 (ítems 5 y 6).

## Nota sobre el orden

La infraestructura de observabilidad (Tempo, Prometheus) y las dependencias
de OpenTelemetry aparecen en este mismo commit `3e7aa3f`. La Fase 5 las
documenta aparte.
