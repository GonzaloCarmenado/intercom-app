# Contexto del Proyecto: Intercom App

## Identidad
- **Nombre**: Intercom App
- **Propósito**: Intercomunicador de voz P2P/red local. Target prioritario Android.
- **Repositorio**: D:\Git\Otros\intercom-app

## Stack Tecnológico
- **Frontend**: TypeScript + Vite + Web Components nativos (sin framework)
- **Backend móvil/desktop**: Rust (Tauri 2)
- **Persistencia local**: SQLite vía `@tauri-apps/plugin-sql` (dependencia añadida, sin uso todavía)
- **Comunicación de voz**: WebRTC P2P entre los dos móviles (piloto/copiloto de la
  misma moto), señalización mínima en servidor propio, emparejamiento por código/QR
  efímero sin BBDD persistente. Bluetooth como transporte alternativo queda fuera del
  primer cambio. Detalle completo en `openspec/config.yaml` (`context:`).

## Estado actual
- 2026-08-20: estructura general (OpenSpec + gobernanza + scaffold de Tauri) generada
  y subida a `https://github.com/GonzaloCarmenado/intercom-app` (público, rama `master`).
- 2026-08-20: definida la arquitectura de comunicación con el usuario (ver
  `openspec/config.yaml`). Abierta rama `feature/llamada-voip-piloto-copiloto` para el
  primer cambio de OpenSpec (`llamada-voip-piloto-copiloto`): llamada VoIP entre piloto
  y copiloto, sin Bluetooth ni persistencia.
- Backend: se reutilizará el servidor propio de moto-routes (Debian, Tailscale, mismo
  patrón de despliegue SSH — ver `scripts/deploy-prod.sh` en moto-routes). Restricción
  crítica: huella mínima para no sobrecargar ese servidor, ya que sirve la API y el
  PostgreSQL de moto-routes.

## Próximo hito
- Generar proposal/specs/design/tasks del cambio `llamada-voip-piloto-copiloto` con
  `openspec new change` y avanzar a `/opsx:apply`.
