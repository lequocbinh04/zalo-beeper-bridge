// Management commands handled by the bridge bot (@sh-zalobot).
// Commands accepted ONLY from the configured owner (single-user bridge).
import type { Bridge, WeakEvent } from "matrix-appservice-bridge";
import type { ZaloClient } from "../zalo/zalo-client.ts";

const startedAt = Date.now();

function formatUptime(): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

export interface BotCommandContext {
  bridge: Bridge;
  zalo: ZaloClient;
  ownerUserId: string;
}

async function handleLogin(ctx: BotCommandContext, roomId: string): Promise<void> {
  const intent = ctx.bridge.getIntent();
  if (ctx.zalo.isLoggedIn) {
    await intent.sendText(roomId, `Already logged in to Zalo (uid ${ctx.zalo.ownId}). Use 'logout' first to switch.`);
    return;
  }
  await intent.sendText(roomId, "Generating Zalo QR — scan it with the Zalo app, then confirm on your phone.");
  try {
    await ctx.zalo.loginWithQR(async (png) => {
      const mxc = await intent.uploadContent(png, { type: "image/png", name: "zalo-login-qr.png" });
      await intent.sendMessage(roomId, {
        msgtype: "m.image",
        url: mxc,
        body: "zalo-login-qr.png",
        info: { mimetype: "image/png" },
      });
    });
    ctx.zalo.startListening();
    await intent.sendText(roomId, `✓ Logged in to Zalo (uid ${ctx.zalo.ownId}), listener started.`);
  } catch (err) {
    await intent.sendText(roomId, `Zalo login failed: ${(err as Error).message}`);
  }
}

async function handleStatus(ctx: BotCommandContext, roomId: string): Promise<void> {
  const s = ctx.zalo.status;
  const lines = [
    `bridge uptime: ${formatUptime()}`,
    `zalo: ${s.loggedIn ? `logged in (uid ${s.ownId})` : "NOT logged in — send 'login'"}`,
    `listener: ${s.listener}`,
  ];
  await ctx.bridge.getIntent().sendText(roomId, lines.join("\n"));
}

/** Handles bot-directed events. Returns true when the event was consumed. */
export async function handleBotEvent(ctx: BotCommandContext, event: WeakEvent): Promise<boolean> {
  const botUserId = ctx.bridge.getBot().getUserId();
  if (event.sender === botUserId) return true; // ignore own echoes

  // Auto-accept invites addressed to the bot (owner starting the management DM)
  if (event.type === "m.room.member" && event.state_key === botUserId) {
    const content = event.content as { membership?: string };
    if (content.membership === "invite" && event.sender === ctx.ownerUserId) {
      await ctx.bridge.getIntent().join(event.room_id);
      await ctx.bridge.getIntent().sendText(event.room_id, "sh-zalo bridge bot ready. Commands: ping | login | logout | status");
    }
    return true;
  }

  if (event.type !== "m.room.message") return false;
  if (event.sender !== ctx.ownerUserId) return false; // commands are owner-only
  const body = (event.content as { body?: string }).body?.trim().toLowerCase();

  switch (body) {
    case "ping":
      await ctx.bridge.getIntent().sendText(event.room_id, `pong! uptime ${formatUptime()}`);
      return true;
    case "login":
      await handleLogin(ctx, event.room_id);
      return true;
    case "logout":
      ctx.zalo.logout();
      await ctx.bridge.getIntent().sendText(event.room_id, "Logged out of Zalo; saved credentials cleared.");
      return true;
    case "status":
      await handleStatus(ctx, event.room_id);
      return true;
    default:
      return false;
  }
}
