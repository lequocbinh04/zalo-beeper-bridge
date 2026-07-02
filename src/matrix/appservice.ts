// Matrix appservice wiring: Bridge instance + event routing.
// bbctl proxy holds the websocket to Beeper and forwards to our local HTTP port.
import { Bridge, type Request, type WeakEvent } from "matrix-appservice-bridge";
import type { BridgeConfig } from "../config.ts";

export type MatrixEventHandler = (event: WeakEvent) => Promise<void> | void;

export function createBridge(config: BridgeConfig, onEvent: MatrixEventHandler): Bridge {
  const bridge = new Bridge({
    homeserverUrl: config.matrix.homeserverUrl,
    domain: config.matrix.domain,
    registration: config.matrix.registrationPath,
    // Own mapping store comes in Phase 4 (SQLite) — skip nedb stores entirely
    disableStores: true,
    controller: {
      onEvent: (request: Request<WeakEvent>) => {
        const event = request.getData();
        // Catches both sync throws and async rejections from handlers
        void (async () => {
          try {
            await onEvent(event);
          } catch (err) {
            console.error(`onEvent failed for ${event.type} in ${event.room_id}:`, err);
          }
        })();
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
