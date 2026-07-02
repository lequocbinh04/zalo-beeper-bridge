// Outbound pipeline: owner's Matrix message in a portal room → Zalo thread.
// Guards against two echo loops:
//   1. bridge-posted events (own phone messages double-puppeted as owner) — skipped via event_id
//   2. selfListen re-delivery of what we just sent — registered with EchoSuppressor
import type { Bridge, WeakEvent } from "matrix-appservice-bridge";
import type { EchoSuppressor } from "./echo-suppressor.ts";
import type { MappingStore } from "./mapping-store.ts";
import type { ZaloClient } from "../zalo/zalo-client.ts";

export interface OutboundHandlerDeps {
  bridge: Bridge;
  store: MappingStore;
  zalo: ZaloClient;
  echo: EchoSuppressor;
  ownerUserId: string;
}

export class OutboundHandler {
  private readonly deps: OutboundHandlerDeps;

  constructor(deps: OutboundHandlerDeps) {
    this.deps = deps;
  }

  /** Returns true when the event was a portal message this handler owns. */
  async handle(event: WeakEvent): Promise<boolean> {
    if (event.type !== "m.room.message" || !event.room_id) return false;
    const portal = this.deps.store.getPortalByRoom(event.room_id);
    if (!portal) return false;

    // Only the owner's own typing is bridged outbound
    if (event.sender !== this.deps.ownerUserId) return true;
    // Skip events the bridge itself posted (double-puppeted phone messages)
    if (event.event_id && this.deps.store.hasEventId(event.event_id)) return true;

    const content = event.content as { msgtype?: string; body?: string };
    if (content.msgtype !== "m.text" || !content.body) {
      await this.deps.bridge
        .getIntent()
        .sendMessage(event.room_id, { msgtype: "m.notice", body: "[bridge] only text is supported outbound so far" });
      return true;
    }

    try {
      this.deps.echo.expect(portal.thread_id, content.body);
      const { msgId } = await this.deps.zalo.sendText(portal.thread_id, portal.thread_type, content.body);
      if (msgId) this.deps.store.recordMessage(msgId, event.room_id, event.event_id ?? null, "outbound");
    } catch (err) {
      await this.deps.bridge
        .getIntent()
        .sendMessage(event.room_id, { msgtype: "m.notice", body: `⚠ Failed to deliver to Zalo: ${(err as Error).message}` });
    }
    return true;
  }
}
