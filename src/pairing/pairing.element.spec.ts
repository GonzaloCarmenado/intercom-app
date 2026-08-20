import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "./pairing.types";

const handlersByConnection: ((message: ServerMessage) => void)[][] = [];
const sendMock = vi.fn();
const closeMock = vi.fn();
const connectToSignalingMock = vi.fn((_url: string) => {
  const handlers: ((message: ServerMessage) => void)[] = [];
  handlersByConnection.push(handlers);
  return {
    onMessage: (handler: (message: ServerMessage) => void): number => handlers.push(handler),
    send: sendMock,
    close: closeMock,
  };
});

vi.mock("./pairing.service", () => ({
  connectToSignaling: (url: string): unknown => connectToSignalingMock(url),
}));

function emit(connectionIndex: number, message: ServerMessage): void {
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

  it("ignores message types other than created/error without throwing", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.click();

    expect(() => { emit(0, { type: "peer-joined" }); }).not.toThrow();

    const errorEl = el.shadowRoot?.querySelector('[data-cy="pairing-text-error"]');
    expect(errorEl?.hasAttribute("hidden")).toBe(true);
  });

  it("does nothing when the join button is clicked without a code", () => {
    const el = mount();
    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.click();

    expect(connectToSignalingMock).not.toHaveBeenCalled();
  });
});
