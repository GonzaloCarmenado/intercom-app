/** Mensajes que el servicio de señalización puede enviar a un cliente. */
export type ServerMessage =
  | { type: "created"; code: string; token: string }
  | { type: "peer-joined"; token?: string }
  | { type: "peer-reconnected" }
  | { type: "reconnecting" }
  | { type: "peer-left"; reason: string }
  | { type: "error"; reason: "not_found" | "full" | "rate_limited" | "internal" };

/** Conexión abierta hacia el servicio de señalización. */
export interface SignalingConnection {
  onMessage(handler: (message: ServerMessage) => void): void;
  send(message: unknown): void;
  close(): void;
}

/** Estado visible de la pantalla de emparejamiento. */
export type PairingState =
  | { status: "idle" }
  | { status: "waiting-for-peer"; code: string }
  | { status: "paired" }
  | { status: "error"; reason: ServerMessage extends { type: "error"; reason: infer R } ? R : never };
