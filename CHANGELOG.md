# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Dates are UTC+7.

This repository is a fork of
[lequocbinh04/zalo-beeper-bridge](https://github.com/lequocbinh04/zalo-beeper-bridge);
1.0.0 is the upstream state the fork started from.

## [Unreleased]

### Added

- A documentation site in `docs/` (VitePress): guides, deployment, history import,
  troubleshooting, FAQ, security and reference pages. Preview it with `npm run docs:dev`.
  The README now has a Vietnamese version (`README.vi.md`).
- "Delete for me" on another device (`chat.delete`) removes the message in Beeper too. The
  bridge redacts it as the room's creator, never as you, so it is never turned into a recall
  for everyone on Zalo.
- After every reconnect (container start, PC wake, network drop) the bridge fetches everything
  newer than the last message it bridged (up to ~500 per DMs and groups), so messages and calls
  that arrived while it was away are no longer lost. The old catch-up asked Zalo for a feed
  that runs forward from about a week ago, so it never reached recent messages.
- Rich-text messages (bold, colours, or many @mentions) bridge as text instead of "not
  supported".
- Links sent from Beeper show Zalo's own preview card on Zalo.
- Typing notifications and read receipts go to Zalo exactly when Beeper sends them, so Beeper's
  own privacy settings decide.
- Bridge state `BAD_CREDENTIALS` when the Zalo session dies and `LOGGED_OUT` on `logout`.
- Answers hungryserv's provisioning `capabilities` probe; logs any other proxied request.
- `logging.level` now applies to matrix-appservice-bridge (default `warn`).

### Changed

- The Beeper account state is re-posted every minute (was 10). A `bbctl proxy` reconnect wiped
  it, and Beeper Desktop then hid every Zalo chat for up to 10 minutes.
- Zalo link cards show the text the sender typed, with the page title as the preview title.
- Container health checks use the appservice's `/health` endpoint.
- Stricter TypeScript (`noUnused*`, `noImplicitReturns`, `noImplicitOverride`) and type-aware
  lint rules (no floating or misused promises, `unknown` in catch callbacks).

### Fixed

- The Zalo listener no longer gives up after a long network outage (PC asleep, Wi-Fi or DNS
  down for more than ~30 minutes). Abnormal socket closes (code 1006) now keep retrying every
  5 minutes and the bridge resumes syncing by itself once the network is back, instead of
  stopping until someone sends `login` or restarts the container.
- Reactions you make on the Zalo phone app show in Beeper, and removing a reaction in either
  app removes it in the other. Removing one reaction in Beeper keeps your other reactions on
  that message in Zalo.
- Replies that quote a message bridged before its server id was known (for example someone
  replying to their own message) now show as replies in Beeper. Unresolved quotes are logged.
- Links sent from Beeper reuse Beeper's own preview title and description on Zalo; links
  Zalo cannot preview, or whose preview you removed in Beeper, go as plain text instead of a
  broken card.
- Zalo system cards such as "pinned a message" show their text in Beeper instead of
  "[Zalo message type not supported by bridge: webchat]".
- Voice notes from Beeper Android (ogg/opus) arrived on Zalo as file attachments; they are
  re-encoded to AAC with ffmpeg (now in the container image) and sent as voice messages.
- Beeper iOS photos were sent to Zalo with the file name as a caption.
- GIF photos from Zalo were uploaded as JPEG.
- A sticker that failed to build once stayed a still image until restart.
- `sendLink` could send a message twice after a network error.
- Two Zalo profile lookups per new contact (now one).

### Removed

- Clearing of the legacy bridge-info state key, which rewrote every portal on each start.
- A monkey-patch for ephemeral events that matrix-appservice 4.1 already handles.

### Security

- Removed real thread/registration ids, a captured location and a personal home path from tests
  and launchd templates.

## 2026-10-23 – 2026-10-28 (fork)

### Added

- Docker/Podman deployment (`compose.yaml`, entrypoint running the appservice and `bbctl proxy`
  together).
- History importer from Zalo PC (CDP export and encrypted `.zl.zip` backups) with one-command
  scripts for Windows and macOS.
- Videos, files, voice notes, GIFs, doodles, locations, contact cards and web cards from Zalo.
- Animated stickers built from Zalo's sprite sheets.
- Multi-account groundwork: schema v7 (`account` table, `account_id`), `accounts` command,
  `fi.mau.receiver` in bridge info.
- Rollback procedure for container deploys.

### Changed

- matrix-appservice-bridge 11.2.0 → 12.0.1; non-breaking security updates.
- The ghost prefix is derived from the registration (several bridges per host).

### Fixed

- Adding the Zalo account in Beeper, voice notes, and several import-script options.

## [1.0.0] - 2026-08-10 (upstream)

First version by [lequocbinh04](https://github.com/lequocbinh04): two-way text, replies,
mentions, photos, video/file/audio out, reactions, recall, read receipts, typing, double
puppeting of your own phone messages, network branding, Beeper account state, encrypted
credential storage, owner-only bot commands and a launchd deployment for macOS.

[Unreleased]: https://github.com/lethucthanhtu/zalo-beeper-bridge/commits/main
[1.0.0]: https://github.com/lequocbinh04/zalo-beeper-bridge
