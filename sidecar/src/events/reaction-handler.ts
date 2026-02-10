// Reaction event handler - processes message reactions

import type { BroadcastFn } from "../types.js";

export function handleReaction(reaction: any, broadcast: BroadcastFn): void {
  try {
    console.log("[ReactionHandler] Discovery logging - raw reaction:", JSON.stringify(reaction, null, 2));

    const serialized = {
      emoji: reaction.emoji || reaction.icon || reaction.data?.emoji || reaction.data?.icon,
      targetMsgId: reaction.msgId || reaction.messageId || reaction.data?.msgId,
      senderId: reaction.senderId || reaction.uidFrom || reaction.data?.uidFrom,
      action: reaction.action || reaction.data?.action || "add",
      threadId: reaction.threadId || reaction.data?.threadId,
      threadType: reaction.threadType || reaction.data?.threadType,
      timestamp: reaction.ts || reaction.timestamp || Date.now(),
    };

    broadcast({
      type: "reaction",
      data: serialized,
      timestamp: Date.now(),
    });

    console.log(
      `[ReactionHandler] Forwarded reaction ${serialized.action} ${serialized.emoji} on ${serialized.targetMsgId}`
    );
  } catch (error) {
    console.error("[ReactionHandler] Error processing reaction:", error);
    console.error("[ReactionHandler] Raw reaction:", JSON.stringify(reaction, null, 2));
  }
}
