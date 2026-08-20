# CLAUDE.md — Intercom App

## Regla fundamental

Este proyecto sigue **Spec-Driven Development con OpenSpec**. No se escribe código sin un cambio abierto en `openspec/changes/`. El ciclo es `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Si el código y los artefactos del cambio divergen, o se corrige el código o se actualiza el artefacto — nunca se dejan desalineados.

## Dónde vive la metodología

**`openspec/config.yaml` es el source of truth del proyecto**: stack, convenciones, diseño, seguridad, disciplina TDD y el gate de revisión. La CLI lo inyecta automáticamente al escribir artefactos y al ejecutar `apply`/`archive`, así que no lo repitas aquí ni lo copies a ningún artefacto. Este fichero solo recoge lo que aplica **fuera** de ese flujo.

> **Pendiente**: `openspec/config.yaml` todavía no tiene `context:`/`rules:` rellenos — se
> generó vacío a propósito. Se completa en la próxima conversación, cuando se decida la
> arquitectura de red/audio P2P y el resto de convenciones concretas.

## Flujo de Git

- **Toda spec nueva empieza en su propia rama**: antes de `/opsx:propose`, crear `feature/<nombre-del-cambio>` desde `master`. No se trabaja directamente en `master`.
- **Todo cambio se cierra con un PR a `master`**, nunca con push directo — incluso después de un `/opsx:archive` con veredicto `APPROVED`/`APPROVED WITH MINOR ISSUES`.
- Un fix puntual sin cambio OpenSpec abierto (bug urgente, ajuste menor) sigue el mismo patrón: rama + PR, nunca directo a `master`.
- **Esto es disciplina documentada, no un gate técnico**: ningún hook ni configuración de GitHub impide hoy saltárselo. Es responsabilidad de quien commitea, agente o humano, cumplirlo igualmente.

## Memoria del proyecto (leer al empezar a trabajar aquí)

`memory/` es memoria **del proyecto**, no la memoria personal de Claude. Nadie te la carga automáticamente — léela tú:

- `memory/context.md` — estado actual y próximo hito. Cárgalo antes de tocar código.
- `memory/decisions.md` — ADRs. Consúltalo antes de revertir o cuestionar una decisión ya tomada; si tomas una nueva, añade el ADR aquí.
- `memory/sessions/` — resúmenes de sesiones largas.

## Métricas de fallos del SDLC

`memory/metrics/events.jsonl` recoge fallos del propio proceso de trabajar con un agente en este repo — no de la app, no de tokens, no de productividad. Esquema y taxonomía completos en `memory/metrics/README.md`. Esta regla aplica **siempre**, no solo dentro de `/opsx:*`: varios de los fallos a capturar ocurren fuera de ese flujo — un `git push` suelto, una PR fusionada sin pasar los gates, un fix puntual sin cambio abierto.

## Reglas de edición (aplican siempre, también en un fix suelto sin cambio abierto)

> **Pendiente**: estas reglas son las mismas que en `moto-routes` (mismo stack de
> frontend) pero conviene confirmarlas para este proyecto antes de darlas por definitivas.

- **`data-cy` obligatorio**: todo elemento interactivo o localizable por un test lleva `data-cy="<contexto>-<tipo>-<accion>"` único, añadido en su propio `.element.ts` al crearlo. Nunca selectores de clase, ID o posición DOM en tests.
- **Nunca hardcodear** color, fuente, espaciado, sombra ni radio: siempre `var(--token)` de una hoja de tokens compartida (ubicación a definir). Hitbox mínima a definir según uso previsto de la app.
- **Sin CSS inline** salvo animación o posicionamiento dinámico justificado.
- **Componentes compartidos** van en `src/shared/`, nunca duplicados entre dominios.
- **JSDoc conciso** (qué y por qué, no cómo) en todo símbolo exportado.
- **Nunca secretos** en código — van a variables de entorno o GitHub Secrets. Solo claves públicas pueden vivir en código.

## Autorización explícita

- No modificar `openspec/config.yaml`, este `CLAUDE.md`, `.clinerules/`, `.claude/commands/` ni `.claude/skills/` sin avisar antes — son la definición del propio workflow.
- No commitear archivos generados o temporales, ni `.env` con valores reales.
- No mencionar a Claude ni a ningún asistente en mensajes de commit ni en PRs.

## Idioma

Documentación, specs y artefactos en español. Código en inglés (identificadores y comentarios). Commits consistentes dentro del mismo PR.
