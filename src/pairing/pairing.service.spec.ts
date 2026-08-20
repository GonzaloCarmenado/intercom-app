import { describe, expect, it, vi } from "vitest";
import { connectToSignaling } from "./pairing.service";
import type { SignalingMessage } from "./pairing.types";

class FakeWebSocket extends EventTarget {
  sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(payload: SignalingMessage): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
}

describe("connectToSignaling", () => {
  it("parses incoming messages and notifies registered handlers", () => {
    const fakeSocket = new FakeWebSocket();
    const connection = connectToSignaling("ws://example.test/ws", () => fakeSocket as unknown as WebSocket);

    const handler = vi.fn();
    connection.onMessage(handler);

    fakeSocket.emitMessage({ type: "created", code: "ABC123", token: "tok" });

    expect(handler).toHaveBeenCalledWith({ type: "created", code: "ABC123", token: "tok" });
  });

  it("serializes messages sent through the connection as JSON", () => {
    const fakeSocket = new FakeWebSocket();
    const connection = connectToSignaling("ws://example.test/ws", () => fakeSocket as unknown as WebSocket);

    connection.send({ type: "hangup" });

    expect(fakeSocket.sent).toEqual([JSON.stringify({ type: "hangup" })]);
  });

  it("closes the underlying socket", () => {
    const fakeSocket = new FakeWebSocket();
    const connection = connectToSignaling("ws://example.test/ws", () => fakeSocket as unknown as WebSocket);

    connection.close();

    expect(fakeSocket.closed).toBe(true);
  });
});
