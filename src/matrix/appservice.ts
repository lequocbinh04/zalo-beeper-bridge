// Matrix appservice wiring: Bridge instance + event routing.
// bbctl proxy holds the websocket to Beeper and forwards to our local HTTP port.
import { AppService } from "matrix-appservice";
import { Bridge, type EphemeralEvent, type Request, type WeakEvent } from "matrix-appservice-bridge";
import type { BridgeConfig } from "../config.ts";

// matrix-appservice only parses ephemeral EDUs from the UNSTABLE MSC2409 key
// (`de.sorunome.msc2409.ephemeral`), but Beeper/hungryserv sends them under the
// STABLE `ephemeral` key — so read receipts and typing were silently dropped.
// Patch the transaction handler (before any AppService is constructed) to mirror
// the stable key onto the unstable one the library reads.
type TxnBody = Record<string, unknown> & { ephemeral?: unknown; "de.sorunome.msc2409.ephemeral"?: unknown };
const appServiceProto = AppService.prototype as unknown as {
  onTransaction: (req: { body?: TxnBody }, res: unknown) => void;
};
const originalOnTransaction = appServiceProto.onTransaction;
appServiceProto.onTransaction = function patchedOnTransaction(req, res) {
  const body = req.body;
  if (body && body["de.sorunome.msc2409.ephemeral"] === undefined && body.ephemeral !== undefined) {
    body["de.sorunome.msc2409.ephemeral"] = body.ephemeral;
  }
  return originalOnTransaction.call(this, req, res);
};

export type MatrixEventHandler = (event: WeakEvent) => Promise<void> | void;
// Read receipts and typing arrive via a SEPARATE controller callback, not onEvent
export type MatrixEphemeralHandler = (event: EphemeralEvent) => Promise<void> | void;

export function createBridge(config: BridgeConfig, onEvent: MatrixEventHandler, onEphemeral: MatrixEphemeralHandler): Bridge {
  const runGuarded = (label: string, fn: () => Promise<void> | void, ctx: string) => {
    void (async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`${label} failed for ${ctx}:`, err);
      }
    })();
  };

  const bridge = new Bridge({
    homeserverUrl: config.matrix.homeserverUrl,
    domain: config.matrix.domain,
    registration: config.matrix.registrationPath,
    // Own mapping store comes in Phase 4 (SQLite) — skip nedb stores entirely
    disableStores: true,
    controller: {
      onEvent: (request: Request<WeakEvent>) => {
        const event = request.getData();
        runGuarded("onEvent", () => onEvent(event), `${event.type} in ${event.room_id}`);
      },
      onEphemeralEvent: (request: Request<EphemeralEvent>) => {
        const event = request.getData();
        runGuarded("onEphemeralEvent", () => onEphemeral(event), event.type);
      },
    },
  });
  return bridge;
}

export async function startBridge(bridge: Bridge, config: BridgeConfig): Promise<void> {
  // Loopback only — bbctl proxy is the sole legitimate caller; keep 29350 off the LAN
  await bridge.run(config.matrix.port, undefined, "127.0.0.1");
  console.log(`Appservice listening on localhost:${config.matrix.port} (run 'bbctl proxy -r ${config.matrix.registrationPath}' alongside)`);
}
