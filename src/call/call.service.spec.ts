import { beforeEach, describe, expect, it, vi } from "vitest";
import { startCall } from "./call.service";
import type { CallDeps } from "./call.service";
import type { CallSetup, CallState } from "./call.types";
import type { SignalingConnection, SignalingMessage } from "../pairing/pairing.types";

class FakeTrack {
  kind = "audio";
}

class FakeStream {
  getAudioTracks(): FakeTrack[] {
    return [new FakeTrack()];
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  addedTracks: unknown[] = [];
  remoteDescriptions: unknown[] = [];
  iceCandidates: unknown[] = [];
  closed = false;
  restartIceCalled = false;
  createOfferShouldFail = false;
  setRemoteDescriptionShouldFail = false;

  restartIce(): void {
    this.restartIceCalled = true;
  }

  addTrack(track: unknown): void {
    this.addedTracks.push(track);
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    if (this.createOfferShouldFail) return Promise.reject(new Error("createOffer failed"));
    return Promise.resolve({ type: "offer", sdp: "fake-offer" });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "answer", sdp: "fake-answer" });
  }

  setLocalDescription(): Promise<void> {
    return Promise.resolve();
  }

  setRemoteDescription(description: unknown): Promise<void> {
    if (this.setRemoteDescriptionShouldFail) return Promise.reject(new Error("setRemoteDescription failed"));
    this.remoteDescriptions.push(description);
    return Promise.resolve();
  }

  addIceCandidate(candidate: unknown): Promise<void> {
    this.iceCandidates.push(candidate);
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }

  setState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  emitIceCandidate(candidate: RTCIceCandidate | null): void {
    this.onicecandidate?.({ candidate });
  }

  emitTrack(stream: MediaStream): void {
    this.ontrack?.({ streams: [stream] });
  }
}

function fakeConnection(): {
  connection: SignalingConnection;
  send: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  emit: (message: SignalingMessage) => void;
  triggerClose: () => void;
} {
  const messageHandlers: ((message: SignalingMessage) => void)[] = [];
  const closeHandlers: (() => void)[] = [];
  const send = vi.fn();
  const onMessage = vi.fn((handler: (message: SignalingMessage) => void) => {
    messageHandlers.push(handler);
  });
  const onClose = vi.fn((handler: () => void) => {
    closeHandlers.push(handler);
  });
  return {
    connection: { onMessage, onClose, send, close: vi.fn() },
    send,
    onMessage,
    emit: (message): void => {
      for (const handler of messageHandlers) handler(message);
    },
    triggerClose: (): void => {
      for (const handler of closeHandlers) handler();
    },
  };
}

describe("startCall", () => {
  let pc: FakePeerConnection;
  let deps: CallDeps;

  beforeEach(() => {
    pc = new FakePeerConnection();
    deps = {
      getUserMedia: vi.fn(() => Promise.resolve(new FakeStream() as unknown as MediaStream)),
      createPeerConnection: (): RTCPeerConnection => pc as unknown as RTCPeerConnection,
    };
  });

  it("becomes in-call once permission is granted, the offer is sent, and the connection succeeds", async () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "offer" }),
      );
    });

    pc.setState("connected");

    expect(states).toContainEqual({ status: "requesting-permission" });
    expect(states).toContainEqual({ status: "connecting" });
    expect(states).toContainEqual({ status: "in-call" });
  });

  it("reports permission-denied without hanging when getUserMedia rejects", async () => {
    deps.getUserMedia = vi.fn(() => Promise.reject(new Error("denied")));
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);

    await vi.waitFor(() => {
      expect(states).toContainEqual({ status: "permission-denied" });
    });
  });

  it("reports connection-failed when the peer connection cannot be established", async () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(states).toContainEqual({ status: "connecting" });
    });

    pc.setState("failed");

    expect(states).toContainEqual({ status: "connection-failed" });
  });

  it("reports reconnecting when the peer connection drops mid-call", async () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(states).toContainEqual({ status: "connecting" });
    });

    pc.setState("disconnected");

    expect(states).toContainEqual({ status: "reconnecting" });
  });

  it("answers an incoming offer when acting as answerer", async () => {
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "answerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.onMessage).toHaveBeenCalled();
    });

    emit({ type: "offer", sdp: "remote-offer" });

    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "answer" }),
      );
    });
  });

  it("sends any gathered ICE candidate to the other peer", async () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    const candidate = { toJSON: () => ({ candidate: "fake" }) } as unknown as RTCIceCandidate;
    pc.emitIceCandidate(candidate);

    expect(connection.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ice-candidate" }),
    );
  });

  it("does not relay a null ICE candidate (end-of-candidates marker)", async () => {
    const { connection, send } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });
    send.mockClear();

    pc.emitIceCandidate(null);

    expect(connection.send).not.toHaveBeenCalled();
  });

  it("applies an incoming answer as the remote description when acting as offerer", async () => {
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    emit({ type: "answer", sdp: "remote-answer" });

    await vi.waitFor(() => {
      expect(pc.remoteDescriptions).toContainEqual({ type: "answer", sdp: "remote-answer" });
    });
  });

  it("applies an incoming ICE candidate from the other peer", async () => {
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    emit({ type: "ice-candidate", candidate: { candidate: "remote" } });

    await vi.waitFor(() => {
      expect(pc.iceCandidates).toContainEqual({ candidate: "remote" });
    });
  });

  it("ignores room control messages arriving during an active call", async () => {
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    const controlMessages: SignalingMessage[] = [
      { type: "created", code: "X", token: "t" },
      { type: "peer-joined" },
      { type: "peer-reconnected" },
      { type: "reconnecting" },
      { type: "error", reason: "internal" },
    ];
    for (const message of controlMessages) {
      expect(() => {
        emit(message);
      }).not.toThrow();
    }
  });

  it("ends the call when the server reports the other participant left for good", async () => {
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    emit({ type: "peer-left", reason: "timeout" });

    expect(states).toContainEqual({ status: "ended", reason: "timeout" });
  });

  it("reports connection-failed when applying the remote answer fails", async () => {
    pc.setRemoteDescriptionShouldFail = true;
    const { connection, emit } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    emit({ type: "answer", sdp: "remote-answer" });

    await vi.waitFor(() => {
      expect(states).toContainEqual({ status: "connection-failed" });
    });
  });

  it("reports connection-failed when creating the offer itself fails", async () => {
    pc.createOfferShouldFail = true;
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const states: CallState[] = [];

    startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);

    await vi.waitFor(() => {
      expect(states).toContainEqual({ status: "connection-failed" });
    });
  });

  it("plays the remote audio track once it arrives", async () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };
    const onRemoteTrack = vi.fn();

    startCall(setup, { onStateChange: () => undefined, onRemoteTrack }, deps);
    await vi.waitFor(() => {
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    });

    const stream = new FakeStream() as unknown as MediaStream;
    pc.emitTrack(stream);

    expect(onRemoteTrack).toHaveBeenCalledWith(stream);
  });

  it("reconnects the signaling connection after it closes mid-call and restarts ICE", async () => {
    vi.useFakeTimers();
    try {
      const { connection, triggerClose } = fakeConnection();
      const reconnected = fakeConnection();
      const reconnect = vi.fn(() => Promise.resolve(reconnected.connection));
      const setup: CallSetup = { connection, role: "offerer", reconnect };
      const states: CallState[] = [];

      startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
      await vi.advanceTimersByTimeAsync(0);
      expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));

      triggerClose();
      expect(states).toContainEqual({ status: "reconnecting" });

      await vi.advanceTimersByTimeAsync(1000);
      expect(reconnect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);

      expect(pc.restartIceCalled).toBe(true);
      expect(reconnected.send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries with growing backoff while the signaling connection stays unreachable", async () => {
    vi.useFakeTimers();
    try {
      const { connection, triggerClose } = fakeConnection();
      const reconnect = vi.fn(() => Promise.reject(new Error("still offline")));
      const setup: CallSetup = { connection, role: "offerer", reconnect };

      startCall(setup, { onStateChange: () => undefined, onRemoteTrack: () => undefined }, deps);
      await vi.advanceTimersByTimeAsync(0);

      triggerClose();
      await vi.advanceTimersByTimeAsync(1000);
      expect(reconnect).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2000);
      expect(reconnect).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(4000);
      expect(reconnect).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up and ends the call if signaling cannot be restored within the time budget", async () => {
    vi.useFakeTimers();
    try {
      const { connection, triggerClose } = fakeConnection();
      const reconnect = vi.fn(() => Promise.reject(new Error("still offline")));
      const setup: CallSetup = { connection, role: "offerer", reconnect };
      const states: CallState[] = [];

      startCall(setup, { onStateChange: (s) => states.push(s), onRemoteTrack: () => undefined }, deps);
      await vi.advanceTimersByTimeAsync(0);

      triggerClose();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(states).toContainEqual({ status: "ended", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not attempt to reconnect after an explicit hangup", async () => {
    vi.useFakeTimers();
    try {
      const { connection, triggerClose } = fakeConnection();
      const reconnect = vi.fn(() => Promise.resolve(fakeConnection().connection));
      const setup: CallSetup = { connection, role: "offerer", reconnect };

      const controller = startCall(
        setup,
        { onStateChange: () => undefined, onRemoteTrack: () => undefined },
        deps,
      );
      await vi.advanceTimersByTimeAsync(0);

      controller.hangUp();
      triggerClose();
      await vi.advanceTimersByTimeAsync(2000);

      expect(reconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a hangup message and closes the peer connection", () => {
    const { connection } = fakeConnection();
    const setup: CallSetup = { connection, role: "offerer", reconnect: vi.fn() };

    const controller = startCall(
      setup,
      { onStateChange: () => undefined, onRemoteTrack: () => undefined },
      deps,
    );
    controller.hangUp();

    expect(connection.send).toHaveBeenCalledWith({ type: "hangup" });
    expect(pc.closed).toBe(true);
  });
});
