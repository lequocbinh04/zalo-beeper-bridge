// Facade over zca-js: the ONLY module allowed to import zca-js runtime classes.
// Contains login lifecycle, listener resilience, normalization, and rate-limited sends.
import { EventEmitter } from "node:events";
import { Zalo, LoginQRCallbackEventType, ThreadType, type API } from "zca-js";
import { loadCredentials, saveCredentials, clearCredentials } from "./credential-store.ts";
import { normalizeZaloMessage } from "./event-normalizer.ts";
import { ListenerManager } from "./listener-manager.ts";
import { RateLimiter } from "./rate-limiter.ts";
import type { RawZaloMessage, ZaloMessage, ZaloThreadType } from "./types.ts";

export interface ZaloClientOptions {
  credsPath: string;
  messagesPerMinute: number;
}

interface ZaloClientEvents {
  message: [message: ZaloMessage];
  connected: [];
  reconnecting: [attempt: number, delayMs: number];
  dead: [reason: string];
}

export type ListenerState = "stopped" | "connected" | "reconnecting" | "dead";

export class ZaloClient extends EventEmitter<ZaloClientEvents> {
  private api: API | null = null;
  private readonly listenerManager = new ListenerManager();
  private readonly rateLimiter: RateLimiter;
  private readonly startedAt = Date.now();
  private readonly opts: ZaloClientOptions;
  private listenerState: ListenerState = "stopped";
  private loginInFlight = false;

  constructor(opts: ZaloClientOptions) {
    super();
    this.opts = opts;
    this.rateLimiter = new RateLimiter(opts.messagesPerMinute);
    this.listenerManager.on("connected", () => {
      this.listenerState = "connected";
      this.emit("connected");
    });
    this.listenerManager.on("reconnecting", (attempt, delayMs) => {
      this.listenerState = "reconnecting";
      this.emit("reconnecting", attempt, delayMs);
    });
    this.listenerManager.on("dead", (reason) => {
      // Session is unusable — drop it so 'login' works as the recovery path
      this.listenerState = "dead";
      this.listenerManager.stop();
      this.api = null;
      this.emit("dead", reason);
    });
  }

  private newZalo(): Zalo {
    // selfListen: own sends (any device) arrive with isSelf=true — used for echo suppression
    return new Zalo({ selfListen: true, checkUpdate: false, logging: false });
  }

  get isLoggedIn(): boolean {
    return this.api !== null;
  }

  get ownId(): string | null {
    return this.api?.getOwnId() ?? null;
  }

  get status(): { loggedIn: boolean; ownId: string | null; listener: ListenerState; uptimeMs: number } {
    return { loggedIn: this.isLoggedIn, ownId: this.ownId, listener: this.listenerState, uptimeMs: Date.now() - this.startedAt };
  }

  /** Cookie re-login from saved credentials. Returns false when absent/invalid. */
  async loginFromSavedCredentials(): Promise<boolean> {
    const creds = loadCredentials(this.opts.credsPath);
    if (!creds) return false;
    try {
      this.api = await this.newZalo().login(creds);
      return true;
    } catch (err) {
      console.warn("Zalo cookie re-login failed:", (err as Error).message);
      return false;
    }
  }

  /**
   * Interactive QR login. deliverQrPng is called with the QR image (PNG buffer)
   * for display in the Matrix management room. Resolves once logged in.
   */
  async loginWithQR(deliverQrPng: (png: Buffer) => Promise<void>): Promise<void> {
    if (this.loginInFlight) throw new Error("A QR login is already in progress — scan the existing QR");
    this.loginInFlight = true;
    try {
      await this.doLoginWithQR(deliverQrPng);
    } finally {
      this.loginInFlight = false;
    }
  }

  private async doLoginWithQR(deliverQrPng: (png: Buffer) => Promise<void>): Promise<void> {
    let qrRetries = 0;
    const api = await this.newZalo().loginQR({}, (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          // event.data.image is raw base64 PNG (data-URI prefix already stripped by zca-js)
          void deliverQrPng(Buffer.from(event.data.image, "base64")).catch((err) =>
            console.error("Failed to deliver QR image:", err),
          );
          break;
        case LoginQRCallbackEventType.QRCodeExpired:
          if (++qrRetries <= 2) event.actions.retry();
          else event.actions.abort();
          break;
        case LoginQRCallbackEventType.QRCodeDeclined:
          event.actions.abort();
          break;
        case LoginQRCallbackEventType.GotLoginInfo: {
          const { cookie, imei, userAgent } = event.data;
          saveCredentials(this.opts.credsPath, { cookie, imei, userAgent });
          break;
        }
      }
    });
    if (!api) throw new Error("QR login aborted (expired or declined)");
    this.api = api;
  }

  startListening(): void {
    if (!this.api) throw new Error("Not logged in");
    this.listenerState = "reconnecting"; // until first "connected"
    this.api.listener.on("message", (raw) => {
      const normalized = normalizeZaloMessage(raw as unknown as RawZaloMessage);
      if (normalized) this.emit("message", normalized);
    });
    this.listenerManager.start(this.api);
  }

  stopListening(): void {
    this.listenerManager.stop();
    this.listenerState = "stopped";
  }

  logout(): void {
    this.stopListening();
    this.api = null;
    clearCredentials(this.opts.credsPath);
  }

  /** Rate-limited text send. Returns Zalo msgId (echo-suppression key) when available. */
  async sendText(threadId: string, threadType: ZaloThreadType, text: string): Promise<{ msgId: string | null }> {
    // Capture before the rate-limit wait — logout during the wait must not null-deref
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await this.rateLimiter.acquire();
    const result = await api.sendMessage(text, threadId, threadType === "group" ? ThreadType.Group : ThreadType.User);
    return { msgId: result.message?.msgId != null ? String(result.message.msgId) : null };
  }
}
