# Fase 4 — Multicanal

Escrita el 2026-10-05 desde el historial de git y el código.

## Qué se hizo, según el historial

- `55b4f33` (2026-06-27): se introducen `IChannel`, `ClassifierService` y los
  tres providers (email, Slack, SMS), y se borran los archivos de ejemplo de
  Nest (`app.controller.ts`, `app.service.ts`).
- `b8453f7` (2026-09-17): "bloque C" completo.

## Orden entre esta fase y la Fase 6: SUPOSICIÓN

El commit `b8453f7` junta en un solo cambio de 24 archivos el cierre del
multicanal **y** casi todo el endurecimiento de la Fase 6 (API key,
throttler, helmet, idempotencia, tests, README). El historial de git no
permite separar qué parte es de cada fase. El orden "multicanal primero,
endurecimiento después" viene de la estructura de la autoauditoría, que
numera sus propias fases, y no de commits distintos. Se presenta como
organización, no como cronología verificada.

## Estado de SMS

`SmsChannel` está implementado con Twilio, pero nunca se ejecutó con
credenciales reales. Sin las tres variables `TWILIO_*` devuelve
`{ success: false, error: 'Twilio client not configured' }`. La documentación
anterior lo describía como un scaffold sin Twilio, y eso ya no era cierto
(el commit `b8453f7` modifica el provider y `package.json`; no se verificó
en qué punto exacto dejó de ser un scaffold). Se corrigió en la migración.
