import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../rate-limiter.ts";

describe("RateLimiter (token bucket)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets a burst of sends through instantly", async () => {
    const limiter = new RateLimiter(30, 5); // burst of 5
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await limiter.acquire();
    expect(Date.now() - t0).toBe(0); // all 5 immediate
  });

  it("paces once the burst is exhausted", async () => {
    const limiter = new RateLimiter(60, 2); // burst 2, refill 1/sec
    await limiter.acquire();
    await limiter.acquire(); // burst used up
    const p = limiter.acquire().then(() => Date.now());
    await vi.advanceTimersByTimeAsync(1000); // one token refills after ~1s
    const grantedAt = await p;
    expect(grantedAt).toBeGreaterThanOrEqual(1000);
  });

  it("refills over time so later sends are instant again", async () => {
    const limiter = new RateLimiter(60, 1); // burst 1, refill 1/sec
    await limiter.acquire();
    await vi.advanceTimersByTimeAsync(5000); // idle 5s → bucket refills (capped at burst)
    const t = Date.now();
    await limiter.acquire();
    expect(Date.now() - t).toBe(0);
  });

  it("rejects a non-positive rate", () => {
    expect(() => new RateLimiter(0)).toThrow();
  });
});
