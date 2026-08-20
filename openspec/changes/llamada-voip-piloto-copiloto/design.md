## Context

Ver `proposal.md` - Why. Proyecto sin código todavía (solo el scaffold general del
repo): esto es la primera pieza real de la app. No hay servidor de señalización, ni
capa de red, ni pantallas todavía.

## Goals / Non-Goals

**Goals:**
- Definir el protocolo de señalización y el ciclo de vida de una sala/llamada.
- Elegir el lenguaje/framework del servicio de señalización priorizando huella mínima
  sobre el servidor compartido con moto-routes.
- Dejar explícito cómo se despliega sin acoplarse al despliegue de moto-routes.

**Non-Goals:**
- Transporte Bluetooth (cambio futuro, ver proposal.md).
- Cifrado de extremo a extremo adicional al que ya da WebRTC (DTLS-SRTP es parte del
  propio estándar; no se añade una capa propia).
- Escalar a más de una llamada activa por sala o más de dos participantes.

## Decisions

Decisión duradera registrada en `memory/decisions.md` como ADR-001 — lo de abajo es
el detalle de implementación que la sostiene, no una duplicación de su contenido.

### Audio: WebRTC nativo del WebView, sin librería npm
`RTCPeerConnection` y `getUserMedia` son APIs del navegador — el WebView de Android
que usa Tauri las soporta sin dependencia adicional. Alternativa descartada:
`webrtc-rs` en Rust puenteado a la UI vía comandos Tauri — mucho más trabajo (habría
que reimplementar captura/reproducción de audio y señalización en Rust) para un
beneficio que no está justificado todavía; se reconsidera solo si el spike de más
abajo demuestra que el WebView no es fiable.

**Riesgo conocido, no resuelto todavía**: el permiso de micrófono en un WebView de
Android (a diferencia de Chrome) tiene históricamente comportamiento irregular con
`getUserMedia` (el diálogo de permiso del sistema no siempre se dispara solo desde el
WebView). Por eso la primera tarea de `tasks.md` es un spike de verificación en
dispositivo Android real antes de construir nada más encima.

### Emparejamiento: solo código alfanumérico, sin QR en v1
Un código corto (tecleado) es suficiente para dos personas sentadas una al lado de la
otra — no justifica añadir permiso de cámara ni una librería de escaneo de QR todavía.
Generación de QR/escaneo queda como mejora futura si en el uso real resulta incómodo
teclear el código.

### Backend de señalización: Go, sin framework
Mismo lenguaje que `apps/api` de moto-routes (Go 1.25, `net/http` + una librería de
WebSocket mínima), reutilizando el patrón de despliegue ya probado (Docker +
`docker compose` + git pull vía SSH/Tailscale, ver ADR-033 de moto-routes) sin
necesidad de aprender ni mantener una segunda pila de servidor.
Alternativas consideradas:
- **Node.js + `ws`**: descartado — runtime V8 con base de memoria más alta (~30-50MB
  en reposo) que un binario Go, sin ninguna ventaja real para este caso de uso.
- **Rust (`axum` + `tokio-tungstenite`)**: huella todavía menor que Go, pero introduce
  una tercera pila de lenguaje de servidor sin patrón de despliegue ya probado en este
  servidor — se descarta por ahora a favor de consistencia operativa; reconsiderable
  si el footprint de Go resultara ser un problema real (no esperado con 1-2 llamadas
  concurrentes).

Nueva dependencia Go: una librería de WebSocket (p. ej. `coder/websocket`, mantenida y
sin dependencias transitivas pesadas) — justificada porque implementar el framing de
WebSocket a mano sobre `net/http` no aporta nada frente a usar una librería madura y
pequeña.

### Estado de sala: en memoria, sin base de datos
Un mapa protegido por mutex (`código → sala`), sin persistencia. Ciclo de vida:
- Sala creada: código válido durante una ventana corta si nadie se une (p. ej. 5
  minutos) — pasado ese tiempo, se descarta y el código deja de ser válido.
- Segundo participante se une: la sala pasa a "en llamada" y vive mientras dure la
  llamada, incluyendo reconexiones.
- Fin de sala: colgar explícito de cualquiera de los dos, o que ninguno de los dos
  WebSocket de señalización esté conectado durante un margen de gracia (p. ej. 60s)
  tras una caída — ese margen es lo que hace posible la reconexión automática sin
  perder la sala.

Justifica no usar SQLite/Postgres para esto: el estado no necesita sobrevivir a un
reinicio del proceso, y no hay ninguna consulta que se beneficie de una base de datos
real. Cumple la restricción de huella mínima del proyecto.

### NAT/TURN: solo STUN público en v1, sin TURN propio
WebRTC necesita STUN para descubrir la IP pública; en redes con NAT simétrico o
CGNAT estricto (frecuente en datos móviles) puede hacer falta un servidor TURN de
relé para completar la conexión cuando el P2P directo no es posible. Se descarta
montar un TURN propio (`coturn`) en este cambio: añadiría tráfico de audio relé
constante sobre el servidor compartido exactamente en el caso que más se quiere
evitar (llamadas activas consumiendo ancho de banda del servidor). Se usan servidores
STUN públicos conocidos. Riesgo documentado abajo.

### Despliegue: stack Docker independiente del de moto-routes
Nuevo `infra/docker/docker-compose.prod.yml` en este repo (`intercom-app`), servicio
único, `mem_limit`/`cpus` explícitos en el compose para que un fallo de este servicio
(fuga, bucle) no pueda hambrear a la API de moto-routes en el mismo host. Despliegue
por el mismo patrón SSH + Tailscale que `scripts/deploy-prod.sh` de moto-routes
(adaptado a este repo, script propio). Expuesto por Tailscale Funnel (mismo mecanismo
que usa moto-routes, ver su ADR-036) en un puerto distinto al de `apps/api`, para que
el redeploy de uno nunca dependa del otro.

### Selección de red (detalle encontrado durante `apply`, ADR-003)
La distinción WiFi > 5G > 4G > 3G del contexto del proyecto no es implementable tal
cual con APIs web estándar — ninguna distingue 5G de 4G de verdad. `network.service.ts`
reporta `wifi` / `4g` / `3g` / `unknown` (best-effort vía Network Information API);
`pickBestNetwork` sí soporta un nivel `5g` en el ranking, preparado para una fuente de
datos real (puente nativo a `TelephonyManager`) si algún día hace falta. Ver ADR-003.

### Protocolo de señalización y reconexión (detalle encontrado durante `apply`, ADR-002)
Mensajes JSON sobre WebSocket. El servidor nunca interpreta offer/answer/ICE, solo los
reenvía. Ciclo de vida:
- `GET /ws` (sin `code`): crea sala, responde `{"type":"created","code","token"}`.
- `GET /ws?code=X` (sin `token`): se une como segundo participante, responde a ambos
  `{"type":"peer-joined"}` (al segundo, con su propio `token`).
- `GET /ws?code=X&token=Y`: reconexión — solo se acepta si `token` pertenece a un
  participante ya emparejado de esa sala. Sin esto, el servidor no puede distinguir
  "el mismo peer reconectando" de "un desconocido que adivinó el código durante el
  margen de gracia" — gap real no cubierto en el diseño inicial, ver ADR-002.
- Colgar explícito: mensaje `{"type":"hangup"}` cierra la sala para los dos de inmediato.
- Caída sin hangup: margen de gracia de 60s con aviso `{"type":"reconnecting"}` al otro
  lado; reconexión a tiempo → `{"type":"peer-reconnected"}`; sin reconexión →
  `{"type":"peer-left","reason":"timeout"}` y cierre.

### Seguridad
- Código de sala generado con un generador aleatorio criptográfico (`crypto/rand`),
  no secuencial ni predecible.
- Límite de intentos de "unirse a una sala" por IP en la ventana de validez del código
  (mitiga fuerza bruta sobre un código de pocos caracteres).
- WSS (TLS) de extremo a extremo vía Tailscale Funnel — igual que ya hace `apps/api`.
- No hay tokens de sesión ni credenciales que persistan más allá de una sala: nada que
  filtrar salvo la propia configuración de despliegue (puerto, orígenes permitidos),
  que vive en `.env.prod` no versionado, mismo patrón que moto-routes.
- `tauri.conf.json` → `app.security.csp.connect-src` debe incluir el host `wss://` de
  señalización y los hosts STUN usados.

## Risks / Trade-offs

- **[Resuelto] Permiso de micrófono en el WebView de Android** → verificado en
  dispositivo real (spike, tarea 0.1): `getUserMedia`/`RTCPeerConnection` funcionan.
  wry (librería de WebView de Tauri) ya trae el puente `onPermissionRequest` que
  pide `RECORD_AUDIO` vía el flujo estándar de permisos de Android — no hizo falta
  código Kotlin nuevo. El único ajuste necesario fue declarar en
  `AndroidManifest.xml` tanto `RECORD_AUDIO` como `MODIFY_AUDIO_SETTINGS` (wry pide
  ambos como grupo para audio; si uno de los dos no está declarado, la petición
  combinada se deniega entera y `getUserMedia` falla con "Permission denied" sin
  mostrar ningún diálogo).
- **[Riesgo] Sin TURN propio, llamadas detrás de NAT simétrico/CGNAT estricto pueden no
  conectar** → Mitigación: fallo visible y explícito al usuario (spec: "No se puede
  establecer conexión directa por restricciones de red"); TURN autoalojado queda como
  cambio futuro si las pruebas reales en carretera muestran que es un problema
  frecuente, no hipotético.
- **[Riesgo] Un fallo del nuevo servicio (fuga de memoria, bucle) podría afectar al
  servidor compartido con moto-routes** → Mitigación: proceso y contenedor
  independientes, límites de memoria/CPU explícitos en su propio
  `docker-compose.prod.yml`, sin dependencias de proceso compartidas con `apps/api`.
- **[Riesgo] Una reconexión automática mal acotada podría reintentar indefinidamente y
  agotar batería** → Mitigación: backoff exponencial con techo y un límite de tiempo
  total razonable antes de dar la llamada por perdida (cubre el escenario de spec "El
  otro participante ... pierde la conexión de forma definitiva").

## Migration Plan

Greenfield: no hay datos ni servicio previo que migrar. Despliegue inicial = crear el
nuevo stack Docker en el servidor compartido, sin tocar el stack ya desplegado de
moto-routes. Rollback = `docker compose down` de este servicio, no afecta a los demás.

## Open Questions

- ~~Puerto/ruta exactos para exponer el servicio de señalización vía Tailscale
  Funnel~~ — **Resuelto en el bloque 6**: `https://debian.taildf3dab.ts.net/intercom-ws`
  (path-based, `tailscale funnel --set-path /intercom-ws http://127.0.0.1:8090`),
  coexistiendo con la ruta raíz `/` ya usada por `apps/api` de moto-routes sin
  tocarla. WebSocket real: `wss://debian.taildf3dab.ts.net/intercom-ws/ws` — probado
  de extremo a extremo desde fuera del tailnet (creación de sala real vía la URL
  pública). `connect-src` en `tauri.conf.json` ya usa este host exacto, no el patrón
  `wss://*.ts.net` que se usó como placeholder mientras tanto.
