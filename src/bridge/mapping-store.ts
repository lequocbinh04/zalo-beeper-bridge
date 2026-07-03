// SQLite persistence: portal rooms, ghost puppets, message dedup/echo keys.
// better-sqlite3 sync API — single-user bridge volume makes async pooling YAGNI.
import Database from "better-sqlite3";
import type { ZaloThreadType } from "../zalo/types.ts";

export interface PortalRow {
  thread_id: string;
  thread_type: ZaloThreadType;
  room_id: string;
  name: string | null;
}

export type MessageDirection = "inbound" | "outbound";

const SCHEMA_VERSION = 5;

export class MappingStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    const current = (this.db.pragma("user_version", { simple: true }) as number) ?? 0;
    if (current >= SCHEMA_VERSION) return;
    // Transactional: a crash mid-migration must not leave ALTERs applied with a
    // stale user_version (re-running an ALTER = duplicate-column crash loop)
    this.db.transaction(() => {
      if (current < 1) this.migrateV1();
      if (current < 2) this.db.exec("ALTER TABLE puppet ADD COLUMN avatar_url TEXT");
      if (current < 3) this.db.exec("ALTER TABLE message ADD COLUMN quote_json TEXT");
      // cliMsgId is required by Zalo reaction/undo APIs; store per inbound message
      if (current < 4) this.db.exec("ALTER TABLE message ADD COLUMN cli_msg_id TEXT");
      // sender_id + msg_type let us build a Zalo seen event (Beeper read → Zalo "seen")
      if (current < 5) {
        this.db.exec("ALTER TABLE message ADD COLUMN sender_id TEXT");
        this.db.exec("ALTER TABLE message ADD COLUMN msg_type TEXT");
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
  }

  private migrateV1(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portal (
        thread_id   TEXT PRIMARY KEY,
        thread_type TEXT NOT NULL CHECK (thread_type IN ('user','group')),
        room_id     TEXT NOT NULL UNIQUE,
        name        TEXT,
        created_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS puppet (
        zalo_uid     TEXT PRIMARY KEY,
        mxid         TEXT NOT NULL UNIQUE,
        display_name TEXT,
        updated_at   INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS message (
        zalo_msg_id TEXT PRIMARY KEY,
        room_id     TEXT NOT NULL,
        event_id    TEXT UNIQUE,
        direction   TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
        ts          INTEGER NOT NULL
      );
    `);
  }

  getPuppetDisplayName(zaloUid: string): string | null {
    const row = this.db.prepare("SELECT display_name FROM puppet WHERE zalo_uid = ?").get(zaloUid) as
      | { display_name: string | null }
      | undefined;
    return row?.display_name ?? null;
  }

  getPuppetAvatarUrl(zaloUid: string): string | null {
    const row = this.db.prepare("SELECT avatar_url FROM puppet WHERE zalo_uid = ?").get(zaloUid) as
      | { avatar_url: string | null }
      | undefined;
    return row?.avatar_url ?? null;
  }

  setPuppetAvatarUrl(zaloUid: string, avatarUrl: string): void {
    this.db.prepare("UPDATE puppet SET avatar_url = ?, updated_at = ? WHERE zalo_uid = ?").run(avatarUrl, Date.now(), zaloUid);
  }

  getPortalByThread(threadId: string): PortalRow | undefined {
    return this.db.prepare("SELECT thread_id, thread_type, room_id, name FROM portal WHERE thread_id = ?").get(threadId) as PortalRow | undefined;
  }

  isPortalRoom(roomId: string): boolean {
    return this.db.prepare("SELECT 1 FROM portal WHERE room_id = ?").get(roomId) !== undefined;
  }

  getPortalByRoom(roomId: string): PortalRow | undefined {
    return this.db.prepare("SELECT thread_id, thread_type, room_id, name FROM portal WHERE room_id = ?").get(roomId) as PortalRow | undefined;
  }

  getAllPortals(): PortalRow[] {
    return this.db.prepare("SELECT thread_id, thread_type, room_id, name FROM portal").all() as PortalRow[];
  }

  /** True when the bridge itself posted this Matrix event (echo guard for outbound). */
  hasEventId(eventId: string): boolean {
    return this.db.prepare("SELECT 1 FROM message WHERE event_id = ?").get(eventId) !== undefined;
  }

  /** Persist "this outbound Matrix event was handled" even when the Zalo send
   * returned no msgId, so a redelivery after a restart is not sent again. */
  markOutboundHandled(eventId: string, roomId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO message (zalo_msg_id, room_id, event_id, direction, ts) VALUES (?, ?, ?, 'outbound', ?)")
      .run(`evt:${eventId}`, roomId, eventId, Date.now());
  }

  /** Matrix event for a Zalo msgId (read-receipt mapping). */
  getEventIdByMsgId(zaloMsgId: string): string | null {
    const row = this.db.prepare("SELECT event_id FROM message WHERE zalo_msg_id = ?").get(zaloMsgId) as
      | { event_id: string | null }
      | undefined;
    return row?.event_id ?? null;
  }

  insertPortal(row: PortalRow): void {
    this.db
      .prepare("INSERT INTO portal (thread_id, thread_type, room_id, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.thread_id, row.thread_type, row.room_id, row.name, Date.now());
  }

  /** Upserts puppet; returns true when the display name changed (profile sync needed). */
  upsertPuppet(zaloUid: string, mxid: string, displayName: string | null): boolean {
    const existing = this.db.prepare("SELECT display_name FROM puppet WHERE zalo_uid = ?").get(zaloUid) as
      | { display_name: string | null }
      | undefined;
    if (!existing) {
      this.db
        .prepare("INSERT INTO puppet (zalo_uid, mxid, display_name, updated_at) VALUES (?, ?, ?, ?)")
        .run(zaloUid, mxid, displayName, Date.now());
      return displayName !== null;
    }
    if (displayName !== null && displayName !== existing.display_name) {
      this.db.prepare("UPDATE puppet SET display_name = ?, updated_at = ? WHERE zalo_uid = ?").run(displayName, Date.now(), zaloUid);
      return true;
    }
    return false;
  }

  /** Atomic dedup: returns false when this Zalo msgId was already recorded. */
  recordMessage(
    zaloMsgId: string,
    roomId: string,
    eventId: string | null,
    direction: MessageDirection,
    quoteJson: string | null = null,
    cliMsgId: string | null = null,
    senderId: string | null = null,
    msgType: string | null = null,
  ): boolean {
    const result = this.db
      .prepare(
        "INSERT OR IGNORE INTO message (zalo_msg_id, room_id, event_id, direction, ts, quote_json, cli_msg_id, sender_id, msg_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(zaloMsgId, roomId, eventId, direction, Date.now(), quoteJson, cliMsgId, senderId, msgType);
    if (result.changes === 0) {
      // Outbound send and its selfListen echo race to record the same msgId; each
      // carries a different piece (send → event_id, echo → cli_msg_id). Backfill
      // whichever null field the loser supplies so recall/receipts have both.
      if (eventId) this.db.prepare("UPDATE message SET event_id = ? WHERE zalo_msg_id = ? AND event_id IS NULL").run(eventId, zaloMsgId);
      if (cliMsgId) this.db.prepare("UPDATE message SET cli_msg_id = ? WHERE zalo_msg_id = ? AND cli_msg_id IS NULL").run(cliMsgId, zaloMsgId);
      // quote payload for our own sends only arrives with the echo (after outbound recorded it)
      if (quoteJson) this.db.prepare("UPDATE message SET quote_json = ? WHERE zalo_msg_id = ? AND quote_json IS NULL").run(quoteJson, zaloMsgId);
    }
    return result.changes === 1;
  }

  /** Quote payload for the Zalo message behind a Matrix event (reply mapping). */
  getQuoteJsonByEventId(eventId: string): string | null {
    const row = this.db.prepare("SELECT quote_json FROM message WHERE event_id = ?").get(eventId) as
      | { quote_json: string | null }
      | undefined;
    return row?.quote_json ?? null;
  }

  /** Zalo target ids for a Matrix event — reaction/undo need msgId (+cliMsgId when known). */
  getZaloTargetByEventId(
    eventId: string,
  ): { zaloMsgId: string; cliMsgId: string | null; roomId: string; direction: MessageDirection } | null {
    const row = this.db
      .prepare("SELECT zalo_msg_id, cli_msg_id, room_id, direction FROM message WHERE event_id = ?")
      .get(eventId) as
      | { zalo_msg_id: string; cli_msg_id: string | null; room_id: string; direction: MessageDirection }
      | undefined;
    return row
      ? { zaloMsgId: row.zalo_msg_id, cliMsgId: row.cli_msg_id, roomId: row.room_id, direction: row.direction }
      : null;
  }

  /** Everything needed to send a Zalo "seen" event for a bridged inbound message. */
  getSeenTargetByEventId(
    eventId: string,
  ): { zaloMsgId: string; cliMsgId: string | null; senderId: string | null; msgType: string | null } | null {
    const row = this.db
      .prepare("SELECT zalo_msg_id, cli_msg_id, sender_id, msg_type, direction FROM message WHERE event_id = ?")
      .get(eventId) as
      | { zalo_msg_id: string; cli_msg_id: string | null; sender_id: string | null; msg_type: string | null; direction: MessageDirection }
      | undefined;
    if (!row || row.direction !== "inbound") return null; // only mark the peer's messages seen
    return { zaloMsgId: row.zalo_msg_id, cliMsgId: row.cli_msg_id, senderId: row.sender_id, msgType: row.msg_type };
  }

  /** Matrix event for a Zalo msgId + who bridged it (inbound reaction → annotate). */
  getEventByZaloMsgId(zaloMsgId: string): { eventId: string | null; roomId: string } | null {
    const row = this.db.prepare("SELECT event_id, room_id FROM message WHERE zalo_msg_id = ?").get(zaloMsgId) as
      | { event_id: string | null; room_id: string }
      | undefined;
    return row ? { eventId: row.event_id, roomId: row.room_id } : null;
  }

  hasMessage(zaloMsgId: string): boolean {
    return this.db.prepare("SELECT 1 FROM message WHERE zalo_msg_id = ?").get(zaloMsgId) !== undefined;
  }

  close(): void {
    this.db.close();
  }
}
