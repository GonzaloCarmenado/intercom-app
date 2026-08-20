# Contexto del Proyecto: Intercom App

## Identidad
- **Nombre**: Intercom App
- **Propósito**: Intercomunicador de voz P2P/red local. Target prioritario Android.
- **Repositorio**: D:\Git\Otros\intercom-app

## Stack Tecnológico
- **Frontend**: TypeScript + Vite + Web Components nativos (sin framework)
- **Backend móvil/desktop**: Rust (Tauri 2)
- **Persistencia local**: SQLite vía `@tauri-apps/plugin-sql` (pendiente de añadir)
- **Arquitectura de red/audio P2P**: pendiente de decidir — no resuelto todavía, no
  asumir ninguna librería o protocolo concreto hasta que se hable y quede como ADR.

## Estado actual
- Proyecto recién creado (2026-08-20): estructura general (OpenSpec + gobernanza +
  scaffold de Tauri) generada, sin funcionalidad implementada todavía.

## Próximo hito
- Definir en conversación la arquitectura de red/audio P2P antes de abrir el primer
  cambio de OpenSpec.
