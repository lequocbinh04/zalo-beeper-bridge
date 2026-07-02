// Facade over zca-js: the ONLY module allowed to import zca-js runtime classes.
// Contains login lifecycle, listener resilience, normalization, and rate-limited sends.
import { EventEmitter } from "node:events";
import { Zalo, LoginQRCallbackEventType, ThreadType, type API } from "zca-js";
import { emojiToZalo } from "./reaction-map.ts";
import { loadCredentials, saveCredentials, clearCredentials } from "./credential-store.ts";
import { normalizeZaloMessage } from "./event-normalizer.ts";
import { ListenerManager } from "./listener-manager.ts";
import { RateLimiter } from "./rate-limiter.ts";
import type { RawZaloMessage, ZaloMessage, ZaloQuotePayload, ZaloReactionEvent, ZaloSeenEvent, ZaloThreadType, ZaloTypingEvent } from "./types.ts";

export interface ZaloClientOptions {
  credsPath: string;
  messagesPerMinute: number;
  burst?: number;
}

interface ZaloClientEvents {
  message: [message: ZaloMessage];
  seen: [event: ZaloSeenEvent];
  typing: [event: ZaloTypingEvent];
  reaction: [event: ZaloReactionEvent];
  connected: [];
  reconnecting: [attempt: number, delayMs: number];
  dead: [reason: string];
}

export type ListenerState = "stopped" | "connected" | "reconnecting" | "dead";

export class ZaloClient extends EventEmitter<ZaloClientEvents> {
  private api: API | null = null;
  private readonly listenerManager = new ListenerManager();
  private readonly rateLimiter: RateLimiter;
  private readonly startedAt = Date.now();
  private readonly opts: ZaloClientOptions;
  private listenerState: ListenerState = "stopped";
  private loginInFlight = false;

  constructor(opts: ZaloClientOptions) {
    super();
    this.opts = opts;
    this.rateLimiter = new RateLimiter(opts.messagesPerMinute, opts.burst);
    this.listenerManager.on("connected", () => {
      this.listenerState = "connected";
      this.emit("connected");
    });
    this.listenerManager.on("reconnecting", (attempt, delayMs) => {
      this.listenerState = "reconnecting";
      this.emit("reconnecting", attempt, delayMs);
    });
    this.listenerManager.on("dead", (reason) => {
      // Session is unusable — drop it so 'login' works as the recovery path
      this.listenerState = "dead";
      this.listenerManager.stop();
      this.api = null;
      this.emit("dead", reason);
    });
  }

  private newZalo(): Zalo {
    // selfListen: own sends (any device) arrive with isSelf=true — used for echo suppression
    return new Zalo({ selfListen: true, checkUpdate: false, logging: false });
  }

  get isLoggedIn(): boolean {
    return this.api !== null;
  }

  get ownId(): string | null {
    return this.api?.getOwnId() ?? null;
  }

  get status(): { loggedIn: boolean; ownId: string | null; listener: ListenerState; uptimeMs: number } {
    return { loggedIn: this.isLoggedIn, ownId: this.ownId, listener: this.listenerState, uptimeMs: Date.now() - this.startedAt };
  }

  /** Cookie re-login from saved credentials. Returns false when absent/invalid. */
  async loginFromSavedCredentials(): Promise<boolean> {
    const creds = loadCredentials(this.opts.credsPath);
    if (!creds) return false;
    try {
      this.api = await this.newZalo().login(creds);
      return true;
    } catch (err) {
      console.warn("Zalo cookie re-login failed:", (err as Error).message);
      return false;
    }
  }

  /**
   * Interactive QR login. deliverQrPng is called with the QR image (PNG buffer)
   * for display in the Matrix management room. Resolves once logged in.
   */
  async loginWithQR(deliverQrPng: (png: Buffer) => Promise<void>): Promise<void> {
    if (this.loginInFlight) throw new Error("A QR login is already in progress — scan the existing QR");
    this.loginInFlight = true;
    try {
      await this.doLoginWithQR(deliverQrPng);
    } finally {
      this.loginInFlight = false;
    }
  }

  private async doLoginWithQR(deliverQrPng: (png: Buffer) => Promise<void>): Promise<void> {
    let qrRetries = 0;
    const api = await this.newZalo().loginQR({}, (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          // event.data.image is raw base64 PNG (data-URI prefix already stripped by zca-js)
          void deliverQrPng(Buffer.from(event.data.image, "base64")).catch((err) =>
            console.error("Failed to deliver QR image:", err),
          );
          break;
        case LoginQRCallbackEventType.QRCodeExpired:
          if (++qrRetries <= 2) event.actions.retry();
          else event.actions.abort();
          break;
        case LoginQRCallbackEventType.QRCodeDeclined:
          event.actions.abort();
          break;
        case LoginQRCallbackEventType.GotLoginInfo: {
          const { cookie, imei, userAgent } = event.data;
          saveCredentials(this.opts.credsPath, { cookie, imei, userAgent });
          break;
        }
      }
    });
    if (!api) throw new Error("QR login aborted (expired or declined)");
    this.api = api;
  }

  startListening(): void {
    if (!this.api) throw new Error("Not logged in");
    this.listenerState = "reconnecting"; // until first "connected"
    this.api.listener.on("message", (raw) => {
      const normalized = normalizeZaloMessage(raw as unknown as RawZaloMessage);
      if (normalized) this.emit("message", normalized);
    });
    // Zalo pushes recent messages per thread on connect — replay them through the
    // same pipeline (store-level msgId dedup makes this idempotent across restarts)
    this.api.listener.on("old_messages", (messages) => {
      for (const raw of messages as unknown as RawZaloMessage[]) {
        const normalized = normalizeZaloMessage(raw);
        if (normalized) this.emit("message", normalized);
      }
    });
    this.api.listener.on("seen_messages", (seenList) => {
      for (const seen of seenList as Array<{ type: number; threadId: string; data: { msgId: string; seenUids?: Array<string | number> } }>) {
        if (!seen?.data?.msgId) continue;
        this.emit("seen", {
          threadId: String(seen.threadId),
          threadType: seen.type === 1 ? "group" : "user",
          msgId: String(seen.data.msgId),
          // Coerce: Zalo sends numeric uids here; own-uid filtering compares strings
          seenUids: (seen.data.seenUids ?? []).map(String),
        });
      }
    });
    this.api.listener.on("typing", (typing) => {
      const t = typing as unknown as { type: number; threadId: string; data: { uid: string } };
      if (!t?.data?.uid) return;
      this.emit("typing", {
        threadId: t.threadId,
        threadType: t.type === 1 ? "group" : "user",
        uid: String(t.data.uid),
      });
    });
    this.api.listener.on("reaction", (reaction) => {
      const r = reaction as unknown as {
        threadId: string;
        isGroup: boolean;
        isSelf?: boolean;
        data: { uidFrom: string; dName?: string; content: { rMsg?: Array<{ gMsgID: string }>; rIcon: string } };
      };
      const targetMsgId = r?.data?.content?.rMsg?.[0]?.gMsgID;
      if (!targetMsgId || !r.data.uidFrom) return;
      this.emit("reaction", {
        threadId: String(r.threadId),
        threadType: r.isGroup ? "group" : "user",
        senderId: String(r.data.uidFrom),
        senderName: r.data.dName || undefined,
        isSelf: r.isSelf === true,
        targetMsgId: String(targetMsgId),
        icon: r.data.content.rIcon ?? "",
      });
    });
    this.listenerManager.start(this.api);
  }

  stopListening(): void {
    this.listenerManager.stop();
    this.listenerState = "stopped";
  }

  logout(): void {
    this.stopListening();
    this.api = null;
    clearCredentials(this.opts.credsPath);
  }

  /** Contact profile (name + avatar URL) via zca-js getUserInfo; null when unavailable. */
  async getUserProfile(uid: string): Promise<{ displayName?: string; avatarUrl?: string } | null> {
    if (!this.api) return null;
    try {
      const info = await this.api.getUserInfo(uid);
      const profile = info.changed_profiles[uid] as { displayName?: string; zaloName?: string; avatar?: string } | undefined;
      if (!profile) return null;
      return { displayName: profile.displayName || profile.zaloName, avatarUrl: profile.avatar };
    } catch (err) {
      console.warn(`getUserInfo(${uid}) failed:`, (err as Error).message);
      return null;
    }
  }

  /** Sticker image URL (prefers animated webp) via getStickersDetail. */
  async getStickerImageUrl(stickerId: number): Promise<string | null> {
    if (!this.api) return null;
    try {
      const details = await this.api.getStickersDetail(stickerId);
      const d = details[0];
      return d?.stickerWebpUrl || d?.stickerUrl || null;
    } catch (err) {
      console.warn(`getStickersDetail(${stickerId}) failed:`, (err as Error).message);
      return null;
    }
  }

  /** Thread ids the user pinned in Zalo (conversation sync targets). */
  async getPinnedThreadIds(): Promise<string[]> {
    if (!this.api) return [];
    try {
      return (await this.api.getPinConversations()).conversations ?? [];
    } catch (err) {
      console.warn("getPinConversations failed:", (err as Error).message);
      return [];
    }
  }

  /** All group ids the account belongs to. null = fetch FAILED (callers must not treat as "no groups"). */
  async getAllGroupIds(): Promise<string[] | null> {
    if (!this.api) return null;
    try {
      return Object.keys((await this.api.getAllGroups()).gridVerMap ?? {});
    } catch (err) {
      console.warn("getAllGroups failed:", (err as Error).message);
      return null;
    }
  }

  /** Recent group history, normalized and sorted oldest-first (best-effort backfill). */
  async getGroupHistory(threadId: string, count = 30): Promise<ZaloMessage[]> {
    if (!this.api) return [];
    try {
      const res = await this.api.getGroupChatHistory(threadId, count);
      return (res.groupMsgs ?? [])
        .map((raw) => normalizeZaloMessage(raw as unknown as RawZaloMessage))
        .filter((m): m is ZaloMessage => m !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
      console.warn(`getGroupChatHistory(${threadId}) failed:`, (err as Error).message);
      return [];
    }
  }

  /** Group display name via zca-js getGroupInfo; null when unavailable. */
  async getGroupName(threadId: string): Promise<string | null> {
    if (!this.api) return null;
    try {
      const info = await this.api.getGroupInfo(threadId);
      const name = (info.gridInfoMap[threadId] as { name?: string } | undefined)?.name;
      return name || null;
    } catch (err) {
      console.warn(`getGroupInfo(${threadId}) failed:`, (err as Error).message);
      return null;
    }
  }

  /** React to a Zalo message (Beeper→Zalo). Not rate-limited — it's a control action, not a message. */
  async react(threadId: string, threadType: ZaloThreadType, msgId: string, cliMsgId: string, emoji: string): Promise<void> {
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await api.addReaction(emojiToZalo(emoji), {
      data: { msgId, cliMsgId },
      threadId,
      type: threadType === "group" ? ThreadType.Group : ThreadType.User,
    });
  }

  /** Recall (undo) a message we sent (Beeper→Zalo). Not rate-limited — a control action, and delay is user-visible. */
  async recall(threadId: string, threadType: ZaloThreadType, msgId: string, cliMsgId: string): Promise<void> {
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await api.undo({ msgId, cliMsgId }, threadId, threadType === "group" ? ThreadType.Group : ThreadType.User);
  }

  /**
   * Mark a message seen on Zalo (Beeper read → Zalo "seen"). Best-effort, no rate limit.
   * senderId is the original sender (peer for DM); for a DM, uidFrom must be the peer
   * and idTo the account itself. st/at/cmd/ts default to 0 (accepted by Zalo).
   */
  async sendSeen(
    threadId: string,
    threadType: ZaloThreadType,
    msgId: string,
    cliMsgId: string,
    senderId: string,
    msgType: string,
  ): Promise<void> {
    const api = this.api;
    if (!api) return;
    const isGroup = threadType === "group";
    try {
      await api.sendSeenEvent(
        {
          msgId,
          cliMsgId,
          uidFrom: senderId,
          idTo: isGroup ? threadId : (this.ownId ?? ""),
          msgType: msgType || "webchat",
          st: 0,
          at: 0,
          cmd: 0,
          ts: 0,
        },
        isGroup ? ThreadType.Group : ThreadType.User,
      );
    } catch (err) {
      console.warn("sendSeenEvent failed:", (err as Error).message);
    }
  }

  /** Show "typing" on Zalo (Beeper owner typing → Zalo). Best-effort. */
  async sendTypingToZalo(threadId: string, threadType: ZaloThreadType): Promise<void> {
    const api = this.api;
    if (!api) return;
    try {
      await api.sendTypingEvent(threadId, threadType === "group" ? ThreadType.Group : ThreadType.User);
    } catch {
      // typing is fire-and-forget
    }
  }

  /**
   * Send an image (Beeper→Zalo) as a message with an attachment. uploadAttachment
   * only uploads to the CDN without posting to the thread, so we send via
   * sendMessage's `attachments` field (which uploads + delivers). Returns the sent
   * msgId(s) for echo suppression.
   */
  async sendImage(
    threadId: string,
    threadType: ZaloThreadType,
    data: Buffer,
    filename: `${string}.${string}`,
    width: number,
    height: number,
    caption = "",
  ): Promise<string[]> {
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await this.rateLimiter.acquire();
    const res = await api.sendMessage(
      { msg: caption, attachments: [{ data, filename, metadata: { totalSize: data.byteLength, width, height } }] },
      threadId,
      threadType === "group" ? ThreadType.Group : ThreadType.User,
    );
    const ids: string[] = [];
    if (res.message?.msgId != null) ids.push(String(res.message.msgId));
    for (const a of res.attachment ?? []) if (a?.msgId != null) ids.push(String(a.msgId));
    return ids;
  }

  /**
   * Send a non-image attachment (video/file/audio) Beeper→Zalo via sendMessage.
   * zca-js routes by the filename extension: .mp4 → video, others → file.
   */
  async sendFile(
    threadId: string,
    threadType: ZaloThreadType,
    data: Buffer,
    filename: `${string}.${string}`,
    caption = "",
  ): Promise<string[]> {
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await this.rateLimiter.acquire();
    const res = await api.sendMessage(
      { msg: caption, attachments: [{ data, filename, metadata: { totalSize: data.byteLength } }] },
      threadId,
      threadType === "group" ? ThreadType.Group : ThreadType.User,
    );
    const ids: string[] = [];
    if (res.message?.msgId != null) ids.push(String(res.message.msgId));
    for (const a of res.attachment ?? []) if (a?.msgId != null) ids.push(String(a.msgId));
    return ids;
  }

  /**
   * Rate-limited text send with optional quote. Returns Zalo msgId (echo-suppression key).
   * onBeforeSend fires AFTER the rate-limit wait, immediately before the network call —
   * echo-suppression TTLs must start at real send time, not enqueue time.
   */
  async sendText(
    threadId: string,
    threadType: ZaloThreadType,
    text: string,
    quote?: ZaloQuotePayload,
    onBeforeSend?: () => void,
  ): Promise<{ msgId: string | null }> {
    // Capture before the rate-limit wait — logout during the wait must not null-deref
    const api = this.api;
    if (!api) throw new Error("Not logged in");
    await this.rateLimiter.acquire();
    onBeforeSend?.();
    const zaloType = threadType === "group" ? ThreadType.Group : ThreadType.User;
    const payload = quote ? { msg: text, quote: quote as never } : text;
    const result = await api.sendMessage(payload, threadId, zaloType);
    return { msgId: result.message?.msgId != null ? String(result.message.msgId) : null };
  }
}
