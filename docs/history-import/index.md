# History import

Zalo Web, and therefore the live bridge, cannot fetch messages from before the session started. The history importer fills Beeper from **Zalo PC's local message store** instead, optionally adding media from a **Zalo PC backup** (`.zl.zip`).

Each chat is rebuilt as a new Beeper room with its complete history in order and original timestamps. The bridge is then pointed at the new room, and the old room is deleted only after the new one has been verified.

- **[Quick start](./quick-start)**: one script that does everything, with a chat picker.
- **[Manual steps](./manual)**: what the script automates, step by step, including backup media.
- **[Importer CLI](./importer-cli)**: every option of the importer itself.

## What gets imported, and how it looks

Imported messages are rendered exactly like live ones; both use `src/bridge/media-content.ts`.

| Zalo message                                          | In Beeper                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Text, rich text                                       | `m.text`, @mentions as pills, Zalo quotes as real Matrix replies     |
| Photo                                                 | `m.image` (JPEG XL photos are converted to JPEG)                     |
| Sticker                                               | animated WebP `m.sticker` (still PNG for single-frame stickers)      |
| GIF                                                   | `m.image` `image/gif`                                                |
| Video / file / voice                                  | `m.video` / `m.file` / `m.audio` voice note                          |
| Link card                                             | text + `com.beeper.linkpreviews` (title, description, thumbnail)     |
| Location, call log, system rows (pins, joins, polls…) | readable text or notice                                              |
| Media whose bytes no longer exist anywhere            | a text line, e.g. `📷 [Ảnh 1920×1080 — không còn trên máy chủ Zalo]` |

## Where media comes from

In order: the backup copy (if you prepared one), then the Zalo CDN.

**Zalo CDN links for photos, videos, files and voice expire about 14 days after sending.** Zalo Cloud (`zpcloud`/`zfcloud`), GIF and sticker hosts are permanent. Old media therefore survives only through a backup, which holds the media Zalo PC had downloaded.

## Other behaviour

- **Duplicates removed.** Zalo PC keeps a second local row (`msgId_NNN`, same `cliMsgId` and type) for some of your own messages. Those shadow copies are dropped. `_NNN` rows without a real twin are kept, because they are the only copy.
- **Nothing live is lost.** Messages the live bridge delivered that Zalo PC never stored, or that arrive while a chat is being rebuilt, are replayed from the old room's Matrix events at their original position before the switch.
- **Silent.** Imported messages are sent with `send_notification: false`, marked read for you, and tagged so the live bridge never sends them back to Zalo.
- **Mappings kept.** Replies, reactions, recall and read receipts keep working on imported messages. A re-run skips messages that were already imported.

## Limits

- Only what Zalo PC holds locally can be imported. The more history Zalo PC has, the more ends up in Beeper.
- The backup's message database adds no extra history if Zalo PC is the machine that made the backup: it holds the same rows.
- Beeper's batch-send API can only insert before the oldest or after the newest event of a room, never in the middle. That is why the scripts rebuild each chat as a new room.

## Privacy

While the debug port is open, any local program can read your messages through it. Extracted backups and prepared media contain your full history in clear text. See [Security](../security#history-import) for what to delete afterwards.
