# Features

## Support matrix

| Area                               |                       Zalo → Beeper                        |               Beeper → Zalo                |
| ---------------------------------- | :--------------------------------------------------------: | :----------------------------------------: |
| Text (DM + group)                  |                    ✅ (incl. rich text)                    |                     ✅                     |
| @mentions                          |                         ✅ (pills)                         |                     ✅                     |
| Replies / quotes                   |                             ✅                             |                     ✅                     |
| Photos                             |                             ✅                             |                     ✅                     |
| Stickers                           |  ✅ animated (`m.sticker`, WebP built from Zalo's sprite)  |                     —                      |
| GIFs                               |                             ✅                             |                     —                      |
| Videos                             |                       ✅ (`m.video`)                       |                     ✅                     |
| Files                              |                       ✅ (`m.file`)                        |                     ✅                     |
| Voice messages                     |                 ✅ (`m.audio` voice note)                  | ✅ voice note (ogg/opus re-encoded to AAC) |
| Link cards                         |               ✅ text + Beeper link preview                |      ✅ Zalo builds its own link card      |
| Locations                          | ✅ `m.location` (map preview, opens the device's maps app) |                     —                      |
| Contact cards (danh thiếp)         |       ✅ QR code + name, phone and a `zalo.me` link        |                     —                      |
| Web cards (`chat.webcontent`)      |               ✅ text (title + description)                |                     —                      |
| Reactions                          |                             ✅                             |                     ✅                     |
| Message recall                     |                             —                              |                     ✅                     |
| Deleted "for me" on another device |                  ✅ removed in Beeper too                  |                     —                      |
| Read receipts                      |                             ✅                             |   ✅ (follows Beeper's receipt setting)    |
| Typing indicators                  |                             ✅                             |    ✅ (follows Beeper's typing setting)    |
| Own messages sent from the phone   |                    ✅ (double-puppeted)                    |                    n/a                     |
| End-to-end encrypted Zalo chats    |             notice only (cannot be decrypted)              |                     —                      |

Also included:

- Ghost users with real Zalo names and avatars, refreshed in the background.
- Portal rooms created automatically on the first message of a chat.
- The [`sync`](./bot-commands#sync) command for pinned chats and groups.
- Zalo network branding (name and logo) in Beeper.
- Automatic listener reconnect and catch-up of missed messages. See [How it works](./how-it-works).
- Outbound rate limiting to protect the account. See [Configuration](./configuration#zalo).
- Encrypted credential storage. See [Security](../security).
- The [history importer](../history-import/).

## Details

### Photos and captions

Photos without a caption show no caption in either direction; the file name is never used as one. A photo from Beeper iOS (which sends no `filename`) goes to Zalo without a caption. Photos larger than [`bridge.mediaMaxBytes`](./configuration#bridge) are not bridged.

### Videos, files and voice

Videos and files up to 100 MB are bridged. Zalo voice notes arrive as playable M4A voice notes: the bridge repackages Zalo's raw AAC stream without re-encoding. In the other direction, AAC voice notes (Beeper iOS) are sent as they are and ogg/opus (Beeper Android) is re-encoded to AAC with `ffmpeg`.

Zalo's CDN links for photos, videos, files and voice expire about 14 days after sending. The bridge downloads media only from Zalo's CDN hosts, over HTTPS, and checks every redirect. When a download fails, the room gets a notice with the Zalo link instead.

### Links

A Beeper message that contains a link (and no reply or mention) is sent with Zalo's link API, so Zalo shows its own preview card. If Zalo cannot parse the link, it goes out as plain text. A Zalo link message shows in Beeper as the text the sender typed, with the title, description and thumbnail Zalo resolved as the Beeper link preview.

### Rich text

Bold, colours and other formatting from Zalo arrive as plain text with their mentions; the styling is dropped.

### Typing and read receipts

They are sent to Zalo exactly when Beeper sends them. If you turn off typing notifications or read receipts in Beeper's settings, nothing is mirrored: Beeper then sends no typing events and only private receipts, which the bridge ignores.

### Contact cards

A Zalo contact card shows the contact's QR code with name and phone. The `zalo.me/<phone>` link opens the Zalo app on a phone. When the contact hides the number there is no link; scan the QR code instead.

### Recall

Only messages you sent from Beeper can be recalled on Zalo, and only within Zalo's recall window. Zalo lets you recall only your own messages.

### Unknown message types

A Zalo message type the bridge does not know shows as `[Zalo message type not supported by bridge: <type>]`. The log records the payload's field **names** (never values) so the type can be added. See [Troubleshooting](../troubleshooting#unknown-zalo-message-type).

## Not implemented

- Recall and edit sync from Zalo to Beeper.
- End-to-end encrypted Zalo chats (they cannot be decrypted).
- Live backfill of history from Zalo's servers. Zalo Web serves nothing from before the login. Use the [history importer](../history-import/).
- Several Zalo accounts on one bridge. Run one bridge per account; see [Multiple accounts](./multiple-accounts).
