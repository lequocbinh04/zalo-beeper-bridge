# Importer CLI

`src/tools/import-zalo-export.ts` runs next to the live bridge with the same config, registration and `bridge.db`. It only sets up the appservice intents: it never listens to Zalo and makes no Zalo API calls, so the live bridge and `bbctl proxy` are not affected. Names come from the export.

Run it inside the container from `/data`:

```bash
podman exec -u node -w /data zalo-beeper-bridge \
  node /app/src/tools/import-zalo-export.ts <exportDir> [options]
```

`<exportDir>` holds one `<chat key>.ndjson` file per chat, as written by `scripts/zalo-pc/export-cdp.mjs`.

## Options

| Option                       | Meaning                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--only k1,k2`               | Limit to these chat keys. Required for `--rebuild`.                                                                                    |
| `--dry-run [--probe]`        | Print per-chat counts by kind. `--probe` also tries every download (no upload).                                                        |
| `--rebuild`                  | Build a new room per chat with the full ordered history, carry over live-only messages, then point the chat at it.                     |
| `--remove-old`               | With `--rebuild`: verify the new room, then delete the room it replaces.                                                               |
| `--carry-from !r1,!r2`       | With `--rebuild`: also keep live-only messages from these earlier rooms of the chat.                                                   |
| `--verify`                   | Read-only check: every exported message is mapped to the chat's room, and every mapped message is a real event in its Beeper timeline. |
| `--retire !old1,!old2`       | Verify exactly one `--only` chat, then delete these superseded rooms.                                                                  |
| `--media-dir DIR`            | Backup media prepared by `backup-media.mjs`.                                                                                           |
| `--own-uid UID`              | Your Zalo uid, so mentions of you become pills for your account.                                                                       |
| `--batch N` / `--delay-ms N` | Batch size (default `100`) and pause between batches (default `1500` ms).                                                              |
| `--media-days N`             | Try expiring CDN links only for messages younger than N days (default `16`).                                                           |

## Modes

**Prepend (default).** Without `--rebuild`, the importer only adds history older than the room's first bridged message, newest chunk first, so live messages stay at the bottom. Beeper's batch-send API can insert only before the oldest or after the newest event, never in the middle.

**Rebuild.** Use `--rebuild` whenever messages are missing between ones already in Beeper. The new room gets the full history oldest-first. Messages the live bridge posted that the export lacks (Zalo PC missed them, or they arrived during the run) are replayed from the old room's events in timeline order. The old room stays untouched until `--remove-old` (or a later `--retire`) has verified the new one.

## Examples

```bash
# What would be imported for two chats, and can their media still be downloaded?
… import-zalo-export.ts /data/import-export --only g1111111111,2222222222 --dry-run --probe

# Rebuild one group with backup media and delete the old room after verification
… import-zalo-export.ts /data/import-export --only g1111111111 --rebuild --remove-old \
    --media-dir /data/import-media --own-uid 1111111111111111111

# Check an imported chat
… import-zalo-export.ts /data/import-export --only g1111111111 --verify
```

Its log lines start with `[import]` (and `[retire]` when rooms are deleted). See [Logs](../reference/logs).
