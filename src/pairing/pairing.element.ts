import "../call/call.element";
import type { CallRole } from "../call/call.types";
import { hasConnectivity } from "../shared/network.service";
import styles from "./pairing.element.css?inline";
import { connectToSignaling } from "./pairing.service";
import { buildSignalingUrl } from "./pairing.transform";
import type { SignalingMessage, SignalingConnection } from "./pairing.types";

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
  private callRole: CallRole | null = null;
  private roomCode: string | null = null;
  private myToken: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const sheet = document.createElement("style");
    sheet.textContent = styles;
    shadow.append(sheet, template.content.cloneNode(true));

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-crear"]')
      ?.addEventListener("click", () => {
        if (!this.requireConnectivity()) return;
        this.roomCode = null;
        this.startConnection(buildSignalingUrl(signalingBaseUrl(), {}), "offerer");
      });

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-cy="pairing-button-unirse"]')
      ?.addEventListener("click", () => {
        const code = this.codeInput()?.value.trim();
        if (!code) return;
        if (!this.requireConnectivity()) return;
        this.roomCode = code;
        this.startConnection(buildSignalingUrl(signalingBaseUrl(), { code }), "answerer");
      });
  }

  private requireConnectivity(): boolean {
    if (hasConnectivity()) return true;
    this.showError("no_connection");
    return false;
  }

  private codeInput(): HTMLInputElement | null | undefined {
    return this.shadowRoot?.querySelector<HTMLInputElement>('[data-cy="pairing-input-codigo"]');
  }

  private startConnection(url: string, role: CallRole): void {
    this.hideError();
    this.callRole = role;
    this.connection = connectToSignaling(url);
    this.connection.onMessage((message) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: SignalingMessage): void {
    switch (message.type) {
      case "created":
        this.roomCode = message.code;
        this.myToken = message.token;
        this.showCode(message.code);
        break;
      case "error":
        this.showError(message.reason);
        break;
      case "peer-joined":
        if (message.token) this.myToken = message.token;
        this.transitionToCall();
        break;
      case "peer-reconnected":
      case "reconnecting":
      case "peer-left":
      case "offer":
      case "answer":
      case "ice-candidate":
        // Señalización WebRTC y estados de llamada activa: no llegan aquí en
        // condiciones normales porque ya nos hemos transicionado a
        // call.element.ts en cuanto "peer-joined" emparejó la sala.
        break;
    }
  }

  private transitionToCall(): void {
    if (!this.connection || !this.callRole || !this.roomCode || !this.myToken) return;
    const code = this.roomCode;
    const token = this.myToken;
    const callScreen = document.createElement("call-screen") as HTMLElement & {
      start: (setup: {
        connection: SignalingConnection;
        role: CallRole;
        reconnect: () => Promise<SignalingConnection>;
      }) => void;
    };
    this.replaceWith(callScreen);
    callScreen.start({
      connection: this.connection,
      role: this.callRole,
      reconnect: () => reconnectToRoom(code, token),
    });
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
    case "no_connection":
      return "No hay conexión de datos disponible. Comprueba tu WiFi o datos móviles.";
    default:
      return "No se ha podido conectar. Inténtalo de nuevo.";
  }
}

/**
 * Redial a la señalización tras una caída, usando el código de sala y el
 * token de este participante. No espera confirmación explícita del
 * servidor (no la manda, ver hub.go): si el redial no sirvió de verdad, la
 * conexión resultante se cerrará enseguida y el propio bucle de
 * reconexión de call.service.ts lo detectará y lo reintentará.
 */
function reconnectToRoom(code: string, token: string): Promise<SignalingConnection> {
  return Promise.resolve(
    connectToSignaling(buildSignalingUrl(signalingBaseUrl(), { code, token })),
  );
}

if (!customElements.get("pairing-screen")) {
  customElements.define("pairing-screen", PairingScreenElement);
}
