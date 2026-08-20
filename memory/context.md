# Contexto del Proyecto: Intercom App

## Identidad
- **Nombre**: Intercom App
- **Propósito**: la app actúa ella misma como intercomunicador de voz entre piloto y
  copiloto de la misma moto (uno pegado al otro), sin depender de hardware tipo
  Cardo/Sena. Target prioritario Android.
- **Repositorio**: D:\Git\Otros\intercom-app (público, `https://github.com/GonzaloCarmenado/intercom-app`)

## Stack Tecnológico
- **Frontend**: TypeScript + Vite + Web Components nativos (sin framework), patrón
  `.element.ts/.css` + `.service.ts` + `.transform.ts` + `.types.ts` + `.spec.ts`,
  igual que moto-routes. Vitest + ESLint (strictTypeChecked + stylistic + jsdoc),
  cobertura mínima 80%.
- **Backend móvil/desktop**: Rust + Tauri 2.
- **Persistencia local**: SQLite vía `@tauri-apps/plugin-sql` (dependencia añadida,
  sin uso todavía — el primer cambio no necesita persistencia).
- **Servicio de señalización**: Go (`signaling/`), independiente del frontend.
- **Comunicación de voz**: WebRTC P2P entre los dos móviles, señalización mínima en
  servidor propio (sin BBDD), emparejamiento por código efímero. Detalle completo en
  `openspec/config.yaml` (`context:`).

## Estado actual (2026-08-20)
Cambio `llamada-voip-piloto-copiloto` en `/opsx:apply`, bloques 0-6 completos y
**mergeados a `master`** (PR #1). Bloque 7 (verificación con dispositivos Android
reales) empezado pero no cerrado — ver más abajo. Bloque 8 (cierre) sin empezar.

### Backend real desplegado y funcionando
- `wss://debian.taildf3dab.ts.net/intercom-ws/ws` — servidor Debian compartido con
  moto-routes, expuesto vía Tailscale Funnel **por path** (`/intercom-ws`), coexistiendo
  con la ruta raíz `/` de `apps/api` sin tocarla.
- Contenedor `intercom-signaling-signaling-1`, proyecto Docker Compose
  `intercom-signaling` (nombre explícito — ver ADR-004, evita colisión con el proyecto
  "docker" de moto-routes, que vive en la misma ruta relativa `infra/docker/`).
- Probado de extremo a extremo desde fuera del tailnet (creación de sala real por
  WebSocket público).

### Bloque 7 — pendiente de verificación de campo
- Smoke test hecho en emulador Android apuntando al backend real: la app compila,
  instala y carga sin errores de CSP ni crash con la configuración de producción
  (`VITE_SIGNALING_WS_URL` real, CSP con host exacto). **No pude completar la
  interacción**: los taps sintéticos de `adb input tap`/`touchscreen swipe` no
  disparan el `click` de los botones dentro de esta WebView de Tauri en este
  emulador — probado con varias variantes, sin resultado. Limitación de la
  herramienta de automatización, no confirmado como bug de la app.
- Las tres tareas reales de este bloque (7.1 llamada completa piloto-copiloto,
  7.2 background/pantalla bloqueada, 7.3 cambio de red en carretera) **siguen
  necesitando dos dispositivos Android reales y una persona probándolo a mano** —
  son verificación manual por diseño (spec.md), no automatizable ni por mí ni por
  un emulador.

## Progreso técnico por bloque
- **0** (spike bloqueante): confirmado en Android real (realme GT 2 Pro) que
  `getUserMedia`/`RTCPeerConnection` funcionan en la WebView de Tauri. El
  "Permission denied" inicial era por falta de `MODIFY_AUDIO_SETTINGS` en el
  manifest junto a `RECORD_AUDIO` — wry ya trae el puente de permisos, no hizo
  falta código Kotlin nuevo.
- **1** (`signaling/`, Go): sala en memoria con TTL, WebSocket con reenvío de
  señalización, rate limiting por IP, colgar + reconexión con margen de gracia de
  60s vía token por participante (ADR-002).
- **2-3** (`src/pairing/`, `src/call/`): `pairing-screen` se sustituye a sí mismo
  por `call-screen` al emparejar (`peer-joined`), y viceversa al colgar o recibir
  `peer-left` — sin componente orquestador, cada pantalla se sustituye a sí misma
  en el DOM.
- **4** (red y reconexión): `network.transform.ts` (ranking puro WiFi>5G>4G>3G) +
  `network.service.ts` (detección real — ADR-003: ninguna API web distingue 5G de
  4G de verdad). Reconexión de señalización con backoff exponencial (1s→8s, techo
  60s) + `pc.restartIce()` al recuperar, sin repetir el emparejamiento.
- **5** (seguridad): CSP estricta con host real, sin `unsafe-eval`.
- **6** (infra): Dockerfile + compose + script de despliegue, verificado con build
  y arranque reales tanto en local como en el servidor de producción.

## Próximo hito
- Verificación de campo del bloque 7 con dos móviles reales (pendiente del usuario).
- Cerrar el bloque 8 (memoria/decisiones) y archivar el cambio cuando 7 esté hecho.

## Entorno de desarrollo (esta máquina)
- JDK de Android Studio es la 25, que Gradle 8.14.3 no soporta — fijar `JAVA_HOME` a
  `C:\Program Files\Java\jdk-24` al lanzar `tauri android dev` (ruta local, no
  versionar). Lanzarlo desde **PowerShell**, no Bash: el hook `rtk` se cuelga sin
  producir salida al combinarse con un `JAVA_HOME=...` inline.
- Acceso SSH al servidor de producción vía Tailscale: `ssh gonzalo@debian` (usuario
  confirmado, mismo que usa moto-routes).

## Fallos de proceso registrados (ver `memory/metrics/events.jsonl` para el detalle)
- Push directo a `master` dos veces tras mergear el PR #1 (en vez de rama+PR) —
  corregido en el momento, sin daño real.
