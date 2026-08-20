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

## ADR-002: `llamada-voip-piloto-copiloto` — token de reconexión por participante, sin el cual el servidor no puede distinguir un reconnect legítimo de un desconocido

- **Fecha**: 2026-08-20
- **Estado**: Aceptada
- **Contexto**: Implementando las tareas 1.9/1.10 (colgar + reconexión con margen de
  gracia) apareció un hueco real en `design.md`: el protocolo solo identificaba una
  sala por su código de 6 caracteres, pensado para teclearse. Si un participante se
  cae de la señalización (no cuelga, simplemente pierde red) y el servidor mantiene
  la sala abierta un margen de gracia para permitir que vuelva, no hay forma de
  distinguir "es el mismo participante reconectando" de "alguien más intentó ese
  código durante la ventana de gracia" usando solo el código de sala.
- **Decisión**: al crear o unirse a una sala, el servidor emite también un token
  aleatorio largo (24 caracteres, `crypto/rand`) propio de ese participante — nunca
  se teclea, solo lo maneja la app. Para reconectar, el cliente presenta
  `?code=X&token=Y`; el servidor solo acepta la reconexión si el token pertenece a
  un participante ya emparejado en esa sala. El código de sala sigue siendo lo único
  que el usuario ve/teclea; el token es plumbing invisible.
- **Alternativas consideradas**: no reconectar nunca (bastaría con volver a
  emparejar desde cero) — descartada, contradice el requisito ya acordado con el
  usuario de reconexión automática sin repetir el emparejamiento. Reconectar sin
  ningún tipo de credencial, confiando en que adivinar un código de 6 caracteres
  durante una ventana de 60s es poco probable — descartada: el propio `design.md`
  ya pide rate limiting por fuerza bruta sobre el código, sería inconsistente
  dejar la reconexión sin protección equivalente.
- **Consecuencias**: el protocolo de señalización tiene tres modos según los
  parámetros de la conexión (crear / unir / reconectar) en vez de dos. Detalle
  completo en `openspec/changes/llamada-voip-piloto-copiloto/design.md`.

## ADR-003: `llamada-voip-piloto-copiloto` — detección de red WiFi/cellular best-effort, sin distinguir 5G/4G/3G de verdad

- **Fecha**: 2026-08-20
- **Estado**: Aceptada
- **Contexto**: `openspec/config.yaml` y la propuesta de este cambio piden "seleccionar
  la mejor red disponible (WiFi > 5G > 4G > 3G)". Implementando la tarea 4.1/4.2 se
  confirmó que ninguna API web estándar (Network Information API,
  `navigator.connection`) distingue 5G de 4G de verdad: `effectiveType` es una
  estimación por rendimiento medido, no por generación de red real, y su valor
  máximo es literalmente `"4g"` — cubre 4G y 5G indistintamente. Distinguirlos de
  verdad exigiría un puente nativo a `TelephonyManager` de Android (comando Tauri +
  código Kotlin), fuera de alcance de un cambio ya centrado en la propia llamada.
- **Decisión**: `network.service.ts` reporta lo que el navegador puede saber de
  verdad — `wifi`, `4g`, `3g` o `unknown` — sin inventar una distinción 5G que la
  plataforma no ofrece. La función de ranking (`pickBestNetwork`, en
  `network.transform.ts`) sí soporta un tipo `"5g"` como categoría de mayor
  prioridad que `"4g"`, preparada para el día que exista una fuente de datos real
  que la alimente (el puente nativo mencionado arriba), pero hoy nunca se le pasa
  ese valor.
- **Alternativas consideradas**: construir ya el puente nativo a `TelephonyManager`
  — descartado por alcance (cambio de infraestructura Android, no de la llamada en
  sí; candidato a cambio futuro si la calidad real en carretera lo justifica).
  Fingir que `effectiveType: "4g"` siempre es 5G o siempre es 4G — descartado por
  ser directamente falso, induciría a error en vez de informar.
- **Consecuencias**: la app nunca mostrará "conectado por 5G" de forma fiable hasta
  que exista ese puente nativo. La selección real de red (WiFi vs. datos móviles)
  sí funciona con las APIs web — es solo la granularidad dentro de "datos móviles"
  la que queda limitada. Detalle en `openspec/changes/llamada-voip-piloto-copiloto/`
  (`design.md` y `tasks.md`, tarea 4.1).

## ADR-004: `llamada-voip-piloto-copiloto` — nombre de proyecto Docker Compose explícito (`intercom-signaling`), y ruta de Funnel por path en vez de puerto nuevo

- **Fecha**: 2026-08-20
- **Estado**: Aceptada
- **Contexto**: Al desplegar de verdad en el servidor compartido con moto-routes
  (tarea 6.6), Docker Compose avisó de un "orphan container docker-api-1" al
  levantar el stack de este repo. Causa real: sin un nombre de proyecto explícito,
  Compose lo deriva del nombre del directorio que contiene el compose file
  (`docker`, porque el fichero vive en `infra/docker/docker-compose.prod.yml` en
  los dos repos) — ambos despliegues acabaron bajo el mismo namespace de proyecto
  por accidente, pese a ser repos y directorios de trabajo distintos. No llegó a
  tocar el contenedor de moto-routes (Compose solo avisa de huérfanos, no los
  toca sin `--remove-orphans`), pero un `docker compose down` futuro en cualquiera
  de los dos repos sí podría haberlo hecho.
- **Decisión**:
  1. `name: intercom-signaling` explícito en `infra/docker/docker-compose.prod.yml`
     de este repo — namespacing garantizado independientemente del nombre del
     directorio contenedor.
  2. Exposición pública vía Tailscale Funnel por **path**, no por puerto nuevo:
     `tailscale funnel --set-path /intercom-ws http://127.0.0.1:8090`, coexistiendo
     con la ruta raíz `/` que ya usa `apps/api` de moto-routes en el mismo dominio
     Funnel (`https://debian.taildf3dab.ts.net`), sin tocar esa configuración
     existente. URL real: `wss://debian.taildf3dab.ts.net/intercom-ws/ws`.
- **Alternativas consideradas**: exponer en un puerto Funnel distinto (8443 o
  10000, los otros puertos que Funnel permite) — descartado: algunas redes
  móviles/corporativas filtran puertos no estándar más agresivamente que el 443,
  y este proyecto ya prioriza "funciona en cualquier red de datos" (ver contexto
  del proyecto). Renombrar el directorio `infra/docker/` en este repo para evitar
  la colisión de nombres — descartado: rompería la paridad de convención con
  moto-routes sin arreglar la causa real (la ausencia de un nombre explícito).
- **Consecuencias**: cualquier cambio futuro de infraestructura en este repo debe
  mantener `name:` en el compose. Si moto-routes alguna vez necesita lo mismo
  (nombre de proyecto explícito), es una mejora a proponer allí, no algo que este
  cambio deba ni pueda arreglar por su cuenta.
