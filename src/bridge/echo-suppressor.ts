// Suppresses the selfListen echo of messages the bridge just sent to Zalo.
//
// When the owner types in Beeper → we send to Zalo → zca-js selfListen delivers
// that same message back with isSelf=true. Without suppression it would be
// re-posted into the portal as a duplicate. msgId from the send response can lag
// the echo, so we match on (threadId, content) within a short TTL window.
const TTL_MS = 15_000;

interface PendingEcho {
  text: string;
  expiresAt: number;
}

export class EchoSuppressor {
  private readonly pending = new Map<string, PendingEcho[]>();
  // Media echoes match on URL (images have no pre-send msgId) — url → expiry
  private readonly pendingMedia = new Map<string, number>();

  /** Register the URLs of an image we just sent so its selfListen echo is dropped. */
  expectMedia(urls: string[]): void {
    const expiry = Date.now() + TTL_MS;
    for (const url of urls) if (url) this.pendingMedia.set(url, expiry);
  }

  /** True when this inbound media URL is the echo of something we just sent. */
  consumeMedia(url: string): boolean {
    const expiry = this.pendingMedia.get(url);
    if (expiry === undefined) return false;
    this.pendingMedia.delete(url);
    return expiry > Date.now();
  }

  /** Call right before sending to Zalo. */
  expect(threadId: string, text: string): void {
    const list = this.pending.get(threadId) ?? [];
    list.push({ text, expiresAt: Date.now() + TTL_MS });
    this.pending.set(threadId, list);
  }

  /** Removes one pending entry — call when a send FAILED so a real phone-typed
   * message with identical text isn't wrongly swallowed. */
  cancel(threadId: string, text: string): void {
    const list = this.pending.get(threadId);
    if (!list) return;
    const idx = list.findIndex((e) => e.text === text);
    if (idx !== -1) list.splice(idx, 1);
    if (!list.length) this.pending.delete(threadId);
  }

  /** Returns true (and consumes the entry) when this self-message is our own echo. */
  consume(threadId: string, text: string): boolean {
    const list = this.pending.get(threadId);
    if (!list) return false;
    const now = Date.now();
    const idx = list.findIndex((e) => e.text === text && e.expiresAt > now);
    // Drop expired entries opportunistically
    const fresh = list.filter((e) => e.expiresAt > now && e !== list[idx]);
    if (fresh.length) this.pending.set(threadId, fresh);
    else this.pending.delete(threadId);
    return idx !== -1;
  }
}
