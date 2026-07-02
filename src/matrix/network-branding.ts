// Makes the bridge present as a native "Zalo" network in Beeper:
//  - the appservice bot wears the Zalo name + logo (network identity in the UI)
//  - each portal carries an `m.bridge` / `uk.half-shot.bridge` state event that
//    Beeper reads to label the chat's network with an icon (MSC2346).
import fs from "node:fs";
import type { Bridge, Intent } from "matrix-appservice-bridge";

const NETWORK_ID = "zalo";
const NETWORK_NAME = "Zalo";
const LOGO_PATH = "assets/zalo-logo.png";

let cachedLogoMxc: string | null = null;

/** Uploads the Zalo logo once and returns its mxc:// URI. */
async function getLogoMxc(intent: Intent): Promise<string | null> {
  if (cachedLogoMxc) return cachedLogoMxc;
  if (!fs.existsSync(LOGO_PATH)) return null;
  const buffer = fs.readFileSync(LOGO_PATH);
  cachedLogoMxc = await intent.uploadContent(buffer, { type: "image/png", name: "zalo-logo.png" });
  return cachedLogoMxc;
}

/** One-time bot profile so the network shows as "Zalo" with the logo. */
export async function ensureNetworkIdentity(bridge: Bridge): Promise<void> {
  const intent = bridge.getIntent();
  const logo = await getLogoMxc(intent);
  await intent.setDisplayName(NETWORK_NAME).catch((err: Error) => console.warn("bot setDisplayName failed:", err.message));
  if (logo) await intent.setAvatarUrl(logo).catch((err: Error) => console.warn("bot setAvatarUrl failed:", err.message));
}

/**
 * Emits the bridge state event so Beeper renders the portal under the Zalo
 * network. state_key is the bridge instance id; content follows MSC2346 with the
 * Beeper-recognized `network` block.
 */
export async function tagPortalNetwork(bridge: Bridge, roomId: string, channelName: string): Promise<void> {
  const intent = bridge.getIntent();
  const logo = await getLogoMxc(intent);
  const protocol = {
    id: NETWORK_ID,
    displayname: NETWORK_NAME,
    ...(logo ? { avatar_url: logo } : {}),
  };
  const content = {
    bridgebot: intent.userId,
    protocol,
    network: protocol,
    channel: { id: roomId, displayname: channelName },
  };
  // Both the stable-ish and half-shot keys; Beeper reads uk.half-shot.bridge
  await intent
    .sendStateEvent(roomId, "uk.half-shot.bridge", `dev.beeper.zalo://${NETWORK_ID}`, content)
    .catch((err: Error) => console.warn(`m.bridge state failed for ${roomId}:`, err.message));
}
