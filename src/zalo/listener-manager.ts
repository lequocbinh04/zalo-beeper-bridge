// Resilient wrapper around zca-js Listener: zca-js retryOnClose handles transient
// drops internally; this layer adds exponential backoff restarts on final closes
// and escalates to "dead" after repeated failures (cookie expiry / listener stolen).
//
// Escalation counter resets only after a STABLE period of connection, not on
// connect alone — a duplicate-connection fight connects fine before each kick,
// so resetting on "connected" would loop at 5s forever without ever escalating.
import { EventEmitter } from "node:events";
import type { API } from "zca-js";

// CloseReason values from zca-js (no enum imports — erasableSyntaxOnly)
const MANUAL_CLOSURE = 1000;
const DUPLICATE_CONNECTION = 3000; // another Zalo Web/listener took over

const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000] as const;
const MAX_CONSECUTIVE_FAILURES = 8;
const STABLE_CONNECTION_MS = 60_000;

interface ListenerManagerEvents {
  connected: [];
  reconnecting: [attempt: number, delayMs: number];
  /** Listener given up — needs re-login or manual intervention. Emitted once per start(). */
  dead: [reason: string];
}

type ListenerHandlers = {
  connected: () => void;
  closed: (code: number, reason: string) => void;
  error: (err: unknown) => void;
};

export class ListenerManager extends EventEmitter<ListenerManagerEvents> {
  private api: API | null = null;
  private handlers: ListenerHandlers | null = null;
  private stopped = true;
  private deadLatched = false;
  private consecutiveFailures = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private stabilityTimer: NodeJS.Timeout | null = null;

  /** Attach to a logged-in API instance and start listening. */
  start(api: API): void {
    this.stop(); // detach from any previous api first
    this.api = api;
    this.stopped = false;
    this.deadLatched = false;
    this.consecutiveFailures = 0;

    this.handlers = {
      connected: () => {
        // Only a connection that SURVIVES the stability window clears the failure streak
        this.clearStabilityTimer();
        this.stabilityTimer = setTimeout(() => {
          this.consecutiveFailures = 0;
        }, STABLE_CONNECTION_MS);
        this.emit("connected");
      },
      closed: (code, reason) => {
        this.clearStabilityTimer();
        if (this.stopped || code === MANUAL_CLOSURE) return;
        this.scheduleRestart(code, reason);
      },
      // zca-js emits "error" for ws failures AND malformed inbound payloads;
      // with no listener attached, EventEmitter would crash the process.
      error: (err) => {
        console.error("[zalo] listener error:", err instanceof Error ? err.message : err);
      },
    };
    api.listener.on("connected", this.handlers.connected);
    api.listener.on("closed", this.handlers.closed);
    api.listener.on("error", this.handlers.error);

    api.listener.start({ retryOnClose: true });
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearStabilityTimer();
    if (this.api && this.handlers) {
      this.api.listener.off("connected", this.handlers.connected);
      this.api.listener.off("closed", this.handlers.closed);
      this.api.listener.off("error", this.handlers.error);
      this.api.listener.stop();
    }
    this.api = null;
    this.handlers = null;
  }

  private clearStabilityTimer(): void {
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
  }

  private scheduleRestart(code: number, reason: string): void {
    if (this.deadLatched) return;
    this.consecutiveFailures++;
    if (this.consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
      this.deadLatched = true;
      const why = code === DUPLICATE_CONNECTION
        ? "another Zalo Web session keeps taking over the connection"
        : `listener keeps closing (code=${code} ${reason})`;
      this.emit("dead", why);
      return;
    }
    const delay = BACKOFF_MS[Math.min(this.consecutiveFailures - 1, BACKOFF_MS.length - 1)] ?? 300_000;
    this.emit("reconnecting", this.consecutiveFailures, delay);
    this.retryTimer = setTimeout(() => {
      if (this.stopped) return;
      try {
        this.api?.listener.start({ retryOnClose: true });
      } catch (err) {
        // zca-js throws "Already started" if a socket is somehow live — treat as recovered
        console.warn("[zalo] listener restart skipped:", (err as Error).message);
      }
    }, delay);
  }
}
