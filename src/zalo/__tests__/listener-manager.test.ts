// Highest-risk component of Phase 3: backoff, escalation, stability reset,
// stop suppression. Stubbed zca-js api.listener (EventEmitter + start/stop spies).
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { API } from "zca-js";
import { ListenerManager } from "../listener-manager.ts";

function stubApi() {
  const listener = new EventEmitter() as EventEmitter & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  listener.start = vi.fn();
  listener.stop = vi.fn();
  return { api: { listener } as unknown as API, listener };
}

describe("ListenerManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("restarts with backoff after a non-manual close", async () => {
    const { api, listener } = stubApi();
    const manager = new ListenerManager();
    manager.start(api);
    expect(listener.start).toHaveBeenCalledTimes(1);

    listener.emit("closed", 1006, "abnormal");
    await vi.advanceTimersByTimeAsync(5_000); // first backoff step
    expect(listener.start).toHaveBeenCalledTimes(2);
  });

  it("does NOT restart after manual stop or close code 1000", async () => {
    const { api, listener } = stubApi();
    const manager = new ListenerManager();
    manager.start(api);

    listener.emit("closed", 1000, "manual");
    await vi.advanceTimersByTimeAsync(400_000);
    expect(listener.start).toHaveBeenCalledTimes(1);

    manager.stop();
    expect(listener.stop).toHaveBeenCalled();
  });

  it("escalates a connect→kick loop (code 3000) to dead — connections never stay stable", async () => {
    const { api, listener } = stubApi();
    const manager = new ListenerManager();
    const dead = vi.fn();
    manager.on("dead", dead);
    manager.start(api);

    // 9 cycles of connect-then-kick, each faster than the 60s stability window
    for (let i = 0; i < 9; i++) {
      listener.emit("connected");
      await vi.advanceTimersByTimeAsync(2_000);
      listener.emit("closed", 3000, "duplicate connection");
      await vi.advanceTimersByTimeAsync(300_000); // drain any backoff timer
    }
    expect(dead).toHaveBeenCalledTimes(1); // latched: exactly once
    expect(dead).toHaveBeenCalledWith(expect.stringContaining("taking over"));
  });

  it("resets the failure streak after a stable (60s+) connection", async () => {
    const { api, listener } = stubApi();
    const manager = new ListenerManager();
    const dead = vi.fn();
    manager.on("dead", dead);
    manager.start(api);

    // 7 quick failures (below MAX of 8) ... then one stable connection
    for (let i = 0; i < 7; i++) {
      listener.emit("closed", 1006, "flaky");
      await vi.advanceTimersByTimeAsync(300_000);
    }
    listener.emit("connected");
    await vi.advanceTimersByTimeAsync(61_000); // survives stability window → reset

    // 8 more failures allowed again before dead
    for (let i = 0; i < 8; i++) {
      listener.emit("closed", 1006, "flaky");
      await vi.advanceTimersByTimeAsync(300_000);
    }
    expect(dead).not.toHaveBeenCalled();
  });

  it("survives a listener.start that throws during timed restart", async () => {
    const { api, listener } = stubApi();
    listener.start.mockImplementationOnce(() => {}).mockImplementationOnce(() => {
      throw new Error("Already started");
    });
    const manager = new ListenerManager();
    manager.start(api);
    listener.emit("closed", 1006, "abnormal");
    await vi.advanceTimersByTimeAsync(5_000);
    // no uncaught exception — restart attempt was made and its throw swallowed
    expect(listener.start).toHaveBeenCalledTimes(2);
  });

  it("detaches old-api handlers when start() is called with a new api", () => {
    const first = stubApi();
    const second = stubApi();
    const manager = new ListenerManager();
    manager.start(first.api);
    manager.start(second.api);

    expect(first.listener.stop).toHaveBeenCalled();
    // stale close on the OLD listener must not schedule anything on the new one
    first.listener.emit("closed", 1006, "stale");
    expect(first.listener.listenerCount("closed")).toBe(0);
  });

  it("attaches an error handler so zca-js error events cannot crash the process", () => {
    const { api, listener } = stubApi();
    new ListenerManager().start(api);
    expect(listener.listenerCount("error")).toBe(1);
    // would throw ERR_UNHANDLED_ERROR without a handler:
    expect(() => listener.emit("error", new Error("ws boom"))).not.toThrow();
  });
});
