// Maps between Matrix reaction emoji (unicode) and Zalo reaction icon codes.
// Zalo has a fixed palette; unmapped emoji fall back to the closest / HEART.
import { Reactions } from "zca-js";

// Unicode emoji → Zalo icon code
const EMOJI_TO_ZALO: Record<string, Reactions> = {
  "❤️": Reactions.HEART,
  "❤": Reactions.HEART,
  "👍": Reactions.LIKE,
  "😆": Reactions.HAHA,
  "😂": Reactions.TEARS_OF_JOY,
  "😮": Reactions.WOW,
  "😢": Reactions.CRY,
  "😠": Reactions.ANGRY,
  "😡": Reactions.ANGRY,
  "😘": Reactions.KISS,
  "🌹": Reactions.ROSE,
  "💔": Reactions.BROKEN_HEART,
  "👎": Reactions.DISLIKE,
};

// Zalo icon code → unicode emoji (for inbound rendering)
const ZALO_TO_EMOJI: Record<string, string> = {
  [Reactions.HEART]: "❤️",
  [Reactions.LIKE]: "👍",
  [Reactions.HAHA]: "😆",
  [Reactions.TEARS_OF_JOY]: "😂",
  [Reactions.WOW]: "😮",
  [Reactions.CRY]: "😢",
  [Reactions.ANGRY]: "😠",
  [Reactions.KISS]: "😘",
  [Reactions.ROSE]: "🌹",
  [Reactions.BROKEN_HEART]: "💔",
  [Reactions.DISLIKE]: "👎",
};

export function emojiToZalo(emoji: string): Reactions {
  return EMOJI_TO_ZALO[emoji] ?? Reactions.HEART;
}

export function zaloToEmoji(icon: string): string {
  return ZALO_TO_EMOJI[icon] ?? "❤️";
}
