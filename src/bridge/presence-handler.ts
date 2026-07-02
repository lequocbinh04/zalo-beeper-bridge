// Zalo→Matrix ephemeral signals: read receipts and typing indicators.
// One-way only — zca-js exposes no API to push seen/typing back to Zalo.
import type { MappingStore } from "./mapping-store.ts";
import type { PuppetRegistry } from "./puppet-registry.ts";
import { zaloToEmoji } from "../zalo/reaction-map.ts";
import type { ZaloClient } from "../zalo/zalo-client.ts";
import type { ZaloReactionEvent, ZaloSeenEvent, ZaloTypingEvent } from "../zalo/types.ts";

const TYPING_STOP_MS = 8_000;

export class PresenceHandler {
  private readonly store: MappingStore;
  private readonly puppets: PuppetRegistry;
  /** own Zalo uid — group seenUids can include it; a ghost of the OWNER must never join */
  private readonly getOwnZaloId: () => string | null;
  /** auto-stop timers keyed by roomId|uid so repeated typing events extend, not stack */
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();

  private readonly zalo: ZaloClient;
  private readonly ownerUserId: string;

  constructor(store: MappingStore, puppets: PuppetRegistry, zalo: ZaloClient, ownerUserId: string, getOwnZaloId: () => string | null) {
    this.store = store;
    this.puppets = puppets;
    this.zalo = zalo;
    this.ownerUserId = ownerUserId;
    this.getOwnZaloId = getOwnZaloId;
  }

  /** Owner read a portal in Beeper → mark seen on Zalo (m.receipt EDU). */
  async handleOwnerReceipt(roomId: string, content: Record<string, unknown>): Promise<void> {
    const portal = this.store.getPortalByRoom(roomId);
    if (!portal) return;
    // Find the most recent read event id belonging to the owner
    let readEventId: string | null = null;
    for (const [eventId, receipts] of Object.entries(content)) {
      const readBy = (receipts as { "m.read"?: Record<string, unknown> })["m.read"];
      if (readBy && this.ownerUserId in readBy) readEventId = eventId;
    }
    if (!readEventId) return;
    const target = this.store.getZaloTargetByEventId(readEventId);
    if (!target?.cliMsgId) return;
    await this.zalo.sendSeen(portal.thread_id, portal.thread_type, target.zaloMsgId, target.cliMsgId);
  }

  /** Owner typing in a portal → show typing on Zalo (m.typing EDU). */
  async handleOwnerTyping(roomId: string, userIds: string[]): Promise<void> {
    if (!userIds.includes(this.ownerUserId)) return;
    const portal = this.store.getPortalByRoom(roomId);
    if (!portal) return;
    await this.zalo.sendTypingToZalo(portal.thread_id, portal.thread_type);
  }

  async handleSeen(event: ZaloSeenEvent): Promise<void> {
    const portal = this.store.getPortalByThread(event.threadId);
    if (!portal) return;
    const eventId = this.store.getEventIdByMsgId(event.msgId);
    if (!eventId) return; // message predates the bridge or wasn't bridged

    // DM: the peer (thread id) saw it; group: exactly the uids Zalo reports.
    // Never emit a receipt for the owner's own uid — that would join an
    // owner-doppelganger ghost into the room ("seen by @sh-zalo_<own-uid>").
    const ownId = this.getOwnZaloId();
    const uids = (event.threadType === "user" ? [event.threadId] : event.seenUids).filter(
      (uid) => String(uid) !== ownId && uid !== "",
    );
    for (const uid of uids) {
      await this.puppets
        .intentFor(uid)
        .sendReadReceipt(portal.room_id, eventId)
        .catch((err: Error) => console.warn(`read receipt ${uid}@${portal.room_id} failed:`, err.message));
    }
  }

  /** Inbound reaction (Zalo→Beeper): ghost annotates the bridged Matrix event. */
  async handleReaction(event: ZaloReactionEvent): Promise<void> {
    const target = this.store.getEventByZaloMsgId(event.targetMsgId);
    if (!target?.eventId) return; // reacted-to message not bridged
    if (!event.icon) return; // reaction removal — Matrix has no clean un-react via appservice; skip
    const intent = this.puppets.intentFor(event.senderId);
    await intent
      .sendEvent(target.roomId, "m.reaction", {
        "m.relates_to": { rel_type: "m.annotation", event_id: target.eventId, key: zaloToEmoji(event.icon) },
      })
      .catch((err: Error) => console.warn("inbound reaction failed:", err.message));
  }

  async handleTyping(event: ZaloTypingEvent): Promise<void> {
    if (event.uid === this.getOwnZaloId()) return;
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
