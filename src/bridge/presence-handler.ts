// Zalo→Matrix ephemeral signals: read receipts and typing indicators.
// One-way only — zca-js exposes no API to push seen/typing back to Zalo.
import type { MappingStore } from "./mapping-store.ts";
import type { PuppetRegistry } from "./puppet-registry.ts";
import type { ZaloSeenEvent, ZaloTypingEvent } from "../zalo/types.ts";

const TYPING_STOP_MS = 8_000;

export class PresenceHandler {
  private readonly store: MappingStore;
  private readonly puppets: PuppetRegistry;
  /** auto-stop timers keyed by roomId|uid so repeated typing events extend, not stack */
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(store: MappingStore, puppets: PuppetRegistry) {
    this.store = store;
    this.puppets = puppets;
  }

  async handleSeen(event: ZaloSeenEvent): Promise<void> {
    const portal = this.store.getPortalByThread(event.threadId);
    if (!portal) return;
    const eventId = this.store.getEventIdByMsgId(event.msgId);
    if (!eventId) return; // message predates the bridge or wasn't bridged

    // DM: the peer (thread id) saw it; group: exactly the uids Zalo reports
    const uids = event.threadType === "user" ? [event.threadId] : event.seenUids;
    for (const uid of uids) {
      await this.puppets
        .intentFor(uid)
        .sendReadReceipt(portal.room_id, eventId)
        .catch((err: Error) => console.warn(`read receipt ${uid}@${portal.room_id} failed:`, err.message));
    }
  }

  async handleTyping(event: ZaloTypingEvent): Promise<void> {
    const portal = this.store.getPortalByThread(event.threadId);
    if (!portal) return;
    const intent = this.puppets.intentFor(event.uid);
    const key = `${portal.room_id}|${event.uid}`;

    await intent.sendTyping(portal.room_id, true).catch(() => undefined);
    const existing = this.typingTimers.get(key);
    if (existing) clearTimeout(existing);
    this.typingTimers.set(
      key,
      setTimeout(() => {
        this.typingTimers.delete(key);
        void intent.sendTyping(portal.room_id, false).catch(() => undefined);
      }, TYPING_STOP_MS),
    );
  }
}
