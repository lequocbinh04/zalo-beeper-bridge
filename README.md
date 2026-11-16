# zalo-beeper-bridge

**English** | [Tiếng Việt](README.vi.md)

[![CI](https://github.com/lethucthanhtu/zalo-beeper-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lethucthanhtu/zalo-beeper-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A self-hosted [Matrix](https://matrix.org/) application service that bridges a personal **Zalo** account into **[Beeper](https://www.beeper.com/)**. It is written in Node.js and TypeScript and built on [zca-js](https://github.com/RFS-ADRENO/zca-js) (an unofficial Zalo Web API) and [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge). It connects to Beeper through [bbctl](https://github.com/beeper/bridge-manager).

It also ships a **history importer** that moves your full Zalo history from Zalo PC (and its encrypted `.zl.zip` backup) into Beeper, with the original timestamps, real media, replies and mentions.

> [!WARNING]
> **Unofficial, use at your own risk.** zca-js talks to Zalo Web by reverse engineering. That is against Zalo's terms of service and **can get your account locked or banned**. Zalo has no official API for personal messaging. If you are not willing to risk your main account, use a secondary one. This is an enthusiast tool, not a supported product.

## Documentation

The full documentation is in [`docs/`](docs/index.md):

| Topic                                                                                                                    | What you find there                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [Getting started](docs/guide/getting-started.md)                                                                         | Install `bbctl`, register, configure, run and log in to Zalo |
| [Features](docs/guide/features.md)                                                                                       | Everything bridged in each direction, and what is not        |
| [Configuration](docs/guide/configuration.md)                                                                             | Every `config.yaml` option                                   |
| [Bot commands](docs/guide/bot-commands.md)                                                                               | `login`, `status`, `sync`, `accounts` and the rest           |
| [Container deployment](docs/deployment/container.md)                                                                     | Docker or Podman, the recommended way to run it 24/7         |
| [macOS (launchd)](docs/deployment/macos-launchd.md)                                                                      | Running it as launchd agents                                 |
| [Operations](docs/deployment/operations.md)                                                                              | Health, logs, upgrades, backups and rollback                 |
| [History import](docs/history-import/index.md)                                                                           | Bringing old Zalo history into Beeper                        |
| [Multiple accounts](docs/guide/multiple-accounts.md)                                                                     | A second Zalo account as a second bridge                     |
| [Troubleshooting](docs/troubleshooting.md) · [FAQ](docs/faq.md)                                                          | Common problems and questions                                |
| [Security & privacy](docs/security.md)                                                                                   | Account risk, secrets on disk and what leaves your machine   |
| [Architecture](docs/reference/architecture.md) · [Database](docs/reference/database.md) · [Logs](docs/reference/logs.md) | How it is built                                              |
| [Development](docs/contributing/development.md)                                                                          | Working on the code                                          |

The docs are a [VitePress](https://vitepress.dev/) site: `npm run docs:dev` previews it locally.

## Features

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

The bridge also does the following:

- Gives every Zalo contact a ghost user with their real name and avatar.
- Creates a room automatically for each chat on its first message.
- Has a `sync` command that creates rooms for pinned chats and every group.
- Catches up on missed messages after every reconnect.
- Shows the network in Beeper as "Zalo", with its logo.
- Rate-limits outbound messages.
- Stores the Zalo session encrypted.

**Not implemented:** syncing Zalo recalls and edits to Beeper, bridging end-to-end encrypted chats, and live backfill from Zalo's servers (Zalo Web serves nothing from before the login, so use the history importer). See [Features](docs/guide/features.md) for the details.

## Quick start (container)

Requirements: Docker or Podman, a Beeper account and [bbctl](https://github.com/beeper/bridge-manager). The [getting started guide](docs/guide/getting-started.md) has the full steps and the non-container setup (Node.js 22.18+).

```bash
git clone https://github.com/lethucthanhtu/zalo-beeper-bridge.git
cd zalo-beeper-bridge

bbctl login
bbctl register -o registration.yaml sh-zalo     # then set url: http://localhost:29350 in it
cp config.yaml.example config.yaml              # fill in the values bbctl printed

mkdir container-config && cp config.yaml registration.yaml container-config/
cp ~/.config/bbctl/config.json container-config/bbctl-config.json
podman compose up -d --build                    # or: docker compose up -d --build
```

In Beeper, open a chat with `@sh-zalobot:beeper.local`, send `login` and scan the QR code with the Zalo app on your phone. Then send `sync` to create rooms for your pinned chats and groups.

> [!IMPORTANT]
> Zalo allows only one web session. Do not open Zalo Web in a browser while the bridge runs, or the two keep disconnecting each other. The phone app and Zalo PC are fine to use.

## Importing Zalo history

Zalo Web gives the bridge nothing from before the login. The importer reads your history from Zalo PC instead, and optionally the media from a Zalo PC backup. It then rebuilds each chat in Beeper with the original timestamps and verifies the result before it deletes the old room. With the bridge container running:

```powershell
# Windows (PowerShell 7 + Git for Windows)
pwsh scripts/zalo-pc/import.ps1
```

```bash
# macOS (Zalo PC installed in /Applications)
scripts/zalo-pc/import.sh
```

See [History import](docs/history-import/index.md) for what gets imported, the manual steps and the importer CLI.

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm test
```

See [Development](docs/contributing/development.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), which covers setup, conventions and the privacy rules for fixtures and logs, and the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately as described in [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Acknowledgements

- [lequocbinh04/zalo-beeper-bridge](https://github.com/lequocbinh04/zalo-beeper-bridge): the original project this repository is forked from
- [zca-js](https://github.com/RFS-ADRENO/zca-js): the unofficial Zalo Web API this bridge is built on
- [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge)
- [Beeper Bridge Manager](https://github.com/beeper/bridge-manager)
- [jSquash](https://github.com/jamsinclair/jSquash) (JPEG XL / JPEG codecs) and [wasm-webp](https://github.com/nieyuyao/webp-wasm) (animated WebP)
- Patterns studied from the [mautrix](https://github.com/mautrix) bridge family

## License

MIT, see [LICENSE](./LICENSE). Not affiliated with Zalo/VNG or Beeper.
