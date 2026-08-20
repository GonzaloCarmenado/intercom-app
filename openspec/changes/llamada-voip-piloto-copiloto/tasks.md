## 0. Spike de riesgo (bloqueante, no-TDD)

- [x] 0.1 Verificar en un Android real, dentro del WebView de Tauri, que `getUserMedia`
      pide permiso de micrófono correctamente y que `RTCPeerConnection` consigue
      establecer una conexión de audio entre dos pestañas/dispositivos de prueba. Si
      falla, volver a `design.md` antes de continuar — no seguir con el resto de tareas
      con esto sin confirmar (ver Riesgo en design.md).

## 1. Servicio de señalización (Go)

- [x] 1.1 Test: crear una sala devuelve un código válido y único.
- [x] 1.2 Implementación mínima: endpoint/mensaje de creación de sala (mapa en memoria,
      código con `crypto/rand`).
- [x] 1.3 Test: unirse con un código válido y sin segundo participante conecta a los dos
      lados de la sala.
- [x] 1.4 Implementación: flujo de unión + intercambio de mensajes de señalización
      (offer/answer/ICE candidates) entre los dos WebSocket de una misma sala.
- [x] 1.5 Test: unirse con un código inexistente, caducado, o de una sala ya ocupada
      devuelve el error correspondiente sin crear ninguna conexión.
- [x] 1.6 Implementación: expiración de sala sin segundo participante (TTL), rechazo de
      unión a sala ya ocupada.
- [x] 1.7 Test: rate limiting de intentos de unión por IP.
- [x] 1.8 Implementación: límite de intentos de unión por IP en la ventana de validez
      del código.
- [x] 1.9 Test: cierre de sala al colgar explícito y tras margen de gracia sin conexión.
- [x] 1.10 Implementación: ciclo de vida completo de la sala (colgar, timeout de gracia
      para permitir reconexión). Requirió añadir un token de reconexión por participante
      (gap real encontrado durante la implementación, no estaba en design.md — ver ADR-002).

## 2. Emparejamiento (frontend)

- [x] 2.1 Test: pantalla de emparejamiento muestra un código al crear sala.
- [x] 2.2 Implementación: `pairing.element.ts` + `pairing.service.ts` (crear sala, unirse
      con código tecleado), `data-cy` en cada elemento interactivo.
- [x] 2.3 Test: código inválido/caducado o sala ocupada muestra el mensaje de error
      correspondiente y permite generar/pedir uno nuevo.
- [x] 2.4 Implementación: manejo de esos estados de error en la UI. Añadido Vitest +
      ESLint (no existían en el proyecto todavía) para poder cumplir el gate de apply.

## 3. Llamada de voz (frontend)

- [x] 3.1 Test: al completar el emparejamiento y conceder permiso de micrófono, la
      llamada queda activa (mock de `RTCPeerConnection`/`getUserMedia`).
- [x] 3.2 Implementación: `call.element.ts` + `call.service.ts` — establecimiento de la
      conexión WebRTC tras el intercambio de señalización.
- [x] 3.3 Test: permiso de micrófono denegado muestra el estado correspondiente, sin
      quedar cargando indefinidamente.
- [x] 3.4 Implementación: manejo de permiso denegado.
- [x] 3.5 Test: colgar desde cualquiera de los dos lados termina la llamada y vuelve a
      la pantalla de emparejamiento. Cubre tanto colgar propio como el mensaje
      `peer-left` del servidor (el otro lado cuelga o expira su margen de gracia) —
      este segundo caso se ignoraba en la primera pasada, corregido antes de cerrar.
- [x] 3.6 Implementación: botón de colgar + limpieza de la conexión. `call-screen` se
      sustituye a sí mismo por un `pairing-screen` nuevo al terminar, sin depender de
      un orquestador superior.
- [x] 3.7 Test: fallo al establecer la conexión directa (P2P no alcanzable) muestra el
      mensaje correspondiente.
- [x] 3.8 Implementación: manejo de ese fallo (vía `connectionState === "failed"` nativo
      de `RTCPeerConnection`, sin timeout propio adicional).

## 4. Selección de red y reconexión

- [x] 4.1 Test: con varias conexiones disponibles, se prefiere la de mayor calidad
      (WiFi > 5G > 4G > 3G) al iniciar la llamada. `pickBestNetwork` es una función
      pura y testeable; ver ADR-003 sobre por qué 5G/4G no se pueden distinguir de
      verdad con las APIs web estándar (el dato real que alimenta esta función en un
      dispositivo real es más pobre de lo que el ranking soporta).
- [x] 4.2 Implementación: consulta del tipo de red activa antes de iniciar la llamada
      (`network.service.ts`, best-effort vía Network Information API).
- [x] 4.3 Test: sin ninguna conexión de datos disponible, no se intenta iniciar la
      llamada y se informa al usuario.
- [x] 4.4 Implementación: comprobación previa de conectividad (`hasConnectivity()` en
      los botones crear/unirse de `pairing.element.ts`).
- [x] 4.5 Test: corte de red breve durante la llamada activa dispara reconexión
      automática con backoff, sin pedir reemparejamiento.
- [x] 4.6 Implementación: lógica de reconexión (backoff exponencial con techo) +
      renegociación ICE (`pc.restartIce()` + nueva offer) tras recuperar red. Requirió
      añadir `onClose` a `SignalingConnection` (no existía) y un `reconnect()` en
      `CallSetup` que `pairing.element.ts` construye con el código/token guardados.
- [x] 4.7 Test: estado "reconectando" es visualmente distinto de "en llamada".
- [x] 4.8 Implementación: estado de UI para reconexión (ya cubierto desde el bloque 3).
- [x] 4.9 Test: si la reconexión no tiene éxito tras el tiempo máximo, la llamada
      termina con el mensaje correspondiente.
- [x] 4.10 Implementación: límite de tiempo total de reintento (60s, igual que el
      margen de gracia del servidor) antes de dar la llamada por perdida.

## 5. Seguridad y configuración Tauri

- [ ] 5.1 Añadir el host `wss://` de señalización y los hosts STUN usados a
      `app.security.csp.connect-src` en `tauri.conf.json`.
- [ ] 5.2 Revisar permisos Android necesarios (micrófono) en `src-tauri/capabilities/`
      y manifest.
- [ ] 5.3 Revisión final del diff en busca de cualquier secreto/host hardcodeado antes
      de dar la tarea por cerrada.

## 6. Servicio de señalización: infraestructura y despliegue

- [ ] 6.1 `Dockerfile` del servicio de señalización (build multi-stage Go, imagen
      mínima).
- [ ] 6.2 `infra/docker/docker-compose.prod.yml` propio de este repo, con
      `mem_limit`/`cpus` explícitos, independiente del compose de moto-routes.
- [ ] 6.3 `infra/docker/.env.prod.example` versionado como plantilla (sin valores
      reales) + `.env.prod` real creado a mano por SSH en el servidor (no versionado).
- [ ] 6.4 Script de despliegue propio (`scripts/deploy-prod.sh`), adaptado del de
      moto-routes: SSH por Tailscale, `git pull --ff-only`, `docker compose up -d
      --build`, verificación de salud.
- [ ] 6.5 Confirmar puerto/ruta de exposición vía Tailscale Funnel en el servidor real
      (Open Question de design.md) y documentarlo en design.md una vez resuelto.
- [ ] 6.6 Desplegar y verificar salud del servicio en el servidor real.

## 7. Verificación manual en dispositivo Android real

- [ ] 7.1 Llamada completa piloto-copiloto con dos dispositivos Android reales,
      calidad de audio aceptable en condiciones normales.
- [ ] 7.2 Llamada activa sobrevive a minimizar la app / bloquear pantalla en ambos
      dispositivos.
- [ ] 7.3 Cambio de red en movimiento (perder cobertura y recuperarla) dispara
      reconexión automática observable en carretera, no solo en pruebas simuladas.

## 8. Cierre

- [ ] 8.1 Actualizar `memory/context.md` con el estado resultante del cambio.
- [ ] 8.2 Revisar si algo descubierto durante la implementación merece una ADR nueva
      en `memory/decisions.md` (además de ADR-001 ya registrada en propose).
