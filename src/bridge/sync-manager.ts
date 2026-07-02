// On-demand conversation sync (bot command `sync`): pre-creates portals for
// pinned conversations + a bounded set of groups, and best-effort backfills
// recent group history. Paced deliberately — burst API traffic on the user's
// MAIN Zalo account is a ban-risk surface.
import type { InboundHandler } from "./inbound-handler.ts";
import type { PortalManager } from "./portal-manager.ts";
import type { ZaloClient } from "../zalo/zalo-client.ts";

const PACE_MS = 1_500;
const GROUP_LIMIT = 10;
const HISTORY_COUNT = 30;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncManagerDeps {
  zalo: ZaloClient;
  portals: PortalManager;
  inbound: InboundHandler;
}

export class SyncManager {
  private readonly deps: SyncManagerDeps;
  private running = false;

  constructor(deps: SyncManagerDeps) {
    this.deps = deps;
  }

  /** Returns a human-readable summary for the management room. */
  async run(): Promise<string> {
    if (this.running) return "Sync already running.";
    this.running = true;
    try {
      return await this.doRun();
    } finally {
      this.running = false;
    }
  }

  private async doRun(): Promise<string> {
    const { zalo, portals, inbound } = this.deps;
    const pinned = await zalo.getPinnedThreadIds();
    const groupIds = await zalo.getAllGroupIds();
    const groupSet = new Set(groupIds);

    // Pinned first (user-curated), then top groups up to the limit
    const targets: Array<{ threadId: string; type: "user" | "group" }> = [];
    for (const id of pinned) targets.push({ threadId: id, type: groupSet.has(id) ? "group" : "user" });
    for (const id of groupIds.slice(0, GROUP_LIMIT)) {
      if (!targets.some((t) => t.threadId === id)) targets.push({ threadId: id, type: "group" });
    }

    let portalsEnsured = 0;
    let backfilled = 0;
    const failures: string[] = [];

    for (const target of targets) {
      await sleep(PACE_MS);
      try {
        if (target.type === "user") {
          const profile = await zalo.getUserProfile(target.threadId);
          await portals.getOrCreatePortal({
            threadId: target.threadId,
            threadType: "user",
            senderId: target.threadId, // DM peer uid == thread id
            senderName: profile?.displayName,
          });
        } else {
          await portals.getOrCreatePortal({
            threadId: target.threadId,
            threadType: "group",
            senderId: "",
            resolveGroupName: (id) => zalo.getGroupName(id),
          });
          const history = await zalo.getGroupHistory(target.threadId, HISTORY_COUNT);
          for (const msg of history) inbound.handle(msg); // per-thread queue keeps order; dedup skips known
          backfilled += history.length;
        }
        portalsEnsured++;
      } catch (err) {
        failures.push(`${target.threadId}: ${(err as Error).message}`);
      }
    }

    const lines = [
      `Sync done: ${portalsEnsured}/${targets.length} conversations (${pinned.length} pinned, groups capped at ${GROUP_LIMIT}).`,
      `Backfilled ~${backfilled} recent group messages (DM history is not exposed by Zalo Web — DMs fill from now on).`,
    ];
    if (failures.length) lines.push(`Failures: ${failures.join("; ")}`);
    return lines.join("\n");
  }
}
