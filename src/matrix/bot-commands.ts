// Management commands handled by the bridge bot (@sh-zalobot).
// Phase 2: ping. Phase 3 adds: login, logout, status.
import type { Bridge, WeakEvent } from "matrix-appservice-bridge";

const startedAt = Date.now();

function formatUptime(): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

/** Handles bot-directed events. Returns true when the event was consumed. */
export async function handleBotEvent(bridge: Bridge, event: WeakEvent): Promise<boolean> {
  const botUserId = bridge.getBot().getUserId();
  if (event.sender === botUserId) return true; // ignore own echoes

  // Auto-accept invites addressed to the bot (user starting a management DM)
  if (event.type === "m.room.member" && event.state_key === botUserId) {
    const content = event.content as { membership?: string };
    if (content.membership === "invite") {
      await bridge.getIntent().join(event.room_id);
      await bridge.getIntent().sendText(event.room_id, "sh-zalo bridge bot ready. Commands: ping");
      return true;
    }
    return true;
  }

  if (event.type !== "m.room.message") return false;
  const body = (event.content as { body?: string }).body?.trim().toLowerCase();

  if (body === "ping") {
    await bridge.getIntent().sendText(event.room_id, `pong! uptime ${formatUptime()}`);
    return true;
  }
  return false;
}
