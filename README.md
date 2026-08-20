# Intercom App

Intercomunicador de voz P2P/red local. Target prioritario Android.

> Proyecto en fase inicial: estructura general y metodología (OpenSpec) montadas,
> stack de audio/red y funcionalidad todavía por definir.

## Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Frontend | TypeScript + Vite + Web Components nativos |
| Backend móvil/desktop | Rust (stable, edition 2021) |
| Framework | Tauri 2 |
| BBDD local | SQLite vía `@tauri-apps/plugin-sql` |
| Metodología | Spec-Driven Development sobre OpenSpec |

## Desarrollo

```bash
npm install
npm run tauri dev        # desktop
npm run tauri android dev # Android (requiere `npm run tauri android init` antes)
```

## Metodología

Este proyecto sigue Spec-Driven Development con [OpenSpec](https://github.com/Fission-AI/OpenSpec).
Ver `CLAUDE.md` / `.clinerules/00-project-rules.md` para la regla fundamental y el
flujo de trabajo.
