// Outbound pipeline: owner's Matrix events in a portal room → Zalo thread.
// Handles text (+reply quote, +edit), images, reactions, and recalls.
// Guards against two echo loops:
//   1. bridge-posted events (own phone messages double-puppeted as owner) — skipped via event_id
//   2. selfListen re-delivery of what we just sent — registered with EchoSuppressor
import { imageSize } from "image-size";
import type { Bridge, WeakEvent } from "matrix-appservice-bridge";
import type { EchoSuppressor } from "./echo-suppressor.ts";
import type { MappingStore, PortalRow } from "./mapping-store.ts";
import type { ZaloClient } from "../zalo/zalo-client.ts";

/** Removes the Matrix rich-reply fallback ("> <@user> quoted text" lines + blank line). */
export function stripReplyFallback(body: string): string {
  return body.replace(/^(?:>.*\n)+\n?/, "");
}

export interface OutboundHandlerDeps {
  bridge: Bridge;
  store: MappingStore;
  zalo: ZaloClient;
  echo: EchoSuppressor;
  ownerUserId: string;
  mediaMaxBytes: number;
}

export class OutboundHandler {
  private readonly deps: OutboundHandlerDeps;

  constructor(deps: OutboundHandlerDeps) {
    this.deps = deps;
  }

  /** Returns true when the event belonged to a portal room (handled or intentionally ignored). */
  async handle(event: WeakEvent): Promise<boolean> {
    if (!event.room_id) return false;
    const portal = this.deps.store.getPortalByRoom(event.room_id);
    if (!portal) return false;

    // Reactions and redactions are owner-only signals against a bridged message
    if (event.type === "m.reaction") return this.handleReaction(event, portal);
    if (event.type === "m.room.redaction") return this.handleRedaction(event, portal);
    if (event.type !== "m.room.message") return true;

    // Only the owner's own messages bridge outbound; skip bridge-posted echoes
    if (event.sender !== this.deps.ownerUserId) return true;
    if (event.event_id && this.deps.store.hasEventId(event.event_id)) return true;

    const content = event.content as {
      msgtype?: string;
      body?: string;
      url?: string;
      "m.new_content"?: { body?: string };
      "m.relates_to"?: { rel_type?: string; event_id?: string; "m.in_reply_to"?: { event_id?: string } };
    };

    if (content.msgtype === "m.image" && content.url) {
      await this.handleImage(event, portal, content.url, content.body);
      return true;
    }
    if (content.msgtype !== "m.text" || !content.body) {
      await this.notice(event.room_id, "[bridge] this message type is not supported outbound yet");
      return true;
    }

    let body = content.body;
    let quote;

    // Matrix edits: Zalo has no edit API — send the corrected text as a fresh message
    if (content["m.relates_to"]?.rel_type === "m.replace") {
      body = content["m.new_content"]?.body ?? body.replace(/^\* /, "");
    }

    // Matrix replies: resolve the quoted Zalo message and strip the "> ..." fallback lines
    const repliedEventId = content["m.relates_to"]?.["m.in_reply_to"]?.event_id;
    if (repliedEventId) {
      body = stripReplyFallback(body);
      const quoteJson = this.deps.store.getQuoteJsonByEventId(repliedEventId);
      if (quoteJson) {
        try {
          quote = JSON.parse(quoteJson);
        } catch {
          quote = undefined;
        }
      }
    }

    try {
      // expect() runs via onBeforeSend AFTER the rate-limit wait — the suppression
      // TTL must start at real send time or bursts outlive it (duplicate echoes)
      const { msgId } = await this.deps.zalo.sendText(portal.thread_id, portal.thread_type, body, quote, () =>
        this.deps.echo.expect(portal.thread_id, body),
      );
      if (msgId) this.deps.store.recordMessage(msgId, event.room_id, event.event_id ?? null, "outbound");
    } catch (err) {
      this.deps.echo.cancel(portal.thread_id, body);
      await this.notice(event.room_id, `⚠ Failed to deliver to Zalo: ${(err as Error).message}`);
    }
    return true;
  }

  private async handleImage(event: WeakEvent, portal: PortalRow, mxcUrl: string, filenameBody?: string): Promise<void> {
    if (event.sender !== this.deps.ownerUserId) return;
    if (event.event_id && this.deps.store.hasEventId(event.event_id)) return;
    try {
      const { data, contentType } = await this.deps.bridge.getIntent().matrixClient.downloadContent(mxcUrl);
      if (data.byteLength > this.deps.mediaMaxBytes) throw new Error("image exceeds size cap");
      let width = 0;
      let height = 0;
      try {
        const dim = imageSize(data);
        width = dim.width ?? 0;
        height = dim.height ?? 0;
      } catch {
        // dimensions optional
      }
      const ext = (contentType?.split("/")[1] ?? "jpg").split(";")[0];
      const filename = `${(filenameBody ?? "image").replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}` as `${string}.${string}`;
      const urls = await this.deps.zalo.sendImage(portal.thread_id, portal.thread_type, data, filename, width, height);
      this.deps.echo.expectMedia(urls); // drop the selfListen echo of our own image
    } catch (err) {
      await this.notice(event.room_id!, `⚠ Failed to send image to Zalo: ${(err as Error).message}`);
    }
  }

  private async handleReaction(event: WeakEvent, portal: PortalRow): Promise<boolean> {
    if (event.sender !== this.deps.ownerUserId) return true;
    const relates = (event.content as { "m.relates_to"?: { event_id?: string; key?: string } })["m.relates_to"];
    if (!relates?.event_id || !relates.key) return true;
    const target = this.deps.store.getZaloTargetByEventId(relates.event_id);
    if (!target) return true;
    try {
      // Zalo accepts cliMsgId 0 when unknown (verified live against the undo/react endpoints)
      await this.deps.zalo.react(portal.thread_id, portal.thread_type, target.zaloMsgId, target.cliMsgId ?? "0", relates.key);
    } catch (err) {
      console.warn("outbound reaction failed:", (err as Error).message);
    }
    return true;
  }

  private async handleRedaction(event: WeakEvent, portal: PortalRow): Promise<boolean> {
    if (event.sender !== this.deps.ownerUserId) return true;
    const redacts = (event as { redacts?: string }).redacts ?? (event.content as { redacts?: string }).redacts;
    if (!redacts) return true;
    const target = this.deps.store.getZaloTargetByEventId(redacts);
    if (!target) return true; // not a bridged message
    // Zalo can only recall the account's OWN messages (same rule as the app)
    if (target.direction !== "outbound") {
      await this.notice(portal.room_id, "[bridge] Zalo only allows recalling your own messages");
      return true;
    }
    try {
      // cliMsgId 0 is accepted by Zalo's undo endpoint (verified live: status 0)
      await this.deps.zalo.recall(portal.thread_id, portal.thread_type, target.zaloMsgId, target.cliMsgId ?? "0");
    } catch (err) {
      await this.notice(portal.room_id, `⚠ Zalo recall failed: ${(err as Error).message}`);
    }
    return true;
  }

  private async notice(roomId: string, body: string): Promise<void> {
    // Best-effort: the bot isn't a member of DM portals (created by the ghost), so
    // a notice there fails to join — never let that bubble up as a handler error
    await this.deps.bridge
      .getIntent()
      .sendMessage(roomId, { msgtype: "m.notice", body })
      .catch((err: Error) => console.warn(`notice to ${roomId} failed:`, err.message));
  }
}
