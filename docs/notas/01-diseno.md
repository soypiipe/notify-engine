# Fase 1 — Diseño

Escrita el 2026-10-05 desde el historial de git y el README.

## Qué hubo

- El contrato de API con OpenAPI y validación entró en el commit `34919fa`
  (2026-05-18), antes de cualquier persistencia.
- La entidad `Notification` entró con la persistencia TypeORM, en `e0f0810`
  (2026-05-23).

## Lo que NO fue diseño previo

Las interfaces `IQueue` e `IChannel` no se diseñaron en esta fase: aparecen
más tarde, `IQueue` en `3e7aa3f` (2026-06-09) e `IChannel` en `55b4f33`
(2026-06-27). Por eso viven en las Fases 3 y 4 y no aquí. El README lo dice
así: cada decisión nació de una restricción real durante el desarrollo, no
de un diseño elegido de antemano.

## Abierto

Las razones de las decisiones técnicas de arranque (framework, ORM) no
están escritas en ninguna parte; quedan como `[RAZÓN NO DOCUMENTADA]` en
`DECISIONES.md`.
