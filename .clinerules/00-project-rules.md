# Reglas del proyecto — Intercom App

## Regla fundamental

Este proyecto sigue **Spec-Driven Development con OpenSpec**. No se escribe código sin un cambio abierto en `openspec/changes/`. El ciclo es `/opsx-propose` → `/opsx-apply` → `/opsx-archive` (workflows en `.clinerules/workflows/`). Si el código y los artefactos del cambio divergen, o se corrige el código o se actualiza el artefacto — nunca se dejan desalineados.

## Dónde vive la metodología

**`openspec/config.yaml` es el source of truth del proyecto**: stack, convenciones, diseño, seguridad, disciplina TDD y el gate de revisión. La CLI lo inyecta automáticamente al escribir artefactos y al ejecutar `apply`/`archive`, así que no lo repitas aquí ni lo copies a ningún artefacto. Este fichero solo recoge lo que aplica **fuera** de ese flujo.


## Flujo de Git

- **Toda spec nueva empieza en su propia rama**: antes de `/opsx-propose`, crear `feature/<nombre-del-cambio>` desde `master`. No se trabaja directamente en `master`.
- **Todo cambio se cierra con un PR a `master`**, nunca con push directo.
- Un fix puntual sin cambio OpenSpec abierto sigue el mismo patrón: rama + PR, nunca directo a `master`.
- **Esto es disciplina documentada, no un gate técnico** — responsabilidad de quien commitea, agente o humano.

## Memoria del proyecto (leer al empezar a trabajar aquí)

`memory/` es memoria **del proyecto**. Nadie te la carga automáticamente — léela tú:

- `memory/context.md` — estado actual y próximo hito.
- `memory/decisions.md` — ADRs.
- `memory/sessions/` — resúmenes de sesiones largas.

## Reglas de edición (aplican siempre, también en un fix suelto sin cambio abierto)

- **`data-cy` obligatorio**: todo elemento interactivo o localizable por un test lleva `data-cy="<contexto>-<tipo>-<accion>"` único.
- **Nunca hardcodear** color, fuente, espaciado, sombra ni radio: siempre `var(--token)` de `src/shared/styles/tokens.css`.
- **Sin CSS inline** salvo animación o posicionamiento dinámico justificado.
- **Componentes compartidos** van en `src/shared/`, nunca duplicados entre dominios.
- **JSDoc conciso** en todo símbolo exportado.
- **Nunca secretos** en código.

## Autorización explícita

- No modificar `openspec/config.yaml`, `CLAUDE.md`, este fichero ni `.clinerules/workflows/` sin avisar antes.
- No commitear archivos generados o temporales, ni `.env` con valores reales.
- No mencionar a ningún asistente de IA en mensajes de commit ni en PRs.

## Idioma

Documentación, specs y artefactos en español. Código en inglés (identificadores y comentarios). Commits consistentes dentro del mismo PR.
