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
- Continuar `/opsx:apply` de `llamada-voip-piloto-copiloto` en el bloque 7
  (verificación en dos dispositivos Android reales) — pendiente de un segundo
  dispositivo/persona para probar la llamada real piloto-copiloto.

## Despliegue real (bloques 5-6, 2026-08-20)
- Backend desplegado y verificado de extremo a extremo en el servidor compartido
  con moto-routes (`debian`, Tailscale): `wss://debian.taildf3dab.ts.net/intercom-ws/ws`
  (Funnel por path, coexistiendo con la ruta raíz `/` de `apps/api` sin tocarla).
  Contenedor `intercom-signaling-signaling-1`, proyecto Compose `intercom-signaling`.
- PR #1 mergeado a `master` para poder desplegar (el flujo normal exige archivar
  antes de PR, pero se acordó con el usuario adelantar el merge para no bloquear
  el despliegue real — bloques 7-8 quedan para un cambio/PR posterior sobre esta
  misma base).
- Bug real encontrado al desplegar (ADR-004): sin `name:` explícito, Docker Compose
  deriva el proyecto del directorio contenedor (`docker`, coincide con moto-routes
  por vivir ambos en `infra/docker/`) — se vio como aviso de "orphan container
  docker-api-1" (el de moto-routes). Corregido antes de que causara daño real.

## Progreso de `llamada-voip-piloto-copiloto`
- Bloques 0-4 completados el 2026-08-20 (spike, servicio de señalización en Go,
  pantalla de emparejamiento, pantalla de llamada, selección de red + reconexión).
  59 tests (Vitest) + 17 tests (Go) en verde, ESLint y `tsc --noEmit` limpios,
  cobertura >80% en las tres métricas.
- Bloque 4: `src/shared/network.transform.ts` (ranking WiFi>5G>4G>3G, función pura) +
  `network.service.ts` (detección real, best-effort — ver ADR-003: ninguna API web
  distingue 5G de 4G de verdad, solo WiFi vs. datos móviles es fiable). Reconexión de
  señalización con backoff exponencial (1s→8s) y presupuesto de 60s (igual que el
  margen de gracia del servidor) en `call.service.ts`, con renegociación ICE
  (`pc.restartIce()`) al recuperar conexión — sin repetir el emparejamiento.
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
