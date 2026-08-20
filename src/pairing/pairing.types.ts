/**
 * Mensajes que viajan por la conexión de señalización: los de control los
 * emite el propio servidor; offer/answer/ice-candidate los emite el otro
 * participante y el servidor solo los reenvía sin interpretarlos.
 */
export type SignalingMessage =
  | { type: "created"; code: string; token: string }
  | { type: "peer-joined"; token?: string }
  | { type: "peer-reconnected" }
  | { type: "reconnecting" }
  | { type: "peer-left"; reason: string }
  | { type: "error"; reason: "not_found" | "full" | "rate_limited" | "internal" }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

/** Conexión abierta hacia el servicio de señalización. */
export interface SignalingConnection {
  onMessage(handler: (message: SignalingMessage) => void): void;
  onClose(handler: () => void): void;
  send(message: unknown): void;
  close(): void;
}
