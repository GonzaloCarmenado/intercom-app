## Why

Piloto y copiloto de una misma moto necesitan hablar entre ellos sin depender de
ningún hardware de intercomunicador (Cardo, Sena, etc.). La app debe ser, ella misma,
el intercomunicador: una llamada de voz continua entre los dos móviles mientras dure
el trayecto, usando la mejor conexión de datos disponible y reconectando sola si se
cae.

## What Changes

- Nueva pantalla/flujo para iniciar una sesión de intercomunicación: un móvil genera
  un código/QR efímero de sala, el otro lo introduce o lo escanea para unirse.
- Establecimiento de una llamada de voz WebRTC peer-to-peer entre ambos móviles una
  vez emparejados, con audio directo entre dispositivos (el servidor no retransmite
  audio).
- Selección automática de la mejor red disponible al iniciar la llamada (WiFi > 5G >
  4G > 3G) y reconexión automática con backoff si la conexión se cae durante la
  llamada, sin colgar del lado del usuario si es evitable.
- Indicación visible en la UI del estado de la llamada (conectando, en llamada,
  reconectando, sala caducada/inválida).
- Nuevo servicio backend mínimo de señalización WebRTC (intercambio de offer/answer/
  ICE), sin base de datos persistente, desplegado en el servidor propio compartido
  con moto-routes.

**No-goals de este cambio** (fuera de alcance, quedan para cambios futuros):
- Transporte por Bluetooth como alternativa al VoIP.
- Cuentas de usuario, contactos guardados o cualquier emparejamiento persistente.
- Comunicación entre más de dos personas o entre motos distintas (grupo de riders).

## Capabilities

### New Capabilities
- `llamada-voip`: emparejamiento efímero por código/QR y llamada de voz WebRTC
  peer-to-peer entre dos móviles, con selección de mejor red y reconexión automática.

### Modified Capabilities
(ninguna — no existen specs previas en este proyecto)

## Impact

- **Frontend** (`src/`): nuevo dominio funcional para la sesión de llamada (pantalla
  de emparejamiento, pantalla de llamada activa, componentes compartidos de estado de
  conexión).
- **Backend móvil** (`src-tauri/`): puente hacia las APIs de Android necesarias para
  selección/monitorización de red (no cubiertas directamente por el WebView de Tauri).
- **Servidor de señalización**: nuevo servicio, a definir en `design.md` (lenguaje,
  framework, forma de despliegue sobre el servidor Debian existente vía Tailscale/SSH,
  mismo patrón que `scripts/deploy-prod.sh` de moto-routes).
- **Dependencias**: cliente WebRTC para Web Components/TypeScript (a justificar en
  `design.md`); ninguna dependencia Cargo nueva prevista todavía.
