# FAQ

## Is this an official Zalo or Beeper bridge?

No. It is a community project and has no connection to Zalo/VNG or Beeper. It talks to Zalo through [zca-js](https://github.com/RFS-ADRENO/zca-js), an unofficial client of the Zalo Web protocol.

## Can my Zalo account get locked or banned?

Yes. Zalo does not allow third-party clients, and using one is against its terms. The bridge paces its requests and rate-limits sends, but it cannot rule out a lock. If you cannot risk your main account, use a secondary one. See [Security & privacy](./security#risk-to-your-zalo-account).

## Does it work with a Matrix homeserver other than Beeper?

The bridge is a standard Matrix application service, but it is built and tested only against Beeper, through `bbctl`. Some parts are Beeper-specific: the account state, the network branding and double-puppeting through the appservice token. Other homeservers are untested.

## Can I keep using Zalo on my phone and on Zalo PC?

Yes. The phone app and Zalo PC run alongside the bridge, and messages you send from them show up in Beeper as yours. **Zalo Web in a browser** is the exception: Zalo allows one web session, so the browser and the bridge keep disconnecting each other.

## Why don't I see my old messages?

Zalo Web only delivers messages that arrive after login, plus a short catch-up after a reconnect. To bring older history into Beeper, use the [history import](./history-import/), which reads it from Zalo PC.

## What happens to messages that arrive while the bridge is down?

After the listener reconnects, the bridge fetches what it missed and posts it, up to about 500 messages per kind (DMs and groups). See [Troubleshooting](./troubleshooting#messages-missing-after-the-pc-slept-or-the-container-was-down).

## Are edits and recalls from Zalo bridged?

Not yet. A message someone recalls on Zalo stays in Beeper, and edits are not synced. The other direction works: you can recall your own messages from Beeper. A message you delete "for me" on another device is removed in Beeper too. The full list is on the [Features](./guide/features) page.

## What about end-to-end encrypted Zalo chats?

The bridge cannot decrypt them. For such messages it posts a notice instead of the content.

## Does the bridge store my messages?

No. The database holds only ids and mappings: which room, ghost and event belongs to which Zalo chat, user and message. Message text and media pass through without being stored. See [Database schema](./reference/database).

## Can one bridge serve several Zalo accounts?

One bridge serves one Zalo account at a time. For a second account, run a second bridge with its own registration. See [Multiple accounts](./guide/multiple-accounts).

## Does it run on Windows?

Yes, in a container with Docker or Podman. See [Container deployment](./deployment/container). Without a container, the bridge runs on macOS and Linux with Node.js 22.18 or newer.

## Why does Beeper show the network as "sh-zalo", or a generic badge on chat avatars?

Beeper takes the top-level network label from the `bbctl` registration name and draws the small badge only for bridge types it knows. The bridge sets everything a self-hosted bridge can set: the name "Zalo" and the logo on the bot and on every chat. See [Troubleshooting](./troubleshooting#network-name-still-shows-sh-zalo).

## Typing and read receipts don't reach Zalo

The bridge forwards them exactly when Beeper sends them. If you turn off typing notifications or read receipts in Beeper's settings, Beeper stops sending them, so the bridge has nothing to forward.

## A message shows `[Zalo message type not supported by bridge: …]`

Zalo sent a message type the bridge does not know yet. Please [open an issue](https://github.com/lethucthanhtu/zalo-beeper-bridge/issues) with the type and the field names from the log line, but never the content. See [Troubleshooting](./troubleshooting#unknown-zalo-message-type).
