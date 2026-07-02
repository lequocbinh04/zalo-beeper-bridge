// Token-bucket rate limiter for outbound Zalo sends.
// A burst of tokens lets normal back-and-forth chatting go through instantly;
// only sustained sending is paced (protects the main account without adding
// visible latency to real conversations). Refills at `perMinute` tokens/min.
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefill: number;
  // Serialize acquires so concurrent callers can't all refill+consume against the
  // same snapshot and fire together (thundering herd defeating the pacing).
  private chain: Promise<void> = Promise.resolve();

  constructor(perMinute: number, burst?: number) {
    if (perMinute <= 0) throw new Error("perMinute must be > 0");
    this.capacity = burst ?? Math.max(perMinute, 1);
    this.refillPerMs = perMinute / 60_000;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.refillPerMs);
    this.lastRefill = now;
  }

  /** Resolves immediately while burst tokens remain; otherwise waits for one to refill. */
  acquire(): Promise<void> {
    const result = this.chain.then(() => this.doAcquire());
    this.chain = result.catch(() => undefined); // keep the chain alive on rejection
    return result;
  }

  private async doAcquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.refill();
    }
    this.tokens = Math.max(0, this.tokens - 1);
  }
}
