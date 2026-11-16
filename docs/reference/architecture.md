# Architecture

The bridge is a single Node.js process written in TypeScript (run directly by Node 22.18+, no build step). It is a Matrix **application service**: Beeper's server sends it the events of its rooms, and it acts in Matrix as a bot, as one ghost per Zalo contact, and as you.

```
Zalo servers                              Zalo PC (+ .zl.zip backup)
   │  zca-js: QR login, listener             │  CDP export / backup tools (scripts/zalo-pc)
   ▼                                         ▼
src/zalo/*        normalized events      src/tools/import-zalo-export.ts   history importer
   ▼                                         │  src/bridge/history-import.ts  export row → event
src/bridge/*      portals, ghosts, SQLite mapping store, echo suppression,
                  inbound/outbound, presence, media-content (shared rendering),
                  animated-sticker, mentions, sync
   ▼
src/matrix/*      matrix-appservice-bridge (Bridge + Intents), network branding, bot commands
   ▼
bbctl proxy  ──►  Beeper Matrix server  ──►  Beeper clients
```

`bbctl proxy` holds the websocket to Beeper and forwards appservice traffic to the bridge's local HTTP port, so the bridge needs no public address.

## Layers

### `src/zalo/`: the Zalo side

[zca-js](https://github.com/RFS-ADRENO/zca-js) speaks Zalo Web's protocol. Only `zalo-client.ts` imports it, so a zca-js upgrade or replacement touches one file.

| Module                | Role                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `zalo-client.ts`      | Facade over zca-js: login lifecycle, listener, normalization, rate-limited sends                 |
| `listener-manager.ts` | Reconnects the listener with exponential backoff; escalates to "dead" when the session has ended |
| `frame-tap.ts`        | Websocket frame tap; reroutes Zalo's newer E2EE DM pushes (cmd 551) to the DM handler            |
| `event-normalizer.ts` | Raw zca-js payload → `ZaloMessage`. All payload quirks live here                                 |
| `types.ts`            | The normalized event model, the only shapes the bridge layer sees                                |
| `credential-store.ts` | Saves the session encrypted with AES-256-GCM; the key sits in a separate `0600` file             |
| `rate-limiter.ts`     | Token bucket for outbound sends: bursts go through, sustained sending is paced                   |
| `reaction-map.ts`     | Unicode emoji ↔ Zalo reaction codes                                                              |
| `call-message.ts`     | Renders call log bubbles                                                                         |

### `src/bridge/`: the translation

| Module                | Role                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `inbound-handler.ts`  | Zalo message → dedup → ghost → portal → Matrix event. One promise chain per chat keeps the order                    |
| `outbound-handler.ts` | Your Beeper events → Zalo: text, replies, edits, media, reactions, recalls                                          |
| `presence-handler.ts` | Seen, typing and reactions in both directions                                                                       |
| `portal-manager.ts`   | Creates one Matrix room per Zalo chat on first message; creation is serialized per chat                             |
| `puppet-registry.ts`  | Zalo uid → ghost `@sh-zalo_<uid>`, with name and avatar sync                                                        |
| `mapping-store.ts`    | SQLite store, see [Database schema](./database)                                                                     |
| `echo-suppressor.ts`  | Recognizes the echo of your own sends so they are not posted twice                                                  |
| `media-handler.ts`    | Guarded downloads from the Zalo CDN; authenticated downloads of Matrix media for outbound sends                     |
| `media-content.ts`    | Builds `m.image` / `m.video` / `m.file` / `m.audio` / `m.sticker` and link previews, for live and imported messages |
| `animated-sticker.ts` | Encodes classic Zalo stickers from their sprite strip into an animated WebP                                         |
| `audio-remux.ts`      | Wraps Zalo's raw ADTS AAC voice notes in a container every player understands                                       |
| `mentions.ts`         | @mentions both ways (Zalo uid + position ↔ Matrix pills)                                                            |
| `sync-manager.ts`     | The `sync` command and the catch-up after every reconnect                                                           |
| `owner-intent.ts`     | Acts as you (double-puppeting)                                                                                      |
| `history-import.ts`   | Zalo PC export row → Matrix content, for the importer                                                               |

### `src/matrix/`: the Beeper side

| Module                   | Role                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `appservice.ts`          | `matrix-appservice-bridge` setup and event routing                      |
| `bot-commands.ts`        | The [bot commands](../guide/bot-commands), accepted from the owner only |
| `beeper-bridge-state.ts` | Publishes the remote-account state Beeper needs to show the network     |
| `network-branding.ts`    | Network name "Zalo" and logo on the bot and every portal                |

### Other

- `src/index.ts`: entry point, wires everything together.
- `src/config.ts`: loads and validates `config.yaml` with Zod (see [Configuration](../guide/configuration)).
- `src/tools/import-zalo-export.ts`: the [history importer](../history-import/importer-cli).
- `scripts/zalo-pc/`: host-side tools that read Zalo PC and its backups.

## Start-up

1. Load and validate the config and registration. Missing values stop the process with a clear message.
2. Open the database and run [migrations](./database#migrations).
3. Start the appservice. It must listen **before** the Zalo listener starts, because Zalo replays recent messages right after connecting.
4. Set the bot's network identity, add branding to older portals, remove malformed portals and join you into portals left at "invite".
5. Log in to Zalo with the saved session. Without one, the bridge waits for the `login` command.
6. Start the listener. On every (re)connect the bridge publishes the account state, runs the catch-up and, once per process, repairs ghosts without a name or avatar.

## Message flow

**Zalo → Beeper.** The listener delivers a raw message; `event-normalizer` turns it into a `ZaloMessage`. `inbound-handler` drops duplicates (by Zalo message id), finds or creates the ghost and the portal, renders the content, sends it as the ghost, and stores the mapping. Messages you sent from the Zalo app are posted as **you**, so they appear on your side of the chat.

**Beeper → Zalo.** Events in a portal room go to `outbound-handler`; events in other rooms go to the bot commands. The handler ignores events the bridge posted itself, sends to Zalo through the rate limiter, and stores the mapping. When Zalo echoes the message back to the listener, `echo-suppressor` matches it (by message id, with a content fallback) and drops it.

## Design notes

- **Mapping store.** Every bridged message is keyed by its Zalo message id. The client message id, quote data, direction and sender are stored as well, because Zalo needs them for reactions, recalls and read receipts.
- **Account state.** Beeper lists a bridge's chats only while its remote-account state is published. The bridge posts it on every listener change (`CONNECTED`, `TRANSIENT_DISCONNECT`, `BAD_CREDENTIALS`, `LOGGED_OUT`) and again every minute, because a `bbctl proxy` reconnect can wipe it. `bbctl whoami --raw` shows it under `remoteState`.
- **Network branding.** The bot profile (`com.beeper.bridge.*`) and each portal's `m.bridge` / `uk.half-shot.bridge` state (keyed `<domain>/<registration id>`, with `com.beeper.room_type.v2` and `fi.mau.receiver`) make Beeper file the chats under a network called "Zalo". The small badge on chat avatars stays generic: Beeper draws it only for bridge types it knows, and self-hosted bridges register as the generic `bridgev2`.
- **Provisioning probe.** On each proxy connect Beeper asks for `/_matrix/provision/v3/capabilities`. The bridge answers that it offers no start-chat or group-creation features. Other paths are logged as `[appservice] unhandled …`.
- **Double-puppeting.** On Beeper's single-tenant server the appservice token may act as the owner, which is how your own Zalo messages and reactions appear as yours.
- **Multi-account groundwork.** Since schema v7 every portal and message records the Zalo account it belongs to, and portals carry it as `fi.mau.receiver`. One bridge still serves one account at a time (see [Multiple accounts](../guide/multiple-accounts)).
- **Privacy in logs.** Logs carry ids and counts, never message content (see [Logs](./logs)).
