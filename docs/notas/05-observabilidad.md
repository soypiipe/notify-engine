# Fase 5 — Observabilidad

Escrita el 2026-10-05 desde el historial de git y el código.

## Qué hay

Trazas OpenTelemetry exportadas por OTLP/HTTP a Grafana Tempo, más
Prometheus y Grafana en `docker-compose.yml` (`docker/tempo/tempo.yaml`,
`docker/prometheus/prometheus.yml`). La redacción de URLs sensibles en los
spans salientes es de la Fase 6 (ítem 9).

## Orden: SUPOSICIÓN

Esta fase aparece después de multicanal en el plan, pero **eso es
organización mía, no cronología**. Las dependencias de OpenTelemetry y la
infraestructura de Tempo y Prometheus entran en el historial en el commit
`3e7aa3f` (2026-06-09), el mismo de la abstracción de cola, es decir, antes
del multicanal. No hay commits propios de observabilidad que permitan
fechar cuándo las trazas quedaron funcionando de punta a punta.

## Abierto

Prometheus está desplegado, pero ninguna fuente documenta qué métricas
expone la aplicación ni qué se grafica; no se afirma nada al respecto.
La razón de elegir Tempo está como `[RAZÓN NO DOCUMENTADA]` en
`DECISIONES.md`.
