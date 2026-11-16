// Resilient wrapper around zca-js Listener: zca-js retryOnClose handles transient
// drops internally; this layer adds exponential backoff restarts on final closes
// and escalates to "dead" after repeated failures (cookie expiry / listener stolen).
// Abnormal closes (1006: network down, DNS failure, host asleep) never escalate:
// they keep retrying at the capped backoff so the bridge recovers by itself
// once the network is back, however long the outage lasted.
//
// Escalation counter resets only after a STABLE period of connection, not on
// connect alone — a duplicate-connection fight connects fine before each kick,
// so resetting on "connected" would loop at 5s forever without ever escalating.
import { EventEmitter } from 'node:events';
import type { API } from 'zca-js';
import { errorMessage } from '../error-message.ts';

// CloseReason values from zca-js (no enum imports — erasableSyntaxOnly)
const MANUAL_CLOSURE = 1000;
const ABNORMAL_CLOSURE = 1006; // socket dropped without a close frame (network)
const DUPLICATE_CONNECTION = 3000; // another Zalo Web/listener took over

const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000] as const;
const MAX_CONSECUTIVE_FAILURES = 8;
const STABLE_CONNECTION_MS = 60_000;

type ListenerManagerEvents = {
  connected: [];
  reconnecting: [attempt: number, delayMs: number];
  /** Listener given up — needs re-login or manual intervention. Emitted once per start(). */
  dead: [reason: string];
};

type ListenerHandlers = {
  connected: () => void;
  closed: (code: number, reason: string) => void;
  error: (err: unknown) => void;
};

/**
 * Supervises one zca-js listener at a time: restarts it with backoff after
 * unexpected closes, emits `connected` / `reconnecting`, and latches `dead` once
 * more than MAX_CONSECUTIVE_FAILURES non-network closes happen without a stable connection
 * in between. Abnormal (1006) closes retry forever at the capped backoff.
 */
export class ListenerManager extends EventEmitter<ListenerManagerEvents> {
  private api: API | null = null;
  private handlers: ListenerHandlers | null = null;
  private stopped = true;
  private deadLatched = false;
  private consecutiveFailures = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private stabilityTimer: NodeJS.Timeout | null = null;

  /**
   * Attach to a logged-in API instance and start listening.
   * Detaches from any previous API first, resets the failure streak and dead latch,
   * subscribes to the listener's connected / closed / error events and starts it
   * with zca-js retryOnClose.
   */
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
        this.emit('connected');
      },
      closed: (code, reason) => {
        this.clearStabilityTimer();
        if (this.stopped || code === MANUAL_CLOSURE) return;
        this.scheduleRestart(code, reason);
      },
      // zca-js emits "error" for ws failures AND malformed inbound payloads;
      // with no listener attached, EventEmitter would crash the process.
      error: (err) => {
        console.error('[zalo] listener error:', errorMessage(err));
      },
    };
    api.listener.on('connected', this.handlers.connected);
    api.listener.on('closed', this.handlers.closed);
    api.listener.on('error', this.handlers.error);

    api.listener.start({ retryOnClose: true });
  }

  /**
   * Stops supervising: cancels pending restart / stability timers, unsubscribes the
   * handlers and stops the zca-js listener. Safe to call when already stopped.
   */
  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearStabilityTimer();
    if (this.api && this.handlers) {
      this.api.listener.off('connected', this.handlers.connected);
      this.api.listener.off('closed', this.handlers.closed);
      this.api.listener.off('error', this.handlers.error);
      this.api.listener.stop();
    }
    this.api = null;
    this.handlers = null;
  }

  /** Cancels the pending "connection is stable → reset failure streak" timer, if any. */
  private clearStabilityTimer(): void {
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
  }

  /**
   * Counts a failure and either latches `dead` (streak exceeded) or emits
   * `reconnecting` and schedules a listener restart after the backoff delay.
   *
   * @param code zca-js CloseReason code of the close that triggered this
   * @param reason close reason text (included in the dead message)
   */
  private scheduleRestart(code: number, reason: string): void {
    if (this.deadLatched) return;
    this.consecutiveFailures++;
    if (this.consecutiveFailures > MAX_CONSECUTIVE_FAILURES && code !== ABNORMAL_CLOSURE) {
      this.deadLatched = true;
      const deadReason =
        code === DUPLICATE_CONNECTION
          ? 'another Zalo Web session keeps taking over the connection'
          : `listener keeps closing (code=${code} ${reason})`;
      this.emit('dead', deadReason);
      return;
    }
    const delayMs = BACKOFF_MS[Math.min(this.consecutiveFailures - 1, BACKOFF_MS.length - 1)] ?? 300_000;
    this.emit('reconnecting', this.consecutiveFailures, delayMs);
    this.retryTimer = setTimeout(() => {
      if (this.stopped) return;
      try {
        this.api?.listener.start({ retryOnClose: true });
      } catch (err) {
        // zca-js throws "Already started" if a socket is somehow live — treat as recovered
        console.warn('[zalo] listener restart skipped:', errorMessage(err));
      }
    }, delayMs);
  }
}
