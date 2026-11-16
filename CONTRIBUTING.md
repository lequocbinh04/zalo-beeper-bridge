# Contributing

Thanks for helping! Bug reports, fixes, new Zalo message types and docs are all welcome.
Please read [the code of conduct](CODE_OF_CONDUCT.md) first, and report security problems
privately as described in [SECURITY.md](SECURITY.md).

This repository is a fork of
[lequocbinh04/zalo-beeper-bridge](https://github.com/lequocbinh04/zalo-beeper-bridge). Issues
and pull requests for this fork go to
[lethucthanhtu/zalo-beeper-bridge](https://github.com/lethucthanhtu/zalo-beeper-bridge).

## Privacy first

The bridge carries people's private chats, so contributions must never contain real data:

- No real message text, names, phone numbers, Zalo/Matrix ids, room ids, coordinates, avatar
  or media links in code, tests, fixtures, docs, issues or PRs. Anonymize fixtures
  (`1111111111111111111`, `Nguyễn Văn A`, `0900000000`, a public landmark for locations).
- Never commit or paste `config.yaml`, `registration.yaml`, `container-config/`,
  `bbctl-config.json`, `zalo-creds*`, `bridge.db` — they hold tokens and your Zalo session.
- Logs must carry ids, hosts and field **names** only, never content or signed media URLs. For
  an unknown Zalo payload, log its keys (see `[bridge] unsupported Zalo msgType …`).

## Development setup

Requirements: Node.js 22.18+ (TypeScript runs natively, no build step), npm, and for live
testing a Beeper account, `bbctl` and a Zalo account you can afford to risk (see the warning
in the README).

```bash
npm ci
npm run typecheck   # tsc, strict
npm run lint        # eslint, type-aware
npm test            # vitest
npm run format      # prettier --write .
```

All four must pass before a PR; CI runs the same commands. For a live test, run the bridge in
a container (`docs/deployment/container.md`) or with `npm run dev` plus `bbctl proxy`.

On Windows, regenerate `package-lock.json` in a Linux container after changing dependencies
(`npm install` on Windows drops Linux-only optional entries and the image build fails):

```bash
podman run --rm -v "$PWD:/w" -w /w docker.io/library/node:24-bookworm-slim npm install --package-lock-only --ignore-scripts
```

## Where things live

| Path                             | What                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/zalo/`                      | Everything that touches zca-js. `zalo-client.ts` is the only module that imports zca-js at runtime; `event-normalizer.ts` turns raw payloads into `ZaloMessage` |
| `src/bridge/`                    | Portals, ghosts, SQLite mapping store, inbound (Zalo → Matrix) and outbound (Matrix → Zalo) handlers, media, sync and catch-up                                  |
| `src/matrix/`                    | Appservice wiring, network branding, Beeper account state, bot commands                                                                                         |
| `src/tools/`, `scripts/zalo-pc/` | History importer and the desktop export/backup tools                                                                                                            |
| `docs/`                          | The documentation site (VitePress): guides, deployment, history import, reference, troubleshooting                                                              |

New Zalo message types usually need only a case in `normalizeContent`
(`src/zalo/event-normalizer.ts`) and a test with an anonymized fixture.

## Conventions

- **Smallest complete change.** Reuse existing helpers and library features before writing new
  code; no speculative options or abstractions.
- **Tests:** new logic (a branch, a parser, a loop) comes with a focused vitest test. Mock the
  Zalo/Matrix side; never call real services in tests.
- **Style:** Prettier formats, ESLint checks. Object shapes are `type` aliases, not
  `interface`. Report caught errors with `errorMessage(err)` (`src/error-message.ts`).
  Comments explain _why_, in English.
- **Account safety:** Zalo rate-limits and may lock accounts. Pace bulk requests (see
  `PROFILE_REPAIR_PACE`, `SyncManager`), never parallelize lookups, and keep outbound sends
  behind the rate limiter.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `refactor:`, `chore:`, `deps:`), imperative mood, a body that says why.
- **Changelog:** add a line under `[Unreleased]` in `CHANGELOG.md` for anything a user notices.
- **Docs:** update README / `docs/` in the same PR when behaviour, config or commands change.

## Pull requests

1. Fork, branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep the PR focused; explain what changed, why, and how you tested it (unit and, if
   possible, live — say which message types you tried).
3. Fill in the PR template checklist.

Database changes need a migration in `MappingStore.migrate()` and a note on rollback: an
additive migration lets older code keep running; a non-additive one needs a backup restore
(see "Rollback" in `docs/deployment/operations.md`).

## Releases

Maintainers move the `[Unreleased]` entries into a new version section of `CHANGELOG.md`,
bump `version` in `package.json` (SemVer: a schema change or a breaking config change is a
major or minor bump, never a patch) and tag `vX.Y.Z`.
