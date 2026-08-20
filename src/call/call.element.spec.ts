import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallHandlers } from "./call.service";
import type { CallSetup } from "./call.types";

const hangUpMock = vi.fn();
let capturedHandlers: CallHandlers | null = null;
const startCallMock = vi.fn((_setup: CallSetup, handlers: CallHandlers) => {
  capturedHandlers = handlers;
  return { hangUp: hangUpMock };
});

vi.mock("./call.service", () => ({
  startCall: (setup: CallSetup, handlers: CallHandlers): unknown => startCallMock(setup, handlers),
}));

await import("./call.element");

describe("<call-screen>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    startCallMock.mockClear();
    hangUpMock.mockClear();
    capturedHandlers = null;
  });

  function mount(): HTMLElement & { start: (setup: CallSetup) => void } {
    const el = document.createElement("call-screen") as HTMLElement & {
      start: (setup: CallSetup) => void;
    };
    document.body.appendChild(el);
    return el;
  }

  function fakeSetup(): CallSetup {
    return {
      connection: { onMessage: vi.fn(), send: vi.fn(), close: vi.fn() },
      role: "offerer",
    };
  }

  it("shows the connecting state once the call reaches in-call", () => {
    const el = mount();
    el.start(fakeSetup());

    capturedHandlers?.onStateChange({ status: "in-call" });

    const status = el.shadowRoot?.querySelector('[data-cy="call-text-estado"]');
    expect(status?.textContent).toMatch(/en llamada/i);
  });

  it("shows an explanation without hanging when microphone permission is denied", () => {
    const el = mount();
    el.start(fakeSetup());

    capturedHandlers?.onStateChange({ status: "permission-denied" });

    const error = el.shadowRoot?.querySelector('[data-cy="call-text-error"]');
    expect(error?.textContent).toBeTruthy();
    expect(error?.hasAttribute("hidden")).toBe(false);
  });

  it("shows an error when the direct connection cannot be established", () => {
    const el = mount();
    el.start(fakeSetup());

    capturedHandlers?.onStateChange({ status: "connection-failed" });

    const error = el.shadowRoot?.querySelector('[data-cy="call-text-error"]');
    expect(error?.textContent).toBeTruthy();
  });

  it("hangs up and returns to the pairing screen when the hangup button is clicked", () => {
    const el = mount();
    el.start(fakeSetup());
    const endedHandler = vi.fn();
    el.addEventListener("call-ended", endedHandler);

    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="call-button-colgar"]')
      ?.click();

    expect(hangUpMock).toHaveBeenCalled();
    expect(endedHandler).toHaveBeenCalled();
    expect(document.body.querySelector("call-screen")).toBeNull();
    expect(document.body.querySelector("pairing-screen")).not.toBeNull();
  });

  it("returns to the pairing screen when the other participant leaves for good", () => {
    const el = mount();
    el.start(fakeSetup());
    const endedHandler = vi.fn();
    el.addEventListener("call-ended", endedHandler);

    capturedHandlers?.onStateChange({ status: "ended", reason: "timeout" });

    expect(endedHandler).toHaveBeenCalled();
    expect(document.body.querySelector("call-screen")).toBeNull();
    expect(document.body.querySelector("pairing-screen")).not.toBeNull();
  });

  it("shows the requesting-permission and connecting states", () => {
    const el = mount();
    el.start(fakeSetup());

    capturedHandlers?.onStateChange({ status: "requesting-permission" });
    let status = el.shadowRoot?.querySelector('[data-cy="call-text-estado"]');
    expect(status?.textContent).toMatch(/micrófono/i);

    capturedHandlers?.onStateChange({ status: "connecting" });
    status = el.shadowRoot?.querySelector('[data-cy="call-text-estado"]');
    expect(status?.textContent).toMatch(/conectando/i);
  });

  it("plays the remote audio track without throwing", () => {
    const el = mount();
    el.start(fakeSetup());

    const fakeStream = {} as MediaStream;
    expect(() => {
      capturedHandlers?.onRemoteTrack(fakeStream);
    }).not.toThrow();
  });

  it("shows a distinct reconnecting state", () => {
    const el = mount();
    el.start(fakeSetup());

    capturedHandlers?.onStateChange({ status: "reconnecting" });

    const status = el.shadowRoot?.querySelector('[data-cy="call-text-estado"]');
    expect(status?.textContent).toMatch(/reconectando/i);
  });
});
