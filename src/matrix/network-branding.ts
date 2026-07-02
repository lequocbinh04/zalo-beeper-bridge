// Makes the bridge present as a native network in Beeper (name + logo), matching
// what official mautrix bridgev2 bridges emit:
//  - bot profile: displayname + avatar + com.beeper.bridge.{service,network,is_bridge_bot}
//  - per portal: BOTH `m.bridge` and `uk.half-shot.bridge` state events, keyed by
//    `<domain>/<appservice-id>` (e.g. beeper.local/sh-zalo) — the load-bearing bit;
//    a wrong/empty state_key makes Beeper fall back to the raw "sh-zalo" id.
// (Field precedence is inferred from mautrix-go; Beeper's client is closed-source.)
import fs from "node:fs";
import type { Bridge, Intent } from "matrix-appservice-bridge";
import type { ZaloThreadType } from "../zalo/types.ts";

export interface NetworkBranding {
  name: string;
  logoPath: string;
  /** stable network id (protocol.id / com.beeper.bridge.network), e.g. "zalo" */
  networkId: string;
  /** `<homeserver_domain>/<appservice_id>` — the bridge-info state_key */
  stateKey: string;
}

let cachedLogoMxc: string | null = null;

async function getLogoMxc(intent: Intent, logoPath: string): Promise<string | null> {
  if (cachedLogoMxc) return cachedLogoMxc;
  if (!fs.existsSync(logoPath)) return null;
  cachedLogoMxc = await intent.uploadContent(fs.readFileSync(logoPath), { type: "image/png", name: "network-logo.png" });
  return cachedLogoMxc;
}

/** One-time bot profile: displayname + avatar + Beeper bridge-network markers. */
export async function ensureNetworkIdentity(bridge: Bridge, branding: NetworkBranding): Promise<void> {
  const intent = bridge.getIntent();
  const botMxid = intent.userId;
  const logo = await getLogoMxc(intent, branding.logoPath);
  await intent.setDisplayName(branding.name).catch((err: Error) => console.warn("bot setDisplayName failed:", err.message));
  if (logo) await intent.setAvatarUrl(logo).catch((err: Error) => console.warn("bot setAvatarUrl failed:", err.message));
  // PATCH the profile with com.beeper.bridge.* so Beeper maps the bot to a network
  const profile: Record<string, unknown> = {
    displayname: branding.name,
    "com.beeper.bridge.service": branding.networkId,
    "com.beeper.bridge.network": branding.networkId,
    "com.beeper.bridge.is_bridge_bot": true,
  };
  if (logo) profile.avatar_url = logo;
  await intent.matrixClient
    .doRequest("PATCH", `/_matrix/client/v3/profile/${encodeURIComponent(botMxid)}`, null, profile)
    .catch((err: Error) => console.warn("bot profile PATCH failed:", err.message));
}

/**
 * Emit both bridge-info state events so Beeper renders the portal under this
 * network. `intent` MUST be a room member with power (ghost for DMs, bot for groups).
 */
export async function tagPortalNetwork(
  intent: Intent,
  roomId: string,
  channelId: string,
  channelName: string,
  threadType: ZaloThreadType,
  branding: NetworkBranding,
  botMxid: string,
): Promise<void> {
  const logo = await getLogoMxc(intent, branding.logoPath);
  const content = {
    bridgebot: botMxid,
    creator: intent.userId,
    protocol: {
      id: branding.networkId,
      displayname: branding.name,
      ...(logo ? { avatar_url: logo } : {}),
      external_url: "https://zalo.me",
    },
    channel: { id: channelId, displayname: channelName },
    "com.beeper.room_type.v2": threadType === "group" ? "group_dm" : "dm",
  };
  for (const type of ["m.bridge", "uk.half-shot.bridge"]) {
    await intent
      .sendStateEvent(roomId, type, branding.stateKey, content)
      .catch((err: Error) => console.warn(`${type} state failed for ${roomId}:`, err.message));
  }
}
