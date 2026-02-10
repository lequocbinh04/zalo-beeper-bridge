// Group event handler - processes group-related events

import type { BroadcastFn } from "../types.js";

export function handleGroupEvent(event: any, broadcast: BroadcastFn): void {
  try {
    console.log("[GroupHandler] Discovery logging - raw group event:", JSON.stringify(event, null, 2));

    const serialized = {
      eventType: event.eventType || event.type || event.data?.eventType,
      groupId: event.groupId || event.threadId || event.data?.groupId,
      actorId: event.actorId || event.senderId || event.data?.actorId,
      targetId: event.targetId || event.data?.targetId,
      groupName: event.groupName || event.data?.groupName,
      timestamp: event.ts || event.timestamp || Date.now(),
      rawData: event,
    };

    broadcast({
      type: "group_event",
      data: serialized,
      timestamp: Date.now(),
    });

    console.log(`[GroupHandler] Forwarded group event ${serialized.eventType} in ${serialized.groupId}`);
  } catch (error) {
    console.error("[GroupHandler] Error processing group event:", error);
    console.error("[GroupHandler] Raw event:", JSON.stringify(event, null, 2));
  }
}
