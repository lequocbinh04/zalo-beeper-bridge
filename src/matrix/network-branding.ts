// Makes the bridge present as a native network in Beeper:
//  - the appservice bot wears the network name + logo (network identity in the UI)
//  - each portal carries an `uk.half-shot.bridge` state event (MSC2346) that Beeper
//    reads to label the chat's network with an icon
// Name and logo are configurable (config.network); defaults are Zalo + bundled logo.
//
// Note: the network's internal id shown in some Beeper surfaces comes from the
// bbctl registration name (e.g. "sh-zalo") and is fixed at `bbctl register` time;
// this module controls the human-facing display name and icon.
import fs from "node:fs";
import type { Bridge, Intent } from "matrix-appservice-bridge";

export interface NetworkBranding {
  name: string;
  logoPath: string;
}

let cachedLogoMxc: string | null = null;

async function getLogoMxc(intent: Intent, logoPath: string): Promise<string | null> {
  if (cachedLogoMxc) return cachedLogoMxc;
  if (!fs.existsSync(logoPath)) return null;
  cachedLogoMxc = await intent.uploadContent(fs.readFileSync(logoPath), { type: "image/png", name: "network-logo.png" });
  return cachedLogoMxc;
}

/** One-time bot profile so the network shows with the configured name + logo. */
export async function ensureNetworkIdentity(bridge: Bridge, branding: NetworkBranding): Promise<void> {
  const intent = bridge.getIntent();
  const logo = await getLogoMxc(intent, branding.logoPath);
  await intent.setDisplayName(branding.name).catch((err: Error) => console.warn("bot setDisplayName failed:", err.message));
  if (logo) await intent.setAvatarUrl(logo).catch((err: Error) => console.warn("bot setAvatarUrl failed:", err.message));
}

/**
 * Emit the MSC2346 bridge-info state so Beeper renders the portal under this
 * network. `intent` MUST be a room member with power to send state — the room's
 * creator (the ghost for DM portals, the bot for group portals). Using the bot
 * on a ghost-created DM fails with M_FORBIDDEN.
 */
export async function tagPortalNetwork(intent: Intent, roomId: string, channelName: string, branding: NetworkBranding): Promise<void> {
  const logo = await getLogoMxc(intent, branding.logoPath);
  const networkId = branding.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const protocol = { id: networkId, displayname: branding.name, ...(logo ? { avatar_url: logo } : {}) };
  const content = {
    bridgebot: intent.userId,
    protocol,
    network: protocol,
    channel: { id: roomId, displayname: channelName },
  };
  await intent
    .sendStateEvent(roomId, "uk.half-shot.bridge", `dev.beeper.zalo://${networkId}`, content)
    .catch((err: Error) => console.warn(`bridge-info state failed for ${roomId}:`, err.message));
}
