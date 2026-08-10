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
 * Publishes the Zalo account's state to Beeper. Beeper records a state only when
 * `state_event` *changes*, so name and avatar must ride along with the transition itself —
 * a follow-up refresh carrying the same state is silently dropped.
 */
export function createZaloStatePublisher(deps: ZaloStatePublisherDeps): (stateEvent: RemoteStateEvent) => Promise<void> {
  const report = createRemoteStateReporter(deps.homeserverUrl, deps.bridgeId, deps.asToken);

  return async (stateEvent) => {
    const remoteId = deps.getOwnId();
    if (!remoteId) return; // logged out — nothing to file the state under

    const profile = stateEvent === "CONNECTED" ? await withTimeout(deps.getOwnProfile(remoteId)) : null;
    const avatar = profile?.avatarUrl ? await deps.uploadAvatar(profile.avatarUrl).catch(warnAvatar) : undefined;

    await report({
      state_event: stateEvent,
      remote_id: remoteId,
      remote_name: profile?.displayName ?? deps.fallbackName,
      ...(profile?.displayName ? { remote_profile: { name: profile.displayName, avatar } } : {}),
    });
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
