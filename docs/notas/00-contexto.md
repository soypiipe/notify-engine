# Fase 0 — Contexto

Escrita el 2026-10-05 durante la migración a la metodología, a partir del
`README.md` y del historial de git. El primer commit es del 2026-05-18.

## Qué es y de dónde viene

Un motor de notificaciones multicanal y asíncrono con NestJS: una aplicación
hace `POST` de una notificación, el motor la persiste, la encola y la
entrega por email, Slack o SMS, con reintentos, ruta de dead-letter y
trazas distribuidas. Se inspira en servicios como Novu, Knock y SendGrid.

Empezó como la migración de un sistema .NET de certificados de documentos a
NestJS y creció hasta ser un ejercicio deliberado de arquitectura: cómo
construir un sistema donde la tecnología de cola y el canal de entrega sean
intercambiables sin que ninguna de las dos decisiones se filtre a la lógica
de negocio. Es una pieza de portafolio técnico.

## Alcance

**Entra:** API de notificaciones con validación y autenticación por API key,
persistencia, cola intercambiable (BullMQ o SQS), canales email, Slack y
SMS, reintentos, DLQ, observabilidad con OpenTelemetry.

**No entra (límites que el README declara):**
- Un endpoint para inspeccionar el DLQ de SQS: se inspecciona con
  herramientas de AWS.
- Verificar SMS en vivo con Twilio: el canal está integrado pero no se ha
  probado con credenciales reales (Fase 11).
- Otros canales (el `CLAUDE.md` viejo mencionaba WhatsApp como ejemplo de lo
  que la abstracción permitiría; no existe código para él).

## Estado al migrar (2026-10-05)

Flujo de punta a punta en ambos caminos de cola, tres canales, trazas en
Tempo, 12 tests unitarios en verde. Las Fases 0 a 6 del plan están hechas;
lo pendiente entonces era la auditoría independiente, CI, reconciliación de
`'sending'`, pruebas e2e y la deuda de lint. El estado vigente está en
`../PLAN.md`: ese mismo día se hizo la auditoría y se corrigió su hallazgo alto.
