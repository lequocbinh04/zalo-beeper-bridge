// Beeper renders a bridge as a chat network only when its *remote account* state is
// published (visible as `bridges.<id>.remoteState` in `bbctl whoami --raw`). `bbctl proxy`
// publishes the bridge-level state (STARTING/RUNNING/BRIDGE_UNREACHABLE) on our behalf,
// but the per-account state is the bridge's own job. With it missing, newer Beeper clients
// hide the network chip and every chat filed under it, while older clients still render
// them from the local index — which is why the same account looks different per device.
//
// Two distinct endpoints, easy to confuse:
//   POST .../bridge/<id>/bridge_state         camelCase `stateEvent`, bridge-level states only
//   POST .../bridge/<id>/bridge_remote_state  snake_case `state_event`, per-account states  ← this one

const BEEPER_API_BASE = "https://api.beeper.com";

/** Beeper hungryserv URLs embed the account name: https://matrix.beeper.com/_hungryserv/<username> */
const HUNGRYSERV_USERNAME = /\/_hungryserv\/([^/?#]+)/;

export type RemoteStateEvent =
  | "CONNECTED"
  | "TRANSIENT_DISCONNECT"
  | "BAD_CREDENTIALS"
  | "LOGGED_OUT"
  | "UNKNOWN_ERROR";

export interface RemoteState {
  state_event: RemoteStateEvent;
  /** Zalo uid — the key Beeper files the account under */
  remote_id: string;
  remote_name?: string;
  remote_profile?: { name?: string; avatar?: string };
}

/** Publishes one remote-account state. Never throws: status reporting must not break the bridge. */
export type RemoteStateReporter = (state: RemoteState) => Promise<void>;

/** Profile lookups go through zca-js and can hang; past this we publish with a plain label. */
const PROFILE_LOOKUP_TIMEOUT_MS = 5_000;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
// Beeper expires a remote state that goes unrefreshed for a few hours even while the Zalo
// listener stays connected the whole time (confirmed empirically: one state_event transition
// at startup, no further transitions for 3h+, remoteState came back empty on next check).
// Re-post the last known state periodically so a long-idle connection doesn't go stale.
const HEARTBEAT_MS = 10 * 60 * 1000;

export interface ZaloStatePublisherDeps {
  homeserverUrl: string;
  /** appservice id, e.g. "sh-zalo" */
  bridgeId: string;
  asToken: string;
  /** account label when the Zalo profile is unavailable */
  fallbackName: string;
  getOwnId: () => string | null;
  getOwnProfile: (uid: string) => Promise<{ displayName?: string; avatarUrl?: string } | null>;
  /** Zalo CDN links are signed and expire — Beeper needs the avatar re-hosted as mxc:// */
  uploadAvatar: (zaloAvatarUrl: string) => Promise<string | undefined>;
}

/**
 * Publishes the Zalo account's state to Beeper, then keeps re-posting it on an interval so a
 * long-idle connection (no further transitions) doesn't silently expire server-side. Beeper's
 * display fields (name/avatar) only take effect on an actual `state_event` change, but the
 * repost still resets the server's staleness clock — that's the point of the heartbeat.
 */
export function createZaloStatePublisher(deps: ZaloStatePublisherDeps): (stateEvent: RemoteStateEvent) => Promise<void> {
  const report = createRemoteStateReporter(deps.homeserverUrl, deps.bridgeId, deps.asToken);
  let lastState: RemoteState | null = null;

  setInterval(() => {
    if (lastState) void report(lastState);
  }, HEARTBEAT_MS).unref();

  return async (stateEvent) => {
    const remoteId = deps.getOwnId();
    if (!remoteId) return; // logged out — nothing to file the state under

    const profile = stateEvent === "CONNECTED" ? await withTimeout(deps.getOwnProfile(remoteId)) : null;
    const avatar = profile?.avatarUrl ? await deps.uploadAvatar(profile.avatarUrl).catch(warnAvatar) : undefined;

    lastState = {
      state_event: stateEvent,
      remote_id: remoteId,
      remote_name: profile?.displayName ?? deps.fallbackName,
      ...(profile?.displayName ? { remote_profile: { name: profile.displayName, avatar } } : {}),
    };
    await report(lastState);
  };
}

function warnAvatar(err: Error): undefined {
  console.warn("[beeper] own avatar upload failed:", err.message);
  return undefined;
}

async function withTimeout<T>(promise: Promise<T | null>): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PROFILE_LOOKUP_TIMEOUT_MS).unref()),
  ]);
}

export { AVATAR_MAX_BYTES };

/**
 * Build a reporter for a Beeper-hosted bridge. Returns a no-op on any other homeserver,
 * so a self-hosted (non-Beeper) deployment keeps working untouched.
 */
export function createRemoteStateReporter(homeserverUrl: string, bridgeId: string, asToken: string): RemoteStateReporter {
  const username = HUNGRYSERV_USERNAME.exec(homeserverUrl)?.[1];
  if (!username) return async () => undefined;

  const endpoint = `${BEEPER_API_BASE}/bridgebox/${encodeURIComponent(username)}/bridge/${encodeURIComponent(bridgeId)}/bridge_remote_state`;

  return async (state) => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${asToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...state, timestamp: Math.floor(Date.now() / 1000) }),
      });
      if (!res.ok) {
        console.warn(`[beeper] remote state ${state.state_event} rejected: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
    } catch (err) {
      console.warn(`[beeper] remote state ${state.state_event} failed:`, (err as Error).message);
    }
  };
}
