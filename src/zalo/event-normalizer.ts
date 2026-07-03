// Raw zca-js message → ZaloMessage. All zca-js payload quirks live here.
import type { RawZaloMessage, ZaloContent, ZaloMessage } from "./types.ts";

/** chat.photo content shape observed in fixtures */
interface PhotoContent {
  href?: string;
  thumb?: string;
  params?: string; // JSON string: {width, height, hd, ...}
  title?: string; // Zalo puts the photo caption here
  description?: string;
}

interface StickerContent {
  id?: number;
  catId?: number;
}

function normalizeContent(msgType: string, content: unknown): ZaloContent {
  if (msgType === "webchat" && typeof content === "string") {
    return { kind: "text", text: content };
  }
  if (msgType === "chat.photo" && typeof content === "object" && content !== null) {
    const photo = content as PhotoContent;
    if (photo.href) {
      let width: number | undefined;
      let height: number | undefined;
      try {
        const params = JSON.parse(photo.params ?? "{}") as { width?: number; height?: number };
        width = params.width;
        height = params.height;
      } catch {
        // params malformed — dimensions are optional
      }
      return { kind: "photo", url: photo.href, thumbUrl: photo.thumb, width, height, caption: photo.title || photo.description || undefined };
    }
  }
  if (msgType === "chat.sticker" && typeof content === "object" && content !== null) {
    const sticker = content as StickerContent;
    if (typeof sticker.id === "number" && typeof sticker.catId === "number") {
      return { kind: "sticker", id: sticker.id, catId: sticker.catId };
    }
  }
  // Link/card types (chat.recommended, chat.link, chat.ecard, ...) carry an href +
  // title/description — render as a readable text line instead of an "unsupported" notice.
  if (typeof content === "object" && content !== null) {
    const card = content as { href?: string; title?: string; description?: string };
    if (card.href) {
      const label = card.title || card.description || "";
      const text = label && !label.includes(card.href) ? `${label}\n${card.href}` : card.href;
      return { kind: "text", text };
    }
  }
  return { kind: "unsupported", msgType };
}

/** Returns null for events that carry no bridgeable message (missing ids). */
export function normalizeZaloMessage(raw: RawZaloMessage): ZaloMessage | null {
  const d = raw.data;
  // uidFrom is the Phase 4 puppet key — never let "undefined" become a ghost id
  if (!d?.msgId || !raw.threadId || !d.uidFrom) return null;
  const content = normalizeContent(d.msgType, d.content);
  return {
    msgId: String(d.msgId),
    threadId: raw.threadId,
    threadType: raw.type === 1 ? "group" : "user",
    senderId: String(d.uidFrom),
    senderName: d.dName || undefined,
    timestamp: Number(d.ts) || Date.now(),
    isSelf: raw.isSelf === true,
    content,
    cliMsgId: d.cliMsgId != null ? String(d.cliMsgId) : undefined,
    rawMsgType: d.msgType,
    // Any message can be quoted later (Matrix reply → Zalo quote): keep the raw content
    quotable: {
      content: d.content,
      msgType: d.msgType,
      propertyExt: d.propertyExt ?? null,
      uidFrom: String(d.uidFrom),
      msgId: String(d.msgId),
      cliMsgId: String(d.cliMsgId ?? ""),
      ts: String(d.ts),
      ttl: d.ttl ?? 0,
    },
    // Zalo quote → the quoted message's global msgId (Matrix reply mapping)
    replyToMsgId: d.quote?.globalMsgId != null ? String(d.quote.globalMsgId) : undefined,
  };
}
