import { describe, expect, it } from "vitest";
import { Reactions } from "zca-js";
import { emojiToZalo, zaloToEmoji } from "../reaction-map.ts";

describe("reaction-map", () => {
  it("maps common emoji to Zalo icon codes", () => {
    expect(emojiToZalo("❤️")).toBe(Reactions.HEART);
    expect(emojiToZalo("👍")).toBe(Reactions.LIKE);
    expect(emojiToZalo("😂")).toBe(Reactions.TEARS_OF_JOY);
  });

  it("falls back to HEART for unmapped emoji", () => {
    expect(emojiToZalo("🦄")).toBe(Reactions.HEART);
  });

  it("maps Zalo icon codes back to emoji", () => {
    expect(zaloToEmoji(Reactions.LIKE)).toBe("👍");
    expect(zaloToEmoji(Reactions.CRY)).toBe("😢");
  });

  it("falls back to heart emoji for unknown icon codes", () => {
    expect(zaloToEmoji("/-unknown-code")).toBe("❤️");
  });

  it("round-trips heart and like", () => {
    expect(zaloToEmoji(emojiToZalo("👍"))).toBe("👍");
    expect(zaloToEmoji(emojiToZalo("❤️"))).toBe("❤️");
  });
});
