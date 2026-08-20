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

- [ ] 3.1 Test: al completar el emparejamiento y conceder permiso de micrófono, la
      llamada queda activa (mock de `RTCPeerConnection`/`getUserMedia`).
- [ ] 3.2 Implementación: `call.element.ts` + `call.service.ts` — establecimiento de la
      conexión WebRTC tras el intercambio de señalización.
- [ ] 3.3 Test: permiso de micrófono denegado muestra el estado correspondiente, sin
      quedar cargando indefinidamente.
- [ ] 3.4 Implementación: manejo de permiso denegado.
- [ ] 3.5 Test: colgar desde cualquiera de los dos lados termina la llamada y vuelve a
      la pantalla de emparejamiento.
- [ ] 3.6 Implementación: botón de colgar + limpieza de la conexión.
- [ ] 3.7 Test: fallo al establecer la conexión directa (P2P no alcanzable) muestra el
      mensaje correspondiente.
- [ ] 3.8 Implementación: manejo de ese fallo (timeout de conexión ICE sin éxito).

## 4. Selección de red y reconexión

- [ ] 4.1 Test: con varias conexiones disponibles, se prefiere la de mayor calidad
      (WiFi > 5G > 4G > 3G) al iniciar la llamada.
- [ ] 4.2 Implementación: consulta del tipo de red activa antes de iniciar la llamada.
- [ ] 4.3 Test: sin ninguna conexión de datos disponible, no se intenta iniciar la
      llamada y se informa al usuario.
- [ ] 4.4 Implementación: comprobación previa de conectividad.
- [ ] 4.5 Test: corte de red breve durante la llamada activa dispara reconexión
      automática con backoff, sin pedir reemparejamiento.
- [ ] 4.6 Implementación: lógica de reconexión (backoff exponencial con techo) +
      renegociación ICE tras recuperar red.
- [ ] 4.7 Test: estado "reconectando" es visualmente distinto de "en llamada".
- [ ] 4.8 Implementación: estado de UI para reconexión.
- [ ] 4.9 Test: si la reconexión no tiene éxito tras el tiempo máximo, la llamada
      termina con el mensaje correspondiente.
- [ ] 4.10 Implementación: límite de tiempo total de reintento antes de dar la llamada
      por perdida.

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
