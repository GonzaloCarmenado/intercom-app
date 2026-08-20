# Métricas de fallos del SDLC

Log de eventos de proceso — no de la app, no de tokens, no de productividad. Registra
dónde falla el propio flujo de trabajar con un agente en este repo (OpenSpec,
`CLAUDE.md`, memoria).

**Fase actual: solo recopilación.** No hay script de agregación ni dashboard.

## Formato

`events.jsonl` — JSON Lines: un objeto JSON por línea, append-only. Nunca se
reescriben líneas ya escritas; un evento nuevo siempre se añade al final.

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `date` | string | Fecha ISO `YYYY-MM-DD`. |
| `change` | string | Nombre del cambio OpenSpec en curso (kebab-case), o `"none"`. |
| `stage` | string | `propose` \| `apply` \| `archive` \| `commit` \| `ci` \| `review` \| `other`. |
| `category` | string | Una de la taxonomía de abajo. |
| `detected_by` | string | `self` \| `user`. |
| `description` | string | Qué pasó y por qué, con ruta de fichero si aplica. |

### Ejemplo

```json
{"date":"2026-08-20","change":"none","stage":"other","category":"scope-violation","detected_by":"self","description":"create-tauri-app --force vació el directorio de trabajo (incl. .claude/settings.local.json y el scaffold de OpenSpec recién generado) al no ser --force un flag de sobrescritura selectiva."}
```

## Taxonomía (categorías cerradas)

- **`memory-miss`** — el agente actuó sin haber leído o aplicado algo ya documentado
  en `memory/context.md` o `memory/decisions.md`.
- **`gate-bypass`** — commit/push/merge/PR lanzado sin pasar los quality gates
  localmente, y falló después.
- **`scope-violation`** — se tocó un fichero bajo autorización explícita de
  `CLAUDE.md` sin avisar antes, o se hizo push directo a la rama principal.
- **`spec-drift`** — código y artefactos OpenSpec quedaron desalineados al cerrar
  un cambio.
- **`rework`** — el usuario tuvo que corregir el enfoque técnico del agente dentro
  de la misma tarea.
- **`other`** — cualquier fallo real de proceso que no encaje en las anteriores.

## Cuándo registrar

Ver `CLAUDE.md` § Métricas de fallos del SDLC.
