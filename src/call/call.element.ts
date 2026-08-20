import styles from "./call.element.css?inline";
import { startCall } from "./call.service";
import type { CallController } from "./call.service";
import type { CallSetup, CallState } from "./call.types";

const template = document.createElement("template");
template.innerHTML = `
  <p class="status" data-cy="call-text-estado"></p>
  <p class="error" data-cy="call-text-error" hidden></p>
  <button type="button" data-cy="call-button-colgar">Colgar</button>
`;

/** Pantalla de llamada activa: estado de conexión, audio remoto y colgar. */
export class CallScreenElement extends HTMLElement {
  private controller: CallController | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const sheet = document.createElement("style");
    sheet.textContent = styles;
    shadow.append(sheet, template.content.cloneNode(true));

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="call-button-colgar"]')
      ?.addEventListener("click", () => {
        this.controller?.hangUp();
        this.finish();
      });
  }

  /** Arranca la llamada sobre una conexión de señalización ya emparejada. */
  start(setup: CallSetup): void {
    this.controller = startCall(setup, {
      onStateChange: (state) => {
        this.render(state);
      },
      onRemoteTrack: (stream) => {
        this.playRemoteAudio(stream);
      },
    });
  }

  private playRemoteAudio(stream: MediaStream): void {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
  }

  private render(state: CallState): void {
    this.setStatus(statusText(state.status));
    if (state.status === "permission-denied" || state.status === "connection-failed") {
      this.setError(errorText(state.status));
    } else {
      this.hideError();
    }
    if (state.status === "ended") {
      this.finish();
    }
  }

  private finish(): void {
    this.dispatchEvent(new CustomEvent("call-ended", { bubbles: true, composed: true }));
    this.replaceWith(document.createElement("pairing-screen"));
  }

  private setStatus(text: string): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="call-text-estado"]');
    if (el) el.textContent = text;
  }

  private setError(text: string): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="call-text-error"]');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  private hideError(): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="call-text-error"]');
    if (el) el.hidden = true;
  }
}

function statusText(status: CallState["status"]): string {
  switch (status) {
    case "requesting-permission":
      return "Pidiendo permiso de micrófono…";
    case "connecting":
      return "Conectando…";
    case "in-call":
      return "En llamada";
    case "reconnecting":
      return "Reconectando…";
    case "permission-denied":
      return "No se pudo iniciar la llamada";
    case "connection-failed":
      return "No se pudo completar la llamada";
    case "ended":
      return "Llamada finalizada";
  }
}

function errorText(status: "permission-denied" | "connection-failed"): string {
  return status === "permission-denied"
    ? "No se ha concedido permiso de micrófono. Actívalo en los ajustes de la app para poder hablar."
    : "No se ha podido establecer la conexión de audio. Comprueba la conexión de datos e inténtalo de nuevo.";
}

if (!customElements.get("call-screen")) {
  customElements.define("call-screen", CallScreenElement);
}
