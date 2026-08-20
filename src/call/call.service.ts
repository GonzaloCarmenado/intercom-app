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

/**
 * Arranca una llamada de voz WebRTC sobre una conexión de señalización ya
 * emparejada: pide micrófono, negocia offer/answer/ICE según el rol, y
 * notifica cambios de estado hasta que se cuelga.
 */
export function startCall(
  setup: CallSetup,
  handlers: CallHandlers,
  deps: CallDeps = defaultDeps,
): CallController {
  const pc = deps.createPeerConnection();
  let hungUp = false;

  pc.onicecandidate = (event): void => {
    if (event.candidate) {
      setup.connection.send({ type: "ice-candidate", candidate: event.candidate.toJSON() });
    }
  };

  pc.ontrack = (event): void => {
    handlers.onRemoteTrack(event.streams[0]);
  };

  pc.onconnectionstatechange = (): void => {
    if (hungUp) return;
    if (pc.connectionState === "connected") {
      handlers.onStateChange({ status: "in-call" });
    } else if (pc.connectionState === "failed") {
      handlers.onStateChange({ status: "connection-failed" });
    } else if (pc.connectionState === "disconnected") {
      handlers.onStateChange({ status: "reconnecting" });
    }
  };

  setup.connection.onMessage((message) => {
    if (message.type === "peer-left") {
      handlers.onStateChange({ status: "ended", reason: message.reason });
      return;
    }
    handleSignalingMessage(pc, setup.connection, message).catch(() => {
      handlers.onStateChange({ status: "connection-failed" });
    });
  });

  handlers.onStateChange({ status: "requesting-permission" });
  deps.getUserMedia({ audio: true }).then(
    (stream) => {
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }
      handlers.onStateChange({ status: "connecting" });
      if (setup.role === "offerer") {
        makeOffer(pc, setup.connection).catch(() => {
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
      setup.connection.send({ type: "hangup" });
      pc.close();
    },
  };
}

async function makeOffer(pc: RTCPeerConnection, connection: SignalingConnection): Promise<void> {
  const offer = await pc.createOffer();
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
