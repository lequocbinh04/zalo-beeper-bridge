// Entrypoint: load config → start Zalo client + appservice → route events.
import fs from "node:fs";
import { load as loadYaml } from "js-yaml";
import { loadConfig } from "./config.ts";
import { EchoSuppressor } from "./bridge/echo-suppressor.ts";
import { InboundHandler } from "./bridge/inbound-handler.ts";
import { MappingStore } from "./bridge/mapping-store.ts";
import { OutboundHandler } from "./bridge/outbound-handler.ts";
import { PortalManager } from "./bridge/portal-manager.ts";
import { PresenceHandler } from "./bridge/presence-handler.ts";
import { assertGhostNamespace, PuppetRegistry } from "./bridge/puppet-registry.ts";
import { SyncManager } from "./bridge/sync-manager.ts";
import { createBridge, startBridge } from "./matrix/appservice.ts";
import { handleBotEvent, type BotCommandContext } from "./matrix/bot-commands.ts";
import { ensureNetworkIdentity } from "./matrix/network-branding.ts";
import { ZaloClient } from "./zalo/zalo-client.ts";

const config = loadConfig();

const zalo = new ZaloClient({
  credsPath: config.zalo.credsPath,
  messagesPerMinute: config.zalo.messagesPerMinute,
});

const store = new MappingStore(config.bridge.dbPath);

const ctx: BotCommandContext = {
  // bridge is assigned right below; handleBotEvent only runs after startBridge
  bridge: undefined as unknown as BotCommandContext["bridge"],
  zalo,
  ownerUserId: config.matrix.owner,
};

const echo = new EchoSuppressor();

const bridge = createBridge(config, async (event) => {
  // Portal rooms carry conversation traffic (outbound); everything else is bot commands
  if (event.room_id && store.isPortalRoom(event.room_id)) {
    if (event.type === "m.receipt") {
      await presence.handleOwnerReceipt(event.room_id, event.content as Record<string, unknown>);
    } else if (event.type === "m.typing") {
      await presence.handleOwnerTyping(event.room_id, (event.content as { user_ids?: string[] }).user_ids ?? []);
    } else {
      await outbound.handle(event);
    }
    return;
  }
  await handleBotEvent(ctx, event);
});
ctx.bridge = bridge;

const puppets = new PuppetRegistry(bridge, store, config.matrix.domain, (uid) => zalo.getUserProfile(uid));
const portals = new PortalManager(bridge, store, puppets, config.matrix.owner);
const inbound = new InboundHandler({
  bridge,
  store,
  puppets,
  portals,
  echo,
  ownerUserId: config.matrix.owner,
  mediaMaxBytes: config.bridge.mediaMaxBytes,
  resolveGroupName: (threadId) => zalo.getGroupName(threadId),
  resolveStickerUrl: (stickerId) => zalo.getStickerImageUrl(stickerId),
});
const outbound = new OutboundHandler({ bridge, store, zalo, echo, ownerUserId: config.matrix.owner, mediaMaxBytes: config.bridge.mediaMaxBytes });
const sync = new SyncManager({ zalo, portals, inbound });
ctx.runSync = () => sync.run();

// Fail fast if computed ghost MXIDs cannot be registered under this appservice
const registration = loadYaml(fs.readFileSync(config.matrix.registrationPath, "utf8")) as {
  namespaces?: { users?: Array<{ regex: string }> };
};
const usersRegex = registration.namespaces?.users?.[0]?.regex;
if (!usersRegex) throw new Error(`No user namespace in ${config.matrix.registrationPath}`);
assertGhostNamespace(usersRegex, puppets.mxidFor("1234567890"));

zalo.on("connected", () => console.log("[zalo] listener connected"));
zalo.on("reconnecting", (attempt, delayMs) => console.warn(`[zalo] listener reconnecting (attempt ${attempt}, in ${delayMs}ms)`));
zalo.on("dead", (reason) => console.error(`[zalo] listener DEAD: ${reason} — send 'login' in the management room`));
zalo.on("message", (msg) => inbound.handle(msg));
const presence = new PresenceHandler(store, puppets, zalo, config.matrix.owner, () => zalo.ownId);
zalo.on("seen", (ev) => void presence.handleSeen(ev).catch((err) => console.warn("seen handling failed:", err)));
zalo.on("typing", (ev) => void presence.handleTyping(ev).catch((err) => console.warn("typing handling failed:", err)));
zalo.on("reaction", (ev) => void presence.handleReaction(ev).catch((err) => console.warn("reaction handling failed:", err)));

// Appservice MUST be up before the Zalo listener: intents throw pre-initialise,
// and the old_messages replay burst arrives immediately on ws connect
await startBridge(bridge, config);
await ensureNetworkIdentity(bridge);

// Silent cookie re-login at startup; QR (via 'login' command) when absent/expired
if (await zalo.loginFromSavedCredentials()) {
  zalo.startListening();
  console.log(`[zalo] re-logged in from saved credentials (uid ${zalo.ownId})`);
} else {
  console.log("[zalo] no valid saved credentials — send 'login' to the bot from Beeper");
}
