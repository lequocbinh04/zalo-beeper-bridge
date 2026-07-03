// Inbound pipeline: ZaloMessage → dedup → puppet → portal → Matrix event.
// Per-thread promise chains preserve message order (appservice-style concurrency
// would otherwise interleave async sends within one conversation).
import type { Bridge } from "matrix-appservice-bridge";
import type { EchoSuppressor } from "./echo-suppressor.ts";
import { bridgeInboundPhoto, bridgeInboundSticker } from "./media-handler.ts";
import { buildInboundMentions } from "./mentions.ts";
import { SELF_BRIDGE_MARKER } from "./outbound-handler.ts";
import type { MappingStore } from "./mapping-store.ts";
import type { PortalManager } from "./portal-manager.ts";
import type { PuppetRegistry } from "./puppet-registry.ts";
import type { ZaloMessage } from "../zalo/types.ts";

export interface InboundHandlerDeps {
  bridge: Bridge;
  store: MappingStore;
  puppets: PuppetRegistry;
  portals: PortalManager;
  echo: EchoSuppressor;
  ownerUserId: string;
  mediaMaxBytes: number;
  resolveGroupName: (threadId: string) => Promise<string | null>;
  resolveStickerUrl: (stickerId: number) => Promise<string | null>;
  /** own Zalo uid, to map a self-mention to the owner MXID (null until logged in) */
  getOwnZaloId: () => string | null;
  /** shared with OutboundHandler: event_ids the bridge posted as the owner
   * (own phone messages) so they are never sent back to Zalo (anti-loop). */
  bridgedEventIds: Set<string>;
}

export class InboundHandler {
  private readonly deps: InboundHandlerDeps;
  private readonly threadQueues = new Map<string, Promise<void>>();

  constructor(deps: InboundHandlerDeps) {
    this.deps = deps;
  }

  /** Entry point — serializes per thread, never throws (errors are logged). */
  handle(msg: ZaloMessage): void {
    const prior = this.threadQueues.get(msg.threadId) ?? Promise.resolve();
    const next = prior
      .then(() => this.process(msg))
      .catch((err) => console.error(`[bridge] inbound ${msg.msgId} failed:`, err instanceof Error ? err.message : err))
      .finally(() => {
        if (this.threadQueues.get(msg.threadId) === next) this.threadQueues.delete(msg.threadId);
      });
    this.threadQueues.set(msg.threadId, next);
  }

  private async process(msg: ZaloMessage): Promise<void> {
    // Echo of our OWN Beeper-sent message (outbound already recorded its msgId first,
    // so hasMessage is true before the echo path below can run): backfill the quote
    // payload + cliMsgId the send response lacked, so replying to / recalling our own
    // message works. Then drop it (already visible in Beeper).
    if (msg.isSelf && this.deps.store.hasMessage(msg.msgId)) {
      this.deps.store.recordMessage(
        msg.msgId,
        this.deps.store.getPortalByThread(msg.threadId)?.room_id ?? "",
        null,
        "outbound",
        msg.quotable ? JSON.stringify(msg.quotable) : null,
        msg.cliMsgId ?? null,
      );
      return;
    }
    if (this.deps.store.hasMessage(msg.msgId)) return; // duplicate listener event

    // Our own send echoed back by selfListen → already visible in Beeper, don't repost
    const isTextEcho = msg.isSelf && msg.content.kind === "text" && this.deps.echo.consume(msg.threadId, msg.content.text);
    const isMediaEcho = msg.isSelf && msg.content.kind === "photo" && this.deps.echo.consumeImage(msg.threadId);
    if (isTextEcho || isMediaEcho) {
      // The echo carries the cliMsgId our send response lacked (needed for recall)
      // and a full quotable payload (needed to reply to our own Beeper-sent message)
      this.deps.store.recordMessage(
        msg.msgId,
        this.deps.store.getPortalByThread(msg.threadId)?.room_id ?? "",
        null,
        "outbound",
        msg.quotable ? JSON.stringify(msg.quotable) : null,
        msg.cliMsgId ?? null,
      );
      return;
    }

    const portal = await this.deps.portals.getOrCreatePortal({
      threadId: msg.threadId,
      threadType: msg.threadType,
      senderId: msg.isSelf ? msg.threadId : msg.senderId, // self-DM: portal peer is the thread, not us
      senderName: msg.isSelf ? undefined : msg.senderName,
      resolveGroupName: this.deps.resolveGroupName,
    });

    const intent = msg.isSelf ? this.intentForSelf() : await this.intentForSender(msg, portal.room_id);

    // Extra content fields merged into every post. For our own (double-puppeted)
    // messages this marks them so OutboundHandler never loops them back to Zalo.
    // Zalo quote → Matrix reply: map the quoted msgId to its bridged Matrix event.
    const extra: Record<string, unknown> = {};
    if (msg.isSelf) extra[SELF_BRIDGE_MARKER] = true;
    if (msg.replyToMsgId) {
      const target = this.deps.store.getEventByZaloMsgId(msg.replyToMsgId);
      if (target?.eventId) extra["m.relates_to"] = { "m.in_reply_to": { event_id: target.eventId } };
    }

    let eventId: string | null = null;
    switch (msg.content.kind) {
      case "text": {
        const textContent: Record<string, unknown> = { msgtype: "m.text", body: msg.content.text, ...extra };
        // @mentions → matrix.to pills + m.mentions so Beeper renders and notifies
        if (msg.mentions?.length) {
          const ownId = this.deps.getOwnZaloId();
          const { formattedBody, userIds } = buildInboundMentions(msg.content.text, msg.mentions, (uid) =>
            uid === ownId ? this.deps.ownerUserId : this.deps.puppets.mxidFor(uid),
          );
          textContent.format = "org.matrix.custom.html";
          textContent.formatted_body = formattedBody;
          textContent["m.mentions"] = { user_ids: userIds };
        }
        const r = await intent.sendMessage(portal.room_id, textContent);
        eventId = r.event_id;
        break;
      }
      case "photo": {
        try {
          const r = await bridgeInboundPhoto(intent, portal.room_id, msg.content, this.deps.mediaMaxBytes, extra);
          eventId = r.eventId;
        } catch (err) {
          const r = await intent.sendMessage(portal.room_id, {
            msgtype: "m.notice",
            body: `[Zalo photo could not be bridged: ${(err as Error).message}]`,
            ...extra,
          });
          eventId = r.event_id;
        }
        break;
      }
      case "sticker": {
        try {
          const url = await this.deps.resolveStickerUrl(msg.content.id);
          if (!url) throw new Error("sticker image unavailable");
          const r = await bridgeInboundSticker(intent, portal.room_id, msg.content.id, url, this.deps.mediaMaxBytes, extra);
          eventId = r.eventId;
        } catch {
          const r = await intent.sendMessage(portal.room_id, { msgtype: "m.notice", body: "[Zalo sticker]", ...extra });
          eventId = r.event_id;
        }
        break;
      }
      case "unsupported": {
        const r = await intent.sendMessage(portal.room_id, {
          msgtype: "m.notice",
          body: `[Zalo message type not supported by bridge: ${msg.content.msgType}]`,
          ...extra,
        });
        eventId = r.event_id;
        break;
      }
    }
    // Own phone messages are posted as the owner and will round-trip back to the
    // appservice; mark the event so OutboundHandler never re-sends it to Zalo.
    if (msg.isSelf && eventId) this.deps.bridgedEventIds.add(eventId);
    this.deps.store.recordMessage(
      msg.msgId,
      portal.room_id,
      eventId,
      "inbound",
      msg.quotable ? JSON.stringify(msg.quotable) : null,
      msg.cliMsgId ?? null,
      msg.senderId,
      msg.rawMsgType ?? null,
    );
  }

  private async intentForSender(msg: ZaloMessage, roomId: string) {
    const intent = await this.deps.puppets.ensurePuppet(msg.senderId, msg.senderName);
    if (msg.threadType === "group") {
      await this.deps.portals.ensureGhostInRoom(msg.senderId, roomId, msg.senderName);
    }
    return intent;
  }

  /**
   * Own messages sent from the phone: double-puppet as the owner so they appear
   * in Beeper on the right-hand side. The owner is a real account OUTSIDE the
   * appservice namespace, so we must NOT call ensureRegistered (that 403s / tries
   * to register an existing external user). hungryserv lets the as_token act as
   * the owner directly (verified: whoami?user_id=owner → 200), so we just use the
   * intent and let the first real send confirm/deny capability.
   */
  private intentForSelf() {
    const intent = this.deps.bridge.getIntent(this.deps.ownerUserId);
    // Owner is a real account outside the @sh-zalo_* namespace: registering it
    // returns M_EXCLUSIVE (not swallowed for non-bot users) and disables the whole
    // path. Mark it pre-registered so ensureRegistered no-ops; the as_token can
    // still impersonate the owner to send (hungryserv single-tenant).
    (intent as unknown as { opts: { registered: boolean } }).opts.registered = true;
    return intent;
  }
}
