// Message event handler - serializes incoming Zalo messages

import type { BroadcastFn } from "../types.js";

export function handleMessage(message: any, broadcast: BroadcastFn): void {
  try {
    const serialized = {
      msgId: message.msgId || message.messageId || message.data?.msgId,
      content: message.content || message.data?.content || message.message,
      threadId: message.threadId || message.data?.threadId,
      threadType: message.threadType || message.data?.threadType,
      senderId: message.senderId || message.uidFrom || message.data?.uidFrom,
      isSelf: message.isSelf || message.data?.isSelf || false,
      timestamp: message.ts || message.timestamp || Date.now(),
      quote: message.quote || message.data?.quote,
      msgType: determineMessageType(message),
      mediaUrl: message.url || message.data?.url,
      thumb: message.thumb || message.data?.thumb,
      width: message.width || message.data?.width,
      height: message.height || message.data?.height,
    };

    broadcast({
      type: "message",
      data: serialized,
      timestamp: Date.now(),
    });

    console.log(`[MessageHandler] Forwarded message ${serialized.msgId} from ${serialized.senderId}`);
  } catch (error) {
    console.error("[MessageHandler] Error processing message:", error);
    console.error("[MessageHandler] Raw message:", JSON.stringify(message, null, 2));
  }
}

function determineMessageType(message: any): string {
  // Check explicit type field
  if (message.type) return message.type;
  if (message.data?.type) return message.data.type;

  // Infer from content
  if (message.url || message.data?.url) {
    return "image";
  }
  if (message.stickerId || message.data?.stickerId) {
    return "sticker";
  }
  if (message.content || message.data?.content || message.message) {
    return "text";
  }

  return "unknown";
}
