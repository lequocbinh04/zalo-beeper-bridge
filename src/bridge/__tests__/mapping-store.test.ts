import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MappingStore } from "../mapping-store.ts";

let dir: string;
let dbPath: string;
let store: MappingStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  dbPath = path.join(dir, "test.db");
  store = new MappingStore(dbPath);
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("MappingStore", () => {
  it("persists portals across reopen (restart survival)", () => {
    store.insertPortal({ thread_id: "t1", thread_type: "user", room_id: "!r1:x", name: "Alice" });
    store.close();
    store = new MappingStore(dbPath);
    expect(store.getPortalByThread("t1")).toMatchObject({ room_id: "!r1:x", thread_type: "user", name: "Alice" });
    expect(store.isPortalRoom("!r1:x")).toBe(true);
    expect(store.isPortalRoom("!other:x")).toBe(false);
  });

  it("rejects duplicate portals for the same thread or room", () => {
    store.insertPortal({ thread_id: "t1", thread_type: "user", room_id: "!r1:x", name: null });
    expect(() => store.insertPortal({ thread_id: "t1", thread_type: "user", room_id: "!r2:x", name: null })).toThrow();
    expect(() => store.insertPortal({ thread_id: "t2", thread_type: "group", room_id: "!r1:x", name: null })).toThrow();
  });

  it("dedups messages via recordMessage (INSERT OR IGNORE semantics)", () => {
    expect(store.recordMessage("m1", "!r1:x", "$e1", "inbound")).toBe(true);
    expect(store.recordMessage("m1", "!r1:x", "$e2", "inbound")).toBe(false); // replay
    expect(store.hasMessage("m1")).toBe(true);
    expect(store.hasMessage("m2")).toBe(false);
  });

  it("backfills event_id and cli_msg_id across the outbound/echo race (either order)", () => {
    // echo first (cli only), then outbound (event only)
    store.recordMessage("mA", "!r:x", null, "outbound", null, "cliA");
    store.recordMessage("mA", "!r:x", "$evA", "outbound", null, null);
    expect(store.getZaloTargetByEventId("$evA")).toEqual({ zaloMsgId: "mA", cliMsgId: "cliA", roomId: "!r:x", direction: "outbound" });

    // outbound first (event only), then echo (cli only)
    store.recordMessage("mB", "!r:x", "$evB", "outbound", null, null);
    store.recordMessage("mB", "!r:x", null, "outbound", null, "cliB");
    expect(store.getZaloTargetByEventId("$evB")).toEqual({ zaloMsgId: "mB", cliMsgId: "cliB", roomId: "!r:x", direction: "outbound" });
  });

  it("tracks puppet display-name changes for profile sync", () => {
    expect(store.upsertPuppet("u1", "@sh-zalo_u1:x", "Old Name")).toBe(true); // new with name
    expect(store.upsertPuppet("u1", "@sh-zalo_u1:x", "Old Name")).toBe(false); // unchanged
    expect(store.upsertPuppet("u1", "@sh-zalo_u1:x", "New Name")).toBe(true); // renamed
    expect(store.upsertPuppet("u2", "@sh-zalo_u2:x", null)).toBe(false); // new without name
  });
});
