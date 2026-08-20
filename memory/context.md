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
- Continuar `/opsx:apply` de `llamada-voip-piloto-copiloto` en el bloque 4 (selección
  de red y reconexión).

## Progreso de `llamada-voip-piloto-copiloto`
- Bloques 0-3 completados el 2026-08-20 (spike, servicio de señalización en Go,
  pantalla de emparejamiento, pantalla de llamada). 39 tests (Vitest) + 17 tests (Go)
  en verde, ESLint y `tsc --noEmit` limpios.
- Tarea 0.1 (spike bloqueante) completada en dispositivo Android real (realme GT 2
  Pro): `getUserMedia`/`RTCPeerConnection` funcionan en la WebView de Tauri. Causa del
  "Permission denied" inicial: faltaba `MODIFY_AUDIO_SETTINGS` en el manifest junto a
  `RECORD_AUDIO`. No hizo falta código Kotlin nuevo — wry ya trae el puente de permisos.
- Bloque 1: `signaling/` (módulo Go independiente) — sala en memoria con TTL, WebSocket
  con reenvío de señalización, rate limiting por IP, colgar + reconexión con margen de
  gracia de 60s vía token por participante (ADR-002, gap real encontrado en 1.9/1.10).
- Bloques 2-3: `src/pairing/` y `src/call/` (Web Components). Al no existir todavía
  Vitest/ESLint en el proyecto, se montaron en el bloque 2 (config igual que
  moto-routes: strictTypeChecked + stylistic + jsdoc, cobertura mínima 80%).
  `pairing-screen` se sustituye a sí mismo por `call-screen` en cuanto se empareja
  (mensaje `peer-joined`), y `call-screen` hace lo inverso al colgar o al recibir
  `peer-left` del servidor — sin componente orquestador superior, cada pantalla se
  sustituye a sí misma en el DOM.
- Entorno de desarrollo Android en esta máquina: JDK de Android Studio es la 25, que
  Gradle 8.14.3 no soporta — hay que fijar `JAVA_HOME` a `C:\Program Files\Java\jdk-24`
  al lanzar `tauri android dev` (no versionar esa ruta, es local de esta máquina).
  Además, lanzar ese comando desde Bash pasa por el hook `rtk`, que se queda colgado
  sin producir salida cuando se combina con un `JAVA_HOME=...` inline — usar el
  tool de PowerShell para `tauri android dev`, no Bash.
