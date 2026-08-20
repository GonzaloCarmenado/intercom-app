import type { SignalingConnection, SignalingMessage } from "../pairing/pairing.types";
import type { CallSetup, CallState } from "./call.types";

/** Puentea getUserMedia/RTCPeerConnection reales para poder inyectar fakes en tests. */
export interface CallDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection: () => RTCPeerConnection;
}

/** Callbacks que call.element.ts registra para reaccionar a la llamada. */
export interface CallHandlers {
  onStateChange: (state: CallState) => void;
  onRemoteTrack: (stream: MediaStream) => void;
}

/** Controles expuestos a call.element.ts una vez la llamada está en marcha. */
export interface CallController {
  hangUp: () => void;
}

const STUN_SERVERS = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];

/* v8 ignore start -- delegación directa a APIs del navegador, sin lógica propia que testear */
const defaultDeps: CallDeps = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createPeerConnection: () => new RTCPeerConnection({ iceServers: [{ urls: STUN_SERVERS }] }),
};
/* v8 ignore stop */

// Backoff exponencial con techo para reintentar la señalización tras una
// caída de red. El presupuesto total coincide con el margen de gracia que
// el servidor da a una sala emparejada antes de cerrarla (60s, ver
// design.md) — pasado ese tiempo el servidor ya habrá cerrado la sala de
// todos modos, así que seguir reintentando no serviría de nada.
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 8000;
const RECONNECT_BUDGET_MS = 60_000;

interface ReconnectManager {
  begin: () => void;
  cancel: () => void;
}

interface ReconnectManagerOptions {
  pc: RTCPeerConnection;
  setup: CallSetup;
  handlers: CallHandlers;
  state: { activeConnection: SignalingConnection };
  wireConnection: (connection: SignalingConnection) => void;
}

/**
 * Máquina de reconexión de la señalización: backoff exponencial con techo,
 * hasta RECONNECT_BUDGET_MS. Al reconectar, renegocia ICE sobre la nueva
 * conexión — sin pedir un nuevo emparejamiento.
 */
function createReconnectManager(options: ReconnectManagerOptions): ReconnectManager {
  const { pc, setup, handlers, state, wireConnection } = options;
  let reconnecting = false;
  let reconnectAttempt = 0;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  let backoffTimer: ReturnType<typeof setTimeout> | undefined;

  function attempt(): void {
    if (!reconnecting) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    backoffTimer = setTimeout(() => {
      if (!reconnecting) return;
      setup.reconnect().then(
        (newConnection) => {
          if (!reconnecting) return;
          reconnecting = false;
          clearTimeout(giveUpTimer);
          state.activeConnection = newConnection;
          wireConnection(newConnection);
          pc.restartIce();
          if (setup.role === "offerer") {
            makeOffer(pc, newConnection, true).catch(() => {
              handlers.onStateChange({ status: "connection-failed" });
            });
          }
        },
        () => {
          reconnectAttempt += 1;
          attempt();
        },
      );
    }, delay);
  }

  return {
    begin(): void {
      if (reconnecting) return;
      reconnecting = true;
      reconnectAttempt = 0;
      handlers.onStateChange({ status: "reconnecting" });
      giveUpTimer = setTimeout(() => {
        if (!reconnecting) return;
        reconnecting = false;
        handlers.onStateChange({ status: "ended", reason: "timeout" });
      }, RECONNECT_BUDGET_MS);
      attempt();
    },
    cancel(): void {
      reconnecting = false;
      clearTimeout(giveUpTimer);
      clearTimeout(backoffTimer);
    },
  };
}

/** ICE candidates propios, audio remoto, y estado de conexión del RTCPeerConnection. */
function wirePeerConnectionEvents(
  pc: RTCPeerConnection,
  state: { activeConnection: SignalingConnection },
  handlers: CallHandlers,
  isHungUp: () => boolean,
): void {
  pc.onicecandidate = (event): void => {
    if (event.candidate) {
      state.activeConnection.send({ type: "ice-candidate", candidate: event.candidate.toJSON() });
    }
  };

  pc.ontrack = (event): void => {
    handlers.onRemoteTrack(event.streams[0]);
  };

  pc.onconnectionstatechange = (): void => {
    if (isHungUp()) return;
    if (pc.connectionState === "connected") {
      handlers.onStateChange({ status: "in-call" });
    } else if (pc.connectionState === "failed") {
      handlers.onStateChange({ status: "connection-failed" });
    } else if (pc.connectionState === "disconnected") {
      handlers.onStateChange({ status: "reconnecting" });
    }
  };
}

/**
 * Arranca una llamada de voz WebRTC sobre una conexión de señalización ya
 * emparejada: pide micrófono, negocia offer/answer/ICE según el rol, y
 * notifica cambios de estado hasta que se cuelga. Si la señalización se
 * cae a mitad de llamada, reintenta reconectarla con backoff y renegocia
 * ICE al recuperarla, sin pedir un nuevo emparejamiento.
 */
export function startCall(
  setup: CallSetup,
  handlers: CallHandlers,
  deps: CallDeps = defaultDeps,
): CallController {
  const pc = deps.createPeerConnection();
  const state = { activeConnection: setup.connection };
  let hungUp = false;

  function wireConnection(connection: SignalingConnection): void {
    connection.onMessage((message) => {
      if (message.type === "peer-left") {
        handlers.onStateChange({ status: "ended", reason: message.reason });
        return;
      }
      handleSignalingMessage(pc, connection, message).catch(() => {
        handlers.onStateChange({ status: "connection-failed" });
      });
    });
    connection.onClose(() => {
      if (!hungUp) reconnectManager.begin();
    });
  }

  const reconnectManager = createReconnectManager({ pc, setup, handlers, state, wireConnection });
  wirePeerConnectionEvents(pc, state, handlers, () => hungUp);
  wireConnection(state.activeConnection);

  handlers.onStateChange({ status: "requesting-permission" });
  deps.getUserMedia({ audio: true }).then(
    (stream) => {
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }
      handlers.onStateChange({ status: "connecting" });
      if (setup.role === "offerer") {
        makeOffer(pc, state.activeConnection).catch(() => {
          handlers.onStateChange({ status: "connection-failed" });
        });
      }
    },
    () => {
      handlers.onStateChange({ status: "permission-denied" });
    },
  );

  return {
    hangUp(): void {
      hungUp = true;
      reconnectManager.cancel();
      state.activeConnection.send({ type: "hangup" });
      pc.close();
    },
  };
}

async function makeOffer(
  pc: RTCPeerConnection,
  connection: SignalingConnection,
  iceRestart = false,
): Promise<void> {
  const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
  await pc.setLocalDescription(offer);
  connection.send({ type: "offer", sdp: offer.sdp ?? "" });
}

async function handleSignalingMessage(
  pc: RTCPeerConnection,
  connection: SignalingConnection,
  message: SignalingMessage,
): Promise<void> {
  switch (message.type) {
    case "offer": {
      await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      connection.send({ type: "answer", sdp: answer.sdp ?? "" });
      break;
    }
    case "answer":
      await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
      break;
    case "ice-candidate":
      await pc.addIceCandidate(message.candidate);
      break;
    case "created":
    case "peer-joined":
    case "peer-reconnected":
    case "reconnecting":
    case "error":
      break; // mensajes de control de sala, no de señalización WebRTC
    case "peer-left":
      break; // interceptado antes de llegar aquí, ver el onMessage de startCall
  }
}
