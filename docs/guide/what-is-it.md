# What is zalo-beeper-bridge?

zalo-beeper-bridge is a self-hosted [Matrix application service](https://spec.matrix.org/latest/application-service-api/) that connects one personal **Zalo** account to **[Beeper](https://www.beeper.com/)**. It can also run against any other Matrix homeserver. After you log in once with a QR code, your Zalo DMs and groups show up as Beeper chats, and what you write in Beeper is sent to Zalo.

It is built with:

- [Node.js](https://nodejs.org/) 22.18+ and TypeScript, run directly by Node with no build step
- [zca-js](https://github.com/RFS-ADRENO/zca-js), an unofficial client for the Zalo Web API
- [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge) for the Matrix side
- [bbctl](https://github.com/beeper/bridge-manager) (Beeper Bridge Manager), which connects a self-hosted bridge to Beeper's servers
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) to store the mapping between Zalo and Matrix ids

## What you get

- **Live bridging in both directions.** Messages, media, reactions, replies, mentions, receipts and typing. See [Features](./features).
- **Messages you send from the phone appear in Beeper too**, on your side of the chat (double puppeting).
- **Real names and avatars** for every Zalo contact, as Matrix ghost users.
- **A history importer** that moves your complete Zalo history into Beeper from Zalo PC and its encrypted backup. See [History import](../history-import/).
- **Catch-up after downtime.** Zalo does not resend what arrived while the bridge was offline, so the bridge fetches the gap itself after every reconnect.

## What it is not

- **Not official.** There is no official API for personal Zalo messaging. zca-js reverse-engineers Zalo Web, which breaks Zalo's terms of service. Zalo can lock or ban an account it suspects. Use a secondary account if you are not willing to risk your main one.
- **Not multi-user.** One bridge serves one Beeper user (the `owner` in the config) and one Zalo account at a time. To bridge a second Zalo account, run a second bridge. See [Multiple accounts](./multiple-accounts).
- **Not a backfill service.** Zalo Web cannot read messages from before the session started. Use the [history importer](../history-import/) for old chats.
- **No end-to-end encryption.** Zalo chats with E2EE turned on cannot be decrypted. The bridge posts a notice instead.

## How the pieces fit

```
Zalo servers ──(zca-js websocket)──► bridge (appservice, port 29350)
                                           │
                                     bbctl proxy ──(websocket)──► Beeper ──► your Beeper apps
```

The bridge listens on a local port. `bbctl proxy` opens an outgoing websocket to Beeper and forwards Beeper's appservice traffic to that port, so no port has to be opened to the internet. See [How it works](./how-it-works) and [Architecture](../reference/architecture) for details.

## Where to go next

- [Getting started](./getting-started): install, register with Beeper, log in to Zalo.
- [Container deployment](../deployment/container): the recommended way to run it 24/7.
- [Troubleshooting](../troubleshooting): when something does not arrive.
