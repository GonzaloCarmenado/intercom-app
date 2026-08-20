import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalingMessage } from "./pairing.types";

const handlersByConnection: ((message: SignalingMessage) => void)[][] = [];
const sendMock = vi.fn();
const closeMock = vi.fn();
const connectToSignalingMock = vi.fn((_url: string) => {
  const handlers: ((message: SignalingMessage) => void)[] = [];
  handlersByConnection.push(handlers);
  return {
    onMessage: (handler: (message: SignalingMessage) => void): number => handlers.push(handler),
    send: sendMock,
    close: closeMock,
  };
});

vi.mock("./pairing.service", () => ({
  connectToSignaling: (url: string): unknown => connectToSignalingMock(url),
}));

const startCallMock = vi.fn((_setup: unknown, _handlers: unknown) => ({ hangUp: vi.fn() }));
vi.mock("../call/call.service", () => ({
  startCall: (setup: unknown, handlers: unknown): unknown => startCallMock(setup, handlers),
}));

const hasConnectivityMock = vi.fn(() => true);
vi.mock("../shared/network.service", () => ({
  hasConnectivity: (): boolean => hasConnectivityMock(),
}));

function emit(connectionIndex: number, message: SignalingMessage): void {
  for (const handler of handlersByConnection[connectionIndex] ?? []) {
    handler(message);
  }
}

await import("./pairing.element");

describe("<pairing-screen>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    handlersByConnection.length = 0;
    connectToSignalingMock.mockClear();
    sendMock.mockClear();
    closeMock.mockClear();
    hasConnectivityMock.mockReturnValue(true);
  });

  function mount(): HTMLElement {
    const el = document.createElement("pairing-screen");
    document.body.appendChild(el);
    return el;
  }

  it("shows the room code once the server creates it", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    emit(0, { type: "created", code: "ABC123", token: "tok" });

    const codeEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-codigo"]');
    expect(codeEl?.textContent).toContain("ABC123");
  });

  it("joins a room using a typed code", () => {
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-cy="pairing-input-codigo"]',
    );
    expect(input).toBeTruthy();
    input!.value = "XYZ999";
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    expect(connectToSignalingMock).toHaveBeenCalledWith(
      expect.stringContaining("code=XYZ999"),
    );
  });

  it("shows an error message when the code is invalid or expired", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLInputElement>('[data-cy="pairing-input-codigo"]')
      ?.setAttribute("value", "NOPE00");
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-cy="pairing-input-codigo"]',
    );
    input!.value = "NOPE00";
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    emit(0, { type: "error", reason: "not_found" });

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
    expect(errorEl?.hasAttribute("hidden")).toBe(false);
  });

  it("shows an error message when the room is already full", () => {
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-cy="pairing-input-codigo"]',
    );
    input!.value = "FULL00";
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    emit(0, { type: "error", reason: "full" });

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
  });

  it("shows an error message when rate limited", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    emit(0, { type: "error", reason: "rate_limited" });

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
  });

  it("shows a generic error message for unexpected error reasons", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    emit(0, { type: "error", reason: "internal" });

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
  });

  it("ignores WebRTC signaling and other-side call-state messages arriving before the transition", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    const ignoredMessages: SignalingMessage[] = [
      { type: "ice-candidate", candidate: {} },
      { type: "offer", sdp: "x" },
      { type: "answer", sdp: "x" },
      { type: "peer-reconnected" },
      { type: "reconnecting" },
      { type: "peer-left", reason: "hangup" },
    ];
    for (const message of ignoredMessages) {
      expect(() => {
        emit(0, message);
      }).not.toThrow();
    }

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.hasAttribute("hidden")).toBe(true);
  });

  it("transitions to <call-screen> as offerer once the second peer joins", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    emit(0, { type: "created", code: "ABC123", token: "creator-tok" });
    emit(0, { type: "peer-joined" });

    expect(document.body.querySelector("pairing-screen")).toBeNull();
    expect(document.body.querySelector("call-screen")).not.toBeNull();
    expect(startCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "offerer" }),
      expect.anything(),
    );
  });

  it("transitions to <call-screen> as answerer once joined to an existing room", () => {
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-cy="pairing-input-codigo"]',
    );
    input!.value = "XYZ999";
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    emit(0, { type: "peer-joined", token: "tok" });

    expect(document.body.querySelector("call-screen")).not.toBeNull();
    expect(startCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "answerer" }),
      expect.anything(),
    );
  });

  it("passes a reconnect function that redials with the room code and this participant's token", async () => {
    mount();
    document
      .querySelector("pairing-screen")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    emit(0, { type: "created", code: "ABC123", token: "creator-tok" });
    emit(0, { type: "peer-joined" });

    const setupArg = startCallMock.mock.calls[0][0] as { reconnect: () => Promise<unknown> };
    connectToSignalingMock.mockClear();
    await setupArg.reconnect();

    expect(connectToSignalingMock).toHaveBeenCalledWith(
      expect.stringMatching(/code=ABC123.*token=creator-tok/),
    );
  });

  it("does nothing when the join button is clicked without a code", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    expect(connectToSignalingMock).not.toHaveBeenCalled();
  });

  it("does not attempt to create a room without a data connection", () => {
    hasConnectivityMock.mockReturnValue(false);
    const el = mount();

    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    expect(connectToSignalingMock).not.toHaveBeenCalled();
    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
    expect(errorEl?.hasAttribute("hidden")).toBe(false);
  });

  it("does not attempt to join a room without a data connection", () => {
    hasConnectivityMock.mockReturnValue(false);
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(
      '[data-cy="pairing-input-codigo"]',
    );
    input!.value = "XYZ999";

    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    expect(connectToSignalingMock).not.toHaveBeenCalled();
    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.textContent).toBeTruthy();
  });
});
