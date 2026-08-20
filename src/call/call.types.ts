import type { SignalingConnection } from "../pairing/pairing.types";

/** Quién hace de offerer WebRTC — el creador de la sala, siempre. */
export type CallRole = "offerer" | "answerer";

/** Estado visible de la pantalla de llamada. */
export type CallState =
  | { status: "requesting-permission" }
  | { status: "permission-denied" }
  | { status: "connecting" }
  | { status: "in-call" }
  | { status: "reconnecting" }
  | { status: "connection-failed" }
  | { status: "ended"; reason: string };

/** Todo lo que call.element.ts necesita para arrancar una llamada ya emparejada. */
export interface CallSetup {
  connection: SignalingConnection;
  role: CallRole;
}
