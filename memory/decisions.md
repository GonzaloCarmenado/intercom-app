# Decisiones Arquitectónicas (ADRs)

## ADR-001: `llamada-voip-piloto-copiloto` — WebRTC nativo del WebView, señalización mínima en Go sin BBDD, TURN propio descartado en v1

- **Fecha**: 2026-08-20
- **Estado**: Aceptada
- **Contexto**: Primer cambio real del proyecto. Hace falta decidir cómo viaja el
  audio entre los dos móviles, en qué lenguaje va el servicio de señalización que se
  desplegará en el servidor propio (compartido con moto-routes, ver su ADR-033), y
  cómo se gestiona el emparejamiento — todo ello con la restricción explícita del
  usuario de que el servidor compartido no debe crecer ni sobrecargarse.
- **Decisión**:
  1. **Audio: `RTCPeerConnection`/`getUserMedia` nativos del WebView**, sin librería
     WebRTC de terceros ni puente a Rust. El WebView de Android que usa Tauri ya los
     soporta.
  2. **Señalización: servicio Go mínimo** (`net/http` + librería de WebSocket sin
     framework), mismo lenguaje que `apps/api` de moto-routes, reutilizando su patrón
     de despliegue (Docker + `docker compose` + git pull vía SSH/Tailscale).
  3. **Estado de sala en memoria, sin base de datos** — un mapa `código → sala` con
     TTL, vive lo que dura la llamada, se descarta al colgar o tras un margen de
     gracia sin conexión. Sin persistencia porque nada necesita sobrevivir a un
     reinicio del proceso.
  4. **Sin TURN propio en v1** — solo STUN público. Añadir un TURN autoalojado
     metería tráfico de audio de relé constante sobre el servidor compartido,
     exactamente lo que se quiere evitar; se reconsidera solo si el uso real en
     carretera demuestra que el NAT/CGNAT de datos móviles rompe la conexión con
     frecuencia.
  5. **Emparejamiento por código alfanumérico tecleado, sin QR en v1** — evita
     permiso de cámara y una dependencia de escaneo para un beneficio marginal entre
     dos personas sentadas una al lado de la otra.
  6. **Despliegue en un stack Docker independiente del de moto-routes**, mismo
     servidor pero `docker-compose.prod.yml` propio con límites de memoria/CPU
     explícitos, para que un fallo de este servicio no pueda afectar a la API de
     moto-routes.
- **Alternativas consideradas**: WebRTC vía `webrtc-rs` en Rust puenteado a la UI
  (descartado: mucho más trabajo sin beneficio claro todavía); Node.js/`ws` para la
  señalización (descartado: base de memoria más alta que Go sin ventaja real); Rust
  (`axum`) para la señalización (footprint aún menor que Go, pero sin patrón de
  despliegue ya probado en este servidor — se prioriza consistencia operativa);
  TURN autoalojado desde el principio (descartado por huella sobre el servidor,
  ver punto 4); emparejamiento con QR desde v1 (descartado por complejidad/permiso
  de cámara desproporcionados para el caso de uso).
- **Consecuencias**: Riesgo abierto y documentado de que el permiso de micrófono en
  el WebView de Android tenga comportamiento irregular — primera tarea de
  `tasks.md` es un spike de verificación en dispositivo real antes de construir el
  resto. Riesgo abierto de que la ausencia de TURN deje sin conectar alguna llamada
  en redes móviles muy restrictivas — comportamiento visible y explícito para el
  usuario, no un fallo silencioso. Detalle completo en
  `openspec/changes/llamada-voip-piloto-copiloto/design.md`.

## ADR-NNN: Título de la decisión

- **Fecha**: YYYY-MM-DD
- **Estado**: Aceptada | Superseded por ADR-MMM
- **Contexto**: qué problema obliga a decidir.
- **Decisión**: qué se decide.
- **Alternativas consideradas**: qué se descartó y por qué.
- **Consecuencias**: qué implica a futuro.
