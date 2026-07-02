// Portal provisioning against a REAL SQLite store and a mocked Bridge/Intent —
// exercises the race protection and restart idempotency the plan calls out.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bridge } from "matrix-appservice-bridge";
import { MappingStore } from "../mapping-store.ts";
import { PortalManager } from "../portal-manager.ts";
import { PuppetRegistry } from "../puppet-registry.ts";

const OWNER = "@owner:beeper.com";

function mockBridge() {
  let roomCounter = 0;
  const createRoom = vi.fn(async (_opts: unknown) => ({ room_id: `!room${++roomCounter}:beeper.local` }));
  const intent = {
    createRoom,
    ensureRegistered: vi.fn(async () => undefined),
    setDisplayName: vi.fn(async () => undefined),
    setAvatarUrl: vi.fn(async () => undefined),
    join: vi.fn(async () => undefined),
    invite: vi.fn(async () => undefined),
    uploadContent: vi.fn(async () => "mxc://logo"),
    sendStateEvent: vi.fn(async () => ({ event_id: "$s" })),
    userId: "@sh-zalobot:beeper.local",
  };
  const bridge = { getIntent: vi.fn(() => intent) } as unknown as Bridge;
  return { bridge, intent, createRoom };
}

let dir: string;
let store: MappingStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-test-"));
  store = new MappingStore(path.join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("PortalManager", () => {
  it("creates a DM portal once and reuses it afterwards", async () => {
    const { bridge, createRoom } = mockBridge();
    const portals = new PortalManager(bridge, store, new PuppetRegistry(bridge, store, "beeper.local"), OWNER);

    const first = await portals.getOrCreatePortal({ threadId: "t1", threadType: "user", senderId: "u1", senderName: "Alice" });
    const second = await portals.getOrCreatePortal({ threadId: "t1", threadType: "user", senderId: "u1" });
    expect(first.room_id).toBe(second.room_id);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom.mock.calls[0]?.[0]).toMatchObject({
      createAsClient: true,
      options: { is_direct: true, invite: [OWNER], name: "Alice" },
    });
  });

  it("serializes CONCURRENT creation for the same thread (no duplicate rooms)", async () => {
    const { bridge, createRoom } = mockBridge();
    const portals = new PortalManager(bridge, store, new PuppetRegistry(bridge, store, "beeper.local"), OWNER);

    const [a, b, c] = await Promise.all([
      portals.getOrCreatePortal({ threadId: "t1", threadType: "user", senderId: "u1" }),
      portals.getOrCreatePortal({ threadId: "t1", threadType: "user", senderId: "u1" }),
      portals.getOrCreatePortal({ threadId: "t1", threadType: "user", senderId: "u1" }),
    ]);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(new Set([a.room_id, b.room_id, c.room_id]).size).toBe(1);
  });

  it("uses resolved group name, falling back to a placeholder", async () => {
    const { bridge, createRoom } = mockBridge();
    const portals = new PortalManager(bridge, store, new PuppetRegistry(bridge, store, "beeper.local"), OWNER);

    const named = await portals.getOrCreatePortal({
      threadId: "g1",
      threadType: "group",
      senderId: "u1",
      resolveGroupName: async () => "Gia đình",
    });
    expect(named.name).toBe("Gia đình");

    const fallback = await portals.getOrCreatePortal({
      threadId: "g2222222",
      threadType: "group",
      senderId: "u1",
      resolveGroupName: async () => null,
    });
    expect(fallback.name).toBe("Zalo group 222222");
    expect(createRoom).toHaveBeenCalledTimes(2);
  });

  it("skips creation entirely when the portal is already persisted (restart)", async () => {
    store.insertPortal({ thread_id: "t9", thread_type: "user", room_id: "!existing:x", name: "Bob" });
    const { bridge, createRoom } = mockBridge();
    const portals = new PortalManager(bridge, store, new PuppetRegistry(bridge, store, "beeper.local"), OWNER);

    const portal = await portals.getOrCreatePortal({ threadId: "t9", threadType: "user", senderId: "u9" });
    expect(portal.room_id).toBe("!existing:x");
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("invites the ghost via bot when direct join fails (group first-speak)", async () => {
    const { bridge, intent } = mockBridge();
    intent.join.mockRejectedValueOnce(new Error("not invited"));
    const portals = new PortalManager(bridge, store, new PuppetRegistry(bridge, store, "beeper.local"), OWNER);

    await portals.ensureGhostInRoom("u5", "!g:x");
    expect(intent.invite).toHaveBeenCalledWith("!g:x", "@sh-zalo_u5:beeper.local");
    expect(intent.join).toHaveBeenCalledTimes(2);
  });
});
