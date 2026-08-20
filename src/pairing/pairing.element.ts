import styles from "./pairing.element.css?inline";
import { connectToSignaling } from "./pairing.service";
import { buildSignalingUrl } from "./pairing.transform";
import type { ServerMessage, SignalingConnection } from "./pairing.types";

const DEFAULT_SIGNALING_URL = "ws://localhost:8090/ws";

function signalingBaseUrl(): string {
  return import.meta.env.VITE_SIGNALING_WS_URL ?? DEFAULT_SIGNALING_URL;
}

const template = document.createElement("template");
template.innerHTML = `
  <div class="actions">
    <button type="button" data-cy="pairing-button-crear">Crear sala</button>
    <div>
      <input type="text" data-cy="pairing-input-codigo" placeholder="Código de sala" />
      <button type="button" data-cy="pairing-button-unirse">Unirme</button>
    </div>
  </div>
  <p class="code-display" data-cy="pairing-text-codigo" hidden></p>
  <p class="error" data-cy="pairing-text-error" hidden></p>
`;

/** Pantalla de emparejamiento: crear una sala o unirse con un código. */
export class PairingScreenElement extends HTMLElement {
  private connection: SignalingConnection | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const sheet = document.createElement("style");
    sheet.textContent = styles;
    shadow.append(sheet, template.content.cloneNode(true));

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.addEventListener("click", () => {
        this.startConnection(buildSignalingUrl(signalingBaseUrl(), {}));
      });

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.addEventListener("click", () => {
        const code = this.codeInput()?.value.trim();
        if (!code) return;
        this.startConnection(buildSignalingUrl(signalingBaseUrl(), { code }));
      });
  }

  private codeInput(): HTMLInputElement | null | undefined {
    return this.shadowRoot?.querySelector<HTMLInputElement>('[data-cy="pairing-input-codigo"]');
  }

  private startConnection(url: string): void {
    this.hideError();
    this.connection = connectToSignaling(url);
    this.connection.onMessage((message) => { this.handleMessage(message); });
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "created":
        this.showCode(message.code);
        break;
      case "error":
        this.showError(message.reason);
        break;
      case "peer-joined":
      case "peer-reconnected":
      case "reconnecting":
      case "peer-left":
        // Estados de la llamada activa: gestionados por call.element.ts (bloque 3).
        break;
    }
  }

  private showCode(code: string): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="pairing-text-codigo"]');
    if (!el) return;
    el.textContent = code;
    el.hidden = false;
  }

  private showError(reason: string): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="pairing-text-error"]');
    if (!el) return;
    el.textContent = errorMessage(reason);
    el.hidden = false;
  }

  private hideError(): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>('[data-cy="pairing-text-error"]');
    if (el) el.hidden = true;
  }
}

function errorMessage(reason: string): string {
  switch (reason) {
    case "not_found":
      return "Ese código no existe o ha caducado. Pide uno nuevo.";
    case "full":
      return "Esa sala ya tiene dos personas conectadas.";
    case "rate_limited":
      return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
    default:
      return "No se ha podido conectar. Inténtalo de nuevo.";
  }
}

if (!customElements.get("pairing-screen")) {
  customElements.define("pairing-screen", PairingScreenElement);
}
