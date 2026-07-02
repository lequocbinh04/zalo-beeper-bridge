// Fixtures mirror live shapes captured in Phase 1 (spike/raw-events.ndjson,
// documented in plans/.../reports/phase-01-spike-findings.md), identifiers anonymized.
import { describe, expect, it } from "vitest";
import { normalizeZaloMessage } from "../event-normalizer.ts";
import type { RawZaloMessage } from "../types.ts";

const dmText: RawZaloMessage = {
  type: 0,
  threadId: "1111111111111111111",
  isSelf: false,
  data: {
    msgId: "7998805079701",
    msgType: "webchat",
    uidFrom: "1111111111111111111",
    dName: "Test Sender",
    ts: "1782964481836",
    content: "xin chào",
  },
};

describe("normalizeZaloMessage", () => {
  it("normalizes DM text and captures the quotable payload", () => {
    const m = normalizeZaloMessage(dmText);
    expect(m).toEqual({
      msgId: "7998805079701",
      threadId: "1111111111111111111",
      threadType: "user",
      senderId: "1111111111111111111",
      senderName: "Test Sender",
      timestamp: 1782964481836,
      isSelf: false,
      content: { kind: "text", text: "xin chào" },
      quotable: {
        content: "xin chào",
        msgType: "webchat",
        propertyExt: null,
        uidFrom: "1111111111111111111",
        msgId: "7998805079701",
        cliMsgId: "",
        ts: "1782964481836",
        ttl: 0,
      },
    });
  });

  it("normalizes group text with type=1", () => {
    const m = normalizeZaloMessage({
      ...dmText,
      type: 1,
      threadId: "2222222222222222222",
      data: { ...dmText.data, content: "Lô" },
    });
    expect(m?.threadType).toBe("group");
    expect(m?.threadId).toBe("2222222222222222222");
    expect(m?.senderId).toBe("1111111111111111111"); // uidFrom stays the puppet key
    expect(m?.content).toEqual({ kind: "text", text: "Lô" });
  });

  it("normalizes chat.photo with dimensions from params JSON", () => {
    const m = normalizeZaloMessage({
      ...dmText,
      data: {
        ...dmText.data,
        msgType: "chat.photo",
        content: {
          href: "https://photo-stal-19.zdn.vn/x/y.jpg",
          thumb: "https://photo-stal-19.zdn.vn/x/y-thumb.jpg",
          params: '{"height":4032,"width":3024,"hd":"https://cdn/hd.jpg"}',
        },
      },
    });
    expect(m?.content).toEqual({
      kind: "photo",
      url: "https://photo-stal-19.zdn.vn/x/y.jpg",
      thumbUrl: "https://photo-stal-19.zdn.vn/x/y-thumb.jpg",
      width: 3024,
      height: 4032,
    });
  });

  it("keeps photo without dimensions when params is malformed", () => {
    const m = normalizeZaloMessage({
      ...dmText,
      data: { ...dmText.data, msgType: "chat.photo", content: { href: "https://cdn/p.jpg", params: "{broken" } },
    });
    expect(m?.content).toMatchObject({ kind: "photo", url: "https://cdn/p.jpg", width: undefined });
  });

  it("normalizes chat.sticker to id+catId", () => {
    const m = normalizeZaloMessage({
      ...dmText,
      data: { ...dmText.data, msgType: "chat.sticker", content: { id: 18009, catId: 10130, type: 7 } },
    });
    expect(m?.content).toEqual({ kind: "sticker", id: 18009, catId: 10130 });
  });

  it("marks unknown msgTypes unsupported and marks isSelf", () => {
    const m = normalizeZaloMessage({
      ...dmText,
      isSelf: true,
      data: { ...dmText.data, msgType: "chat.voice", content: { something: true } },
    });
    expect(m?.isSelf).toBe(true);
    expect(m?.content).toEqual({ kind: "unsupported", msgType: "chat.voice" });
  });

  it("returns null when msgId is missing", () => {
    const m = normalizeZaloMessage({ ...dmText, data: { ...dmText.data, msgId: "" } });
    expect(m).toBeNull();
  });
});
