# Development

This page covers working on the code. For the contribution rules (privacy, conventions, pull requests and releases) read [CONTRIBUTING.md](https://github.com/lethucthanhtu/zalo-beeper-bridge/blob/main/CONTRIBUTING.md).

## Setup

Requirements: Node.js 22.18 or newer, which runs TypeScript directly without a build step, and npm.

```bash
git clone https://github.com/lethucthanhtu/zalo-beeper-bridge.git
cd zalo-beeper-bridge
npm ci
```

## Checks

```bash
npm run typecheck   # tsc strict (+ noUncheckedIndexedAccess, noUnused*, noImplicitReturns/Override), no emit
npm run lint        # ESLint flat config, type-aware: no floating or misused promises
npm test            # vitest
npm run format      # prettier --write .
```

CI runs the same commands, and all of them must pass before a pull request is merged. Tests mock the Zalo and Matrix side and never call real services.

## Running it live

You need a Beeper account, `bbctl` and a Zalo account you can afford to risk. The simplest setup is the [container](../deployment/container): rebuild the image after each change. To run from source instead, follow [Getting started](../guide/getting-started) and start the bridge with `npm run dev` next to `bbctl proxy`.

## Code layout

See [Architecture](../reference/architecture) for each module.

- `src/zalo/`: everything that touches zca-js. Only `zalo-client.ts` imports it at runtime.
- `src/bridge/`: portals, ghosts, the SQLite mapping store, the inbound and outbound handlers, media, sync and catch-up.
- `src/matrix/`: the appservice setup, network branding, the Beeper account state and the bot commands.
- `src/tools/`: the history importer, which runs inside the container.
- `scripts/zalo-pc/`: desktop tools that read Zalo PC and its backups. See [Manual steps](../history-import/manual#tools-in-scripts-zalo-pc).

## Adding a Zalo message type

When Zalo sends a type the bridge does not know, the log shows `[bridge] unsupported Zalo msgType <type> (content keys: …)`, which lists only the field **names**. Add a case to `normalizeContent` in `src/zalo/event-normalizer.ts` and a test with an anonymized fixture. Card-like payloads usually differ by their `action` field (`rtf` rich text, `recommened.link`, `recommened.user`, call actions), so check that first.

Fixtures must never contain real data: use ids like `1111111111111111111`, names like `Nguyễn Văn A`, phone numbers like `0900000000`, and a public landmark for locations.

## Database changes

Add a migration to `MappingStore.migrate()` in `src/bridge/mapping-store.ts` and bump the version. Keep migrations additive (new tables, columns or indexes) so older code still runs on the new database and a rollback needs no restore. See [Database schema](../reference/database#migrations).

## Upgrading zca-js

Changes to Zalo Web can break zca-js. When you bump the pinned version:

1. Run `npm test`. The normalizer fixtures catch payload changes.
2. Run a manual smoke test: send and receive text and an image in a DM and in a group.

All zca-js usage sits in `src/zalo/zalo-client.ts`, so an upgrade or a replacement touches only that file.

## Lockfile on Windows

`npm install` on Windows drops the Linux-only optional entries from `package-lock.json`, and the image's `npm ci` then fails. After a dependency change, regenerate the lockfile in a Linux container:

```bash
podman run --rm -v "$PWD:/w" -w /w docker.io/library/node:24-bookworm-slim npm install --package-lock-only --ignore-scripts
```

In Git Bash, prefix the command with `MSYS_NO_PATHCONV=1` and use `$(pwd -W)` in place of `$PWD`.

## Documentation

This site is built with [VitePress](https://vitepress.dev/) from `docs/`:

```bash
npm run docs:dev       # live preview at http://localhost:5173
npm run docs:build     # static site in docs/.vitepress/dist; fails on dead links
npm run docs:preview   # serve the built site
```

Update the docs in the same pull request whenever behaviour, configuration or commands change.
