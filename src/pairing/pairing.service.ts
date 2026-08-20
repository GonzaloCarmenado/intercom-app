import type { SignalingMessage, SignalingConnection } from "./pairing.types";

/** Permite inyectar un WebSocket falso en los tests. */
export type WebSocketFactory = (url: string) => WebSocket;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url);

/**
 * Abre una conexión con el servicio de señalización. url ya debe incluir
 * `?code=` (unión) o `?code=&token=` (reconexión) si aplica; sin parámetros
 * el servidor crea una sala nueva.
 */
export function connectToSignaling(
  url: string,
  factory: WebSocketFactory = defaultFactory,
): SignalingConnection {
  const ws = factory(url);
  const messageHandlers: ((message: SignalingMessage) => void)[] = [];
  const closeHandlers: (() => void)[] = [];

  ws.addEventListener("message", (event) => {
    const raw = (event as MessageEvent<string>).data;
    const message = JSON.parse(raw) as SignalingMessage;
    for (const handler of messageHandlers) {
      handler(message);
    }
  });

  ws.addEventListener("close", () => {
    for (const handler of closeHandlers) {
      handler();
    }
  });

  return {
    onMessage(handler): void {
      messageHandlers.push(handler);
    },
    onClose(handler): void {
      closeHandlers.push(handler);
    },
    send(message): void {
      ws.send(JSON.stringify(message));
    },
    close(): void {
      ws.close();
    },
  };
}
