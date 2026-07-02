// Entrypoint: load config → start Zalo client + appservice → route events.
import { loadConfig } from "./config.ts";
import { createBridge, startBridge } from "./matrix/appservice.ts";
import { handleBotEvent, type BotCommandContext } from "./matrix/bot-commands.ts";
import { ZaloClient } from "./zalo/zalo-client.ts";

const config = loadConfig();

const zalo = new ZaloClient({
  credsPath: config.zalo.credsPath,
  messagesPerMinute: config.zalo.messagesPerMinute,
});

zalo.on("connected", () => console.log("[zalo] listener connected"));
zalo.on("reconnecting", (attempt, delayMs) => console.warn(`[zalo] listener reconnecting (attempt ${attempt}, in ${delayMs}ms)`));
zalo.on("dead", (reason) => console.error(`[zalo] listener DEAD: ${reason} — send 'login' in the management room`));
zalo.on("message", (msg) => {
  // Phase 4 bridges these into portal rooms; for now log a redacted summary
  console.log(`[zalo] msg ${msg.msgId} ${msg.threadType}/${msg.threadId} from=${msg.senderId}${msg.isSelf ? " (self)" : ""} kind=${msg.content.kind}`);
});

const ctx: BotCommandContext = {
  // bridge is assigned right below; handleBotEvent only runs after startBridge
  bridge: undefined as unknown as BotCommandContext["bridge"],
  zalo,
  ownerUserId: config.matrix.owner,
};

const bridge = createBridge(config, async (event) => {
  await handleBotEvent(ctx, event);
  // Non-bot (portal room) traffic is handled from Phase 4/5 onward
});
ctx.bridge = bridge;

// Silent cookie re-login at startup; QR (via 'login' command) when absent/expired
if (await zalo.loginFromSavedCredentials()) {
  zalo.startListening();
  console.log(`[zalo] re-logged in from saved credentials (uid ${zalo.ownId})`);
} else {
  console.log("[zalo] no valid saved credentials — send 'login' to the bot from Beeper");
}

await startBridge(bridge, config);
