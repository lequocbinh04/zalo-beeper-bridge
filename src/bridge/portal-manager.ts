// Zalo thread → Matrix portal room, created on first message.
// Creation is serialized per-thread with an in-flight promise map so concurrent
// messages from a new thread cannot provision duplicate rooms.
import type { Bridge } from "matrix-appservice-bridge";
import { tagPortalNetwork } from "../matrix/network-branding.ts";
import type { MappingStore, PortalRow } from "./mapping-store.ts";
import type { PuppetRegistry } from "./puppet-registry.ts";
import type { ZaloThreadType } from "../zalo/types.ts";

export interface PortalContext {
  threadId: string;
  threadType: ZaloThreadType;
  /** ghost that triggers creation (DM peer / first group speaker) */
  senderId: string;
  senderName?: string;
  /** resolver for group display names (zca-js getGroupInfo behind the facade) */
  resolveGroupName?: (threadId: string) => Promise<string | null>;
}

export class PortalManager {
  private readonly bridge: Bridge;
  private readonly store: MappingStore;
  private readonly puppets: PuppetRegistry;
  private readonly ownerUserId: string;
  private readonly inFlight = new Map<string, Promise<PortalRow>>();
  /** roomIds where the owner's auto-join was ensured this run */
  private readonly ownerJoined = new Set<string>();
  /** "roomId|ghostMxid" pairs whose join + room profile were ensured this run */
  private readonly ghostJoined = new Set<string>();

  constructor(bridge: Bridge, store: MappingStore, puppets: PuppetRegistry, ownerUserId: string) {
    this.bridge = bridge;
    this.store = store;
    this.puppets = puppets;
    this.ownerUserId = ownerUserId;
  }

  isPortalRoom(roomId: string): boolean {
    return this.store.isPortalRoom(roomId);
  }

  async getOrCreatePortal(ctx: PortalContext): Promise<PortalRow> {
    const existing = this.store.getPortalByThread(ctx.threadId);
    if (existing) {
      await this.ensureOwnerJoined(existing.room_id);
      return existing;
    }

    const pending = this.inFlight.get(ctx.threadId);
    if (pending) return pending;

    const creation = this.createPortal(ctx).finally(() => this.inFlight.delete(ctx.threadId));
    this.inFlight.set(ctx.threadId, creation);
    return creation;
  }

  /**
   * Auto-accept the portal invite as the owner (hungryserv lets the as_token
   * double-puppet the owner). Without this, chats stay invisible until the user
   * manually accepts, and sending fails with "no permission" while un-joined.
   * Falls back silently to manual accept when double-puppeting is unavailable.
   */
  private async ensureOwnerJoined(roomId: string): Promise<void> {
    if (this.ownerJoined.has(roomId)) return;
    try {
      await this.bridge.getIntent(this.ownerUserId).join(roomId);
    } catch (err) {
      console.warn(`[bridge] owner auto-join ${roomId} failed (manual accept needed):`, (err as Error).message);
    }
    this.ownerJoined.add(roomId); // one attempt per room per run either way
  }

  private async createPortal(ctx: PortalContext): Promise<PortalRow> {
    let row: PortalRow;
    if (ctx.threadType === "user") {
      // DM portal: created BY the ghost so Beeper renders it as a direct chat
      const ghostIntent = await this.puppets.ensurePuppet(ctx.senderId, ctx.senderName);
      const { room_id } = await ghostIntent.createRoom({
        createAsClient: true,
        options: {
          invite: [this.ownerUserId],
          is_direct: true,
          preset: "trusted_private_chat",
          name: ctx.senderName,
        },
      });
      row = { thread_id: ctx.threadId, thread_type: "user", room_id, name: ctx.senderName ?? null };
    } else {
      const groupName = (await ctx.resolveGroupName?.(ctx.threadId).catch(() => null)) ?? `Zalo group ${ctx.threadId.slice(-6)}`;
      const { room_id } = await this.bridge.getIntent().createRoom({
        options: {
          invite: [this.ownerUserId],
          preset: "private_chat",
          name: groupName,
        },
      });
      row = { thread_id: ctx.threadId, thread_type: "group", room_id, name: groupName };
    }
    this.store.insertPortal(row);
    await tagPortalNetwork(this.bridge, row.room_id, row.name ?? "Zalo chat");
    await this.ensureOwnerJoined(row.room_id);
    return row;
  }

  /**
   * Group ghosts must be invited by the bot before their first send, and need a
   * per-room member profile — some clients render the bare MXID otherwise.
   */
  async ensureGhostInRoom(zaloUid: string, roomId: string, displayName?: string): Promise<void> {
    const ghostMxid = this.puppets.mxidFor(zaloUid);
    const key = `${roomId}|${ghostMxid}`;
    if (this.ghostJoined.has(key)) return;

    const ghostIntent = this.puppets.intentFor(zaloUid);
    try {
      await ghostIntent.join(roomId);
    } catch {
      await this.bridge.getIntent().invite(roomId, ghostMxid);
      await ghostIntent.join(roomId);
    }
    if (displayName) {
      await ghostIntent
        .setRoomUserProfile(roomId, { displayname: displayName })
        .catch((err: Error) => console.warn(`setRoomUserProfile(${ghostMxid}) failed:`, err.message));
    }
    this.ghostJoined.add(key);
  }
}
