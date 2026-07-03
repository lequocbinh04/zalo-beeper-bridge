// Outbound pipeline: owner's Matrix events in a portal room → Zalo thread.
// Handles text (+reply quote, +edit), images, reactions, and recalls.
// Guards against two echo loops:
//   1. bridge-posted events (own phone messages double-puppeted as owner) — skipped via event_id
//   2. selfListen re-delivery of what we just sent — registered with EchoSuppressor
import { imageSize } from "image-size";
import type { Bridge, WeakEvent } from "matrix-appservice-bridge";
import type { EchoSuppressor } from "./echo-suppressor.ts";
import { downloadMatrixMedia } from "./media-handler.ts";
import { parseOutboundMentions } from "./mentions.ts";
import type { MappingStore, PortalRow } from "./mapping-store.ts";
import type { ZaloClient } from "../zalo/zalo-client.ts";

/** Removes the Matrix rich-reply fallback ("> <@user> quoted text" lines + blank line). */
export function stripReplyFallback(body: string): string {
  return body.replace(/^(?:>.*\n)+\n?/, "");
}

/**
 * Content marker on messages the bridge double-puppets as the owner (mirroring
 * the owner's own Zalo-app messages into Beeper). The homeserver echoes these
 * events back to the appservice, and the echo can beat the send-response's
 * event_id — so id-based guards race. The marker travels IN the content, so
 * OutboundHandler can drop it deterministically and never loop it back to Zalo.
 */
export const SELF_BRIDGE_MARKER = "com.zalo-bridge.self";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf",
};

/** Build a `name.ext` filename — zca-js routes attachments by extension. */
export function buildFilename(msgtype: string, nameHint: string | undefined, mimetype: string): `${string}.${string}` {
  const base = (nameHint || msgtype.replace("m.", "")).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (/\.[a-zA-Z0-9]{2,4}$/.test(base)) return base as `${string}.${string}`; // hint already has an extension
  const ext = MIME_EXT[mimetype.split(";")[0]!] ?? (msgtype === "m.image" ? "jpg" : "bin");
  return `${base}.${ext}` as `${string}.${string}`;
}

export interface OutboundHandlerDeps {
  bridge: Bridge;
  store: MappingStore;
  zalo: ZaloClient;
  echo: EchoSuppressor;
  ownerUserId: string;
  mediaMaxBytes: number;
  homeserverUrl: string;
  matrixToken: string;
  /** event_ids the bridge must never send outbound: its own double-puppet posts
   * (shared with InboundHandler) + events already handled here (retry idempotency). */
  bridgedEventIds: Set<string>;
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

    // Deterministic anti-loop: the bridge marks messages it double-puppets as the
    // owner (mirroring the owner's Zalo-app messages). Never send those back to Zalo.
    if ((event.content as Record<string, unknown>)?.[SELF_BRIDGE_MARKER]) return true;

    // Only the owner's own messages bridge outbound; skip bridge-posted echoes
    if (event.sender !== this.deps.ownerUserId) return true;
    // Idempotency + anti-loop: skip our own double-puppet posts (phone messages the
    // bridge mirrored into Beeper) and any transaction retry of an event handled here.
    // In-memory + synchronous, so it wins races the DB-backed hasEventId check can lose.
    if (event.event_id) {
      if (this.deps.bridgedEventIds.has(event.event_id)) return true;
      this.deps.bridgedEventIds.add(event.event_id);
      if (this.deps.bridgedEventIds.size > 5000) {
        for (const id of this.deps.bridgedEventIds) {
          this.deps.bridgedEventIds.delete(id);
          if (this.deps.bridgedEventIds.size <= 4000) break;
        }
      }
    }
    if (event.event_id && this.deps.store.hasEventId(event.event_id)) return true;

    const content = event.content as {
      msgtype?: string;
      body?: string;
      url?: string;
      formatted_body?: string;
      "m.new_content"?: { body?: string; formatted_body?: string };
      "m.relates_to"?: { rel_type?: string; event_id?: string; "m.in_reply_to"?: { event_id?: string } };
    };

    // Media (encrypted rooms put the mxc under file.url; unencrypted under url)
    if (content.msgtype === "m.image" || content.msgtype === "m.video" || content.msgtype === "m.file" || content.msgtype === "m.audio") {
      const mxc = content.url ?? (content as { file?: { url?: string } }).file?.url;
      if (mxc) {
        await this.handleMedia(event, portal, content.msgtype, mxc, content);
        return true;
      }
    }
    if (content.msgtype !== "m.text" || !content.body) {
      await this.notice(event.room_id, "[bridge] this message type is not supported outbound yet");
      return true;
    }

    let body = content.body;
    let quote;

    const isEdit = content["m.relates_to"]?.rel_type === "m.replace";
    // Matrix edits: Zalo has no edit API — send the corrected text as a fresh message
    if (isEdit) {
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

    // @mentions: Matrix pills → Zalo mentions on the FINAL body (owner + ghost MXIDs → uids)
    const formattedBody = isEdit ? content["m.new_content"]?.formatted_body : content.formatted_body;
    const mentions = parseOutboundMentions(body, formattedBody, (mxid) => {
      if (mxid === this.deps.ownerUserId) return this.deps.zalo.ownId;
      const m = /^@sh-zalo_(.+):/.exec(mxid);
      return m ? m[1]! : null;
    });

    try {
      // expect() runs via onBeforeSend AFTER the rate-limit wait — the suppression
      // TTL must start at real send time or bursts outlive it (duplicate echoes)
      let result;
      try {
        result = await this.deps.zalo.sendText(
          portal.thread_id,
          portal.thread_type,
          body,
          quote,
          () => this.deps.echo.expect(portal.thread_id, body),
          mentions,
        );
      } catch (quoteErr) {
        if (!quote) throw quoteErr;
        // A stale/incompatible quote payload can be rejected — degrade to a plain send
        console.warn("[outbound] quoted send failed, retrying without quote:", (quoteErr as Error).message);
        result = await this.deps.zalo.sendText(
          portal.thread_id,
          portal.thread_type,
          body,
          undefined,
          () => this.deps.echo.expect(portal.thread_id, body),
          mentions,
        );
      }
      console.log(`[out-send] evt=${event.event_id} msgId=${result.msgId} body=${JSON.stringify(body.slice(0, 40))}`);
      if (result.msgId) this.deps.store.recordMessage(result.msgId, event.room_id, event.event_id ?? null, "outbound");
      else if (event.event_id) this.deps.store.markOutboundHandled(event.event_id, event.room_id);
    } catch (err) {
      this.deps.echo.cancel(portal.thread_id, body);
      await this.notice(event.room_id, `⚠ Failed to deliver to Zalo: ${(err as Error).message}`);
    }
    return true;
  }

  private async handleMedia(event: WeakEvent, portal: PortalRow, msgtype: string, mxcUrl: string, content: { body?: string; filename?: string; info?: { mimetype?: string } }): Promise<void> {
    if (event.sender !== this.deps.ownerUserId) return;
    if (event.event_id && this.deps.store.hasEventId(event.event_id)) return;
    try {
      // Authenticated-media download via fetch (bot-sdk's downloadContent 400s on Beeper's R2 redirect)
      const { buffer: data, mimetype: dlType } = await downloadMatrixMedia(
        this.deps.homeserverUrl,
        this.deps.matrixToken,
        mxcUrl,
        this.deps.mediaMaxBytes,
      );
      const mimetype = content.info?.mimetype ?? dlType;
      // MSC2530 caption: when body differs from the filename, body is the caption.
      // Attach it to the media message so Zalo shows one captioned message, not two.
      const caption = content.body && content.body !== content.filename ? content.body : "";
      const filename = buildFilename(msgtype, content.filename, mimetype);
      // Arm the pre-send guard before the network call: the selfListen echo can
      // arrive before the send resolves and we record its msgId
      this.deps.echo.expectImage(portal.thread_id);
      if (caption) this.deps.echo.expect(portal.thread_id, caption); // caption echoes as a text selfListen event
      let msgIds: string[];
      if (msgtype === "m.image") {
        let width = 0;
        let height = 0;
        try {
          const dim = imageSize(data);
          width = dim.width ?? 0;
          height = dim.height ?? 0;
        } catch {
          // dimensions optional
        }
        msgIds = await this.deps.zalo.sendImage(portal.thread_id, portal.thread_type, data, filename, width, height, caption);
      } else {
        // video (.mp4) / file / audio — zca-js routes by extension
        msgIds = await this.deps.zalo.sendFile(portal.thread_id, portal.thread_type, data, filename, caption);
      }
      // Record msgIds for echo dedup; first carries the Matrix event_id so redacting recalls it on Zalo
      msgIds.forEach((msgId, i) => this.deps.store.recordMessage(msgId, portal.room_id, i === 0 ? (event.event_id ?? null) : null, "outbound"));
      if (msgIds.length === 0 && event.event_id) this.deps.store.markOutboundHandled(event.event_id, portal.room_id);
    } catch (err) {
      await this.notice(event.room_id!, `⚠ Failed to send ${msgtype.replace("m.", "")} to Zalo: ${(err as Error).message}`);
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
