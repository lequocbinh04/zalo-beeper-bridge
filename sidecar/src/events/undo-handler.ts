// Undo event handler - processes message deletions

import type { BroadcastFn } from "../types.js";

export function handleUndo(undo: any, broadcast: BroadcastFn): void {
  try {
    console.log("[UndoHandler] Discovery logging - raw undo:", JSON.stringify(undo, null, 2));

    const serialized = {
      msgId: undo.msgId || undo.messageId || undo.data?.msgId,
      senderId: undo.senderId || undo.uidFrom || undo.data?.uidFrom,
      threadId: undo.threadId || undo.data?.threadId,
      threadType: undo.threadType || undo.data?.threadType,
      timestamp: undo.ts || undo.timestamp || Date.now(),
    };

    broadcast({
      type: "undo",
      data: serialized,
      timestamp: Date.now(),
    });

    console.log(`[UndoHandler] Forwarded undo for message ${serialized.msgId} by ${serialized.senderId}`);
  } catch (error) {
    console.error("[UndoHandler] Error processing undo:", error);
    console.error("[UndoHandler] Raw undo:", JSON.stringify(undo, null, 2));
  }
}
