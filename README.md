# zalo-beeper-bridge

A self-hosted [Matrix](https://matrix.org/) application service that bridges a personal **Zalo** account into **[Beeper](https://www.beeper.com/)** (or any Matrix homeserver). Built on Node.js + TypeScript, [`zca-js`](https://github.com/RFS-ADRENO/zca-js) (unofficial Zalo Web API) and [`matrix-appservice-bridge`](https://github.com/matrix-org/matrix-appservice-bridge), connected to Beeper through [`bbctl`](https://github.com/beeper/bridge-manager).

> **⚠️ Unofficial & at your own risk.** `zca-js` talks to Zalo Web by reverse engineering, which violates Zalo's ToS and **can get your account locked or banned**. There is no official personal-messaging API for Zalo. Use a dedicated/secondary account if you are not willing to risk your main one. This project is an enthusiast tool, not a supported product.

## Features

| Area | Zalo → Beeper | Beeper → Zalo |
|------|:---:|:---:|
| Text (DM + group) | ✅ | ✅ |
| Photos | ✅ | ✅ |
| Stickers | ✅ (native `m.sticker`) | — |
| Reactions | ✅ | ✅ |
| Replies / quotes | ✅ | ✅ |
| Message recall | — | ✅ |
| Read receipts | ✅ | ✅ |
| Typing indicators | ✅ | ✅ |
| Own messages sent from the phone | ✅ (double-puppeted) | n/a |

Plus: ghost users with real names + avatars, portal rooms auto-created on first message, a `sync` command to backfill pinned conversations and groups, Zalo network branding (name + logo), listener auto-reconnect with ban-suspicion pause, conservative outbound rate limiting, and encrypted credential storage at rest.

**Not implemented:** voice/video/file outbound, Zalo→Beeper recall & edit sync, historical backfill with original timestamps, E2EE bridging.

## Requirements

- macOS or Linux (Windows via WSL)
- Node.js 22+ (uses native TypeScript execution — no build step)
- A Beeper account and [`bbctl`](https://github.com/beeper/bridge-manager)
- `ffmpeg` and Python 3 (bbctl prerequisites)
- A Zalo account you can log in to by scanning a QR code

## Setup

### 1. Install and register with Beeper

```bash
# Install bbctl (macOS arm64 shown; see releases for your platform)
curl -sL -o ~/.local/bin/bbctl \
  https://github.com/beeper/bridge-manager/releases/latest/download/bbctl-macos-arm64
chmod +x ~/.local/bin/bbctl

bbctl login                              # log in to your Beeper account
bbctl register -o registration.yaml sh-zalo
```

Edit the generated `registration.yaml` and set the `url` field to the local port the bridge listens on:

```yaml
url: http://localhost:29350
```

### 2. Configure the bridge

```bash
npm install
cp config.yaml.example config.yaml
```

Fill in `config.yaml` with the values printed by `bbctl register` (homeserver URL, domain, your Beeper Matrix ID):

```yaml
matrix:
  homeserverUrl: https://matrix.beeper.com/_hungryserv/<your-beeper-username>
  domain: beeper.local
  registrationPath: registration.yaml
  port: 29350
  owner: "@<your-beeper-username>:beeper.com"
zalo:
  credsPath: zalo-creds.session.json     # encrypted at rest; never commit
  messagesPerMinute: 8                    # conservative pacing to protect the account
bridge:
  dbPath: bridge.db
  mediaMaxBytes: 10485760
logging:
  level: info
```

### 3. Run

Run the bridge and the bbctl proxy side by side (two terminals, or a process manager):

```bash
npm run dev                               # the appservice on localhost:29350
bbctl proxy -r registration.yaml          # proxies Beeper <-> the bridge over a websocket
```

### 4. Log in to Zalo

In Beeper, open a chat with the bridge bot `@sh-zalobot:beeper.local` and send:

```
login
```

Scan the QR image it posts with the Zalo app on your phone and confirm. Once you see the listener connect, message the account from another Zalo user and the chat appears in Beeper.

> **Single-listener constraint:** Zalo Web allows only one active session. If you open Zalo Web in a browser while the bridge runs, the bridge listener is kicked. Use the phone app alongside the bridge, not Zalo Web.

## Bot commands

Send these to the bridge bot in its management chat (owner only):

| Command | Action |
|---------|--------|
| `ping` | health check (`pong` + uptime) |
| `login` | start QR login to Zalo |
| `logout` | log out and clear saved credentials |
| `status` | login state, listener state, uptime |
| `sync` | pre-create portals for pinned conversations + top groups and backfill recent group history |

## Architecture

```
Zalo servers
   │  (zca-js: QR login, cookie persistence, WebSocket listener)
   ▼
src/zalo/*        normalized events, reconnect/backoff, rate limiting, reaction map
   ▼
src/bridge/*      portal rooms, ghost users, SQLite mapping store, echo suppression,
                  inbound/outbound handlers, presence, media, sync
   ▼
src/matrix/*      matrix-appservice-bridge (Bridge + Intents), network branding, bot commands
   ▼
bbctl proxy  ──►  Beeper Matrix server  ──►  Beeper clients
```

- **Mapping store** (`better-sqlite3`): portals, puppets, and message dedup keyed by Zalo `msgId`, with `cliMsgId` / quote / direction for reactions, recall and receipts.
- **Echo suppression:** outbound sends are matched against their own `selfListen` echo (by `msgId`, with a content/URL fallback) so the bridge never re-posts what you just sent.
- **Double-puppeting:** on Beeper's single-tenant hungryserv the appservice token can act as the owner, so messages you send from the Zalo phone app appear in Beeper on the right-hand side.

## Development

```bash
npm run typecheck     # tsc, strict, no emit
npm run lint          # eslint (flat config)
npm test              # vitest
```

Source lives under `src/` (ESM TypeScript run directly by Node 22+). All `zca-js` runtime usage is confined to `src/zalo/zalo-client.ts` so upstream breakage is contained to one module.

## Security & privacy

- Zalo session credentials are stored **AES-256-GCM encrypted** at rest (`src/zalo/credential-store.ts`), with the key in a sibling `0600` file. Never commit `zalo-creds.*`, `config.yaml`, `registration.yaml`, or `bridge.db` — they are gitignored.
- The bridge runs entirely on your machine; message content is only ever sent to Beeper (your homeserver) and Zalo.
- Outbound traffic is rate-limited and the listener pauses on ban-suspicion signals to reduce risk to the account.

## Acknowledgements

- [zca-js](https://github.com/RFS-ADRENO/zca-js) — the unofficial Zalo Web API this bridge is built on
- [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge)
- [Beeper Bridge Manager](https://github.com/beeper/bridge-manager)
- Patterns studied from the [mautrix](https://github.com/mautrix) bridge family

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with Zalo/VNG or Beeper.
