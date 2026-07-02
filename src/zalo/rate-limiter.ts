// Serializes outbound Zalo sends with a fixed minimum gap (human-like pacing).
// Mandatory safeguard: bridge runs on the user's main account (validation decision).
export class RateLimiter {
  private nextFreeAt = 0;
  private readonly perMinute: number;

  constructor(perMinute: number) {
    if (perMinute <= 0) throw new Error("perMinute must be > 0");
    this.perMinute = perMinute;
  }

  /** Resolves when the caller may send; enforces min interval between grants. */
  async acquire(): Promise<void> {
    const interval = 60_000 / this.perMinute;
    const now = Date.now();
    const grantedAt = Math.max(now, this.nextFreeAt);
    this.nextFreeAt = grantedAt + interval;
    if (grantedAt > now) {
      await new Promise((resolve) => setTimeout(resolve, grantedAt - now));
    }
  }
}
