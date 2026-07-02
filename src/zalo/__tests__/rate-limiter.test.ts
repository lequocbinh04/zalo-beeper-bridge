import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../rate-limiter.ts";

describe("RateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("grants the first acquire immediately", async () => {
    const limiter = new RateLimiter(6); // 10s interval
    const t0 = Date.now();
    await limiter.acquire();
    expect(Date.now() - t0).toBe(0);
  });

  it("spaces successive grants by the configured interval", async () => {
    const limiter = new RateLimiter(6); // 10s interval
    await limiter.acquire();
    const done: number[] = [];
    const p2 = limiter.acquire().then(() => done.push(Date.now()));
    const p3 = limiter.acquire().then(() => done.push(Date.now()));
    await vi.advanceTimersByTimeAsync(10_000);
    await p2;
    await vi.advanceTimersByTimeAsync(10_000);
    await p3;
    expect(done[1]! - done[0]!).toBe(10_000);
  });

  it("rejects a non-positive rate", () => {
    expect(() => new RateLimiter(0)).toThrow();
  });
});
