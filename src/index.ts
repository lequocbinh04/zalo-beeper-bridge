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
import { AVATAR_MAX_BYTES, createZaloStatePublisher } from "./matrix/beeper-bridge-state.ts";
import { fetchMediaCapped } from "./bridge/media-handler.ts";
import { handleBotEvent, type BotCommandContext } from "./matrix/bot-commands.ts";
import { ensureNetworkIdentity } from "./matrix/network-branding.ts";
import { ZaloClient } from "./zalo/zalo-client.ts";

const config = loadConfig();

const zalo = new ZaloClient({
  credsPath: config.zalo.credsPath,
  messagesPerMinute: config.zalo.messagesPerMinute,
  burst: config.zalo.burst,
});

const store = new MappingStore(config.bridge.dbPath);

const ctx: BotCommandContext = {
  // bridge is assigned right below; handleBotEvent only runs after startBridge
  bridge: undefined as unknown as BotCommandContext["bridge"],
  zalo,
  ownerUserId: config.matrix.owner,
};

const echo = new EchoSuppressor();

const bridge = createBridge(
  config,
  async (event) => {
    // Portal rooms carry conversation traffic (outbound); everything else is bot commands
    if (event.room_id && store.isPortalRoom(event.room_id)) {
      await outbound.handle(event);
      return;
    }
    await handleBotEvent(ctx, event);
  },
  async (event) => {
    // Ephemeral: owner's read receipts + typing in a portal → mirror onto Zalo.
    // Presence events carry no room_id and are ignored.
    if (event.type === "m.receipt") {
      if (store.isPortalRoom(event.room_id)) await presence.handleOwnerReceipt(event.room_id, event.content as Record<string, unknown>);
    }
    // Typing mirroring disabled on request — re-enable by uncommenting:
    // else if (event.type === "m.typing") {
    //   if (store.isPortalRoom(event.room_id)) await presence.handleOwnerTyping(event.room_id, event.content.user_ids ?? []);
    // }
  },
);
ctx.bridge = bridge;

// Registration holds the as_token, ghost namespace, and the appservice id used
// to build the bridge-info state_key (<domain>/<appservice-id>, e.g. beeper.local/sh-zalo)
const registration = loadYaml(fs.readFileSync(config.matrix.registrationPath, "utf8")) as {
  as_token?: string;
  sender_localpart?: string;
  namespaces?: { users?: Array<{ regex: string }> };
};
const asToken = registration.as_token;
if (!asToken) throw new Error(`No as_token in ${config.matrix.registrationPath}`);
// appservice id = sender_localpart minus the trailing "bot" (sh-zalobot → sh-zalo)
const bridgeAppId = (registration.sender_localpart ?? "sh-zalobot").replace(/bot$/, "");
const branding = {
  ...config.network,
  stateKey: `${config.matrix.domain}/${bridgeAppId}`,
};

// Shared between in/out handlers: event_ids the bridge posted as the owner (own
// phone messages) + events already sent outbound — prevents re-sending / loops.
const bridgedEventIds = new Set<string>();

const puppets = new PuppetRegistry(bridge, store, config.matrix.domain, (uid) => zalo.getUserProfile(uid));
const portals = new PortalManager(bridge, store, puppets, config.matrix.owner, branding);
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
  getOwnZaloId: () => zalo.ownId,
  bridgedEventIds,
});

const outbound = new OutboundHandler({
  bridge,
  store,
  zalo,
  echo,
  ownerUserId: config.matrix.owner,
  mediaMaxBytes: config.bridge.mediaMaxBytes,
  homeserverUrl: config.matrix.homeserverUrl,
  matrixToken: asToken,
  bridgedEventIds,
});
const sync = new SyncManager({ zalo, portals, inbound });
ctx.runSync = () => sync.run();

// Fail fast if computed ghost MXIDs cannot be registered under this appservice
const usersRegex = registration.namespaces?.users?.[0]?.regex;
if (!usersRegex) throw new Error(`No user namespace in ${config.matrix.registrationPath}`);
assertGhostNamespace(usersRegex, puppets.mxidFor("1234567890"));

// Beeper needs a remote-account state to show the network and its chats (see beeper-bridge-state.ts)
const publishZaloState = createZaloStatePublisher({
  homeserverUrl: config.matrix.homeserverUrl,
  bridgeId: bridgeAppId,
  asToken,
  fallbackName: config.network.name,
  getOwnId: () => zalo.ownId,
  getOwnProfile: (uid) => zalo.getUserProfile(uid),
  uploadAvatar: async (url) => {
    const { buffer, mimetype } = await fetchMediaCapped(url, AVATAR_MAX_BYTES);
    return bridge.getIntent().uploadContent(buffer, { type: mimetype, name: "zalo-avatar" });
  },
});

zalo.on("connected", () => {
  console.log("[zalo] listener connected");
  void publishZaloState("CONNECTED");
});
zalo.on("reconnecting", (attempt, delayMs) => {
  console.warn(`[zalo] listener reconnecting (attempt ${attempt}, in ${delayMs}ms)`);
  void publishZaloState("TRANSIENT_DISCONNECT");
});
zalo.on("dead", (reason) => {
  console.error(`[zalo] listener DEAD: ${reason} — send 'login' in the management room`);
  void publishZaloState("BAD_CREDENTIALS");
});
zalo.on("message", (msg) => inbound.handle(msg));
const presence = new PresenceHandler(store, puppets, zalo, config.matrix.owner, () => zalo.ownId);
zalo.on("seen", (ev) => void presence.handleSeen(ev).catch((err) => console.warn("seen handling failed:", err)));
// Typing mirroring disabled on request — re-enable by uncommenting:
// zalo.on("typing", (ev) => void presence.handleTyping(ev).catch((err) => console.warn("typing handling failed:", err)));
zalo.on("reaction", (ev) => void presence.handleReaction(ev).catch((err) => console.warn("reaction handling failed:", err)));

// Appservice MUST be up before the Zalo listener: intents throw pre-initialise,
// and the old_messages replay burst arrives immediately on ws connect
await startBridge(bridge, config);
await ensureNetworkIdentity(bridge, branding);
// Backfill the network chip on portals created before branding existed
void portals.rebrandExistingPortals().catch((err) => console.warn("portal rebrand failed:", err));

// Silent cookie re-login at startup; QR (via 'login' command) when absent/expired
if (await zalo.loginFromSavedCredentials()) {
  zalo.startListening();
  console.log(`[zalo] re-logged in from saved credentials (uid ${zalo.ownId})`);
} else {
  console.log("[zalo] no valid saved credentials — send 'login' to the bot from Beeper");
}
