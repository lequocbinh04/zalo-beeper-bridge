# How it works

This page explains what the bridge does at runtime, in the order you meet it. For the code layout, see [Architecture](../reference/architecture).

## Two processes

The bridge needs two processes running side by side:

1. **The appservice** (`node src/index.ts`): logs in to Zalo with zca-js, listens for Zalo messages and talks to the Matrix homeserver. It serves the appservice API on `localhost:<matrix.port>` (29350 by default), including `GET /health`.
2. **`bbctl proxy`**: opens an outgoing websocket to Beeper and forwards Beeper's appservice transactions to the local port. Nothing listens on the internet.

The container runs both and stops the container if either exits, so the restart policy brings them back together.

## Rooms and ghosts

- **Portal room:** each Zalo chat (DM or group) has one Matrix room. The bridge creates it on the first message of that chat, or for pinned chats and groups when you run [`sync`](./bot-commands#sync). You are invited and joined automatically; at startup the bridge also joins you into any portal you were only invited to.
- **Ghost user:** each Zalo contact is a Matrix user `@<bridge name>_<zalo uid>:beeper.local` with the contact's name and avatar. Profiles are re-checked at most once a day. Ghosts that have no name yet (for example from the history importer) are filled in the background after login: 20 profiles per batch with 15 s pauses, and after a refusal from Zalo the next attempt waits an hour.
- **Double puppeting:** on Beeper's single-tenant server the appservice token can act as you, so messages you send from the Zalo phone app show up in Beeper as yours.
- **Branding:** the bot profile and every room's `m.bridge` state name the network "Zalo" with its logo, so Beeper files the chats under it. The small badge on chat avatars stays generic: Beeper's apps draw it only for bridge types they know, and self-hosted bridges register as the generic `bridgev2` type.

## Zalo → Beeper

1. zca-js delivers a raw Zalo event over its websocket.
2. `event-normalizer` turns it into a typed message (text, photo, sticker, file, link, location, …).
3. `inbound-handler` finds or creates the portal and ghost, renders the content (media goes through `media-content`, shared with the history importer), sends it as the ghost (or as you, for your own messages) and stores the Zalo message id → Matrix event id mapping in SQLite.

Every bridged message logs one line with ids only, for example `[zalo] in group text thread=… msg=…`.

## Beeper → Zalo

1. Beeper sends a transaction through `bbctl proxy` to the appservice.
2. `outbound-handler` maps the room to the Zalo thread, converts mentions, replies, media and voice notes, waits for a token from the [rate limiter](./configuration#zalo) and sends it with zca-js.
3. Zalo echoes every message back to its sender's own listener. The **echo suppressor** matches that echo (by message id, with a content fallback) so your message is not posted twice.

Reactions, read receipts, typing and recall go the same way.

## Listener and reconnects

Zalo allows **one** web session per account. The listener is that session's websocket.

- When the connection closes, the listener reconnects with a backoff of 5 s, 15 s, 60 s, then every 5 minutes.
- The failure counter resets once a connection has stayed up for 60 seconds.
- After 8 failures in a row without a stable connection, the listener gives up and turns **dead**. Network outages (close code 1006) are the exception: the bridge keeps retrying through them for as long as they last.
- Close code 3000 means another Zalo Web session took over. Close that browser tab; the bridge reconnects.
- A dead listener needs a new `login`. The log shows `[zalo] listener DEAD: … — send 'login' in the management room`.

## Catch-up after downtime

Zalo does not resend messages that arrived while the bridge was away (container stopped, computer asleep, network down). After every (re)connect the bridge asks Zalo for everything newer than the last message it bridged, separately for DMs and groups: 50 messages per page, up to 10 pages each. It then replays the gap in order.

```
[zalo] listener connected
[sync] catch-up user: 1 page(s)
[sync] catch-up group: 3 page(s)
[sync] catch-up: 42 missed message(s) to bridge
```

If more than about 500 messages of one kind arrived, the log adds `(stopped at the page limit)` and the newest of them are not fetched. Restart the bridge to run another catch-up from there. Caught-up messages carry the time they were bridged, not the original time.

## Beeper account state

Beeper lists a bridge's chats only while the bridge has published its remote-account state. The bridge posts it on every listener change:

| Event              | State                  |
| ------------------ | ---------------------- |
| Listener connected | `CONNECTED`            |
| Reconnecting       | `TRANSIENT_DISCONNECT` |
| Listener dead      | `BAD_CREDENTIALS`      |
| `logout`           | `LOGGED_OUT`           |

A `bbctl proxy` reconnect can wipe this state, so the bridge re-posts it every minute. You can check it with `bbctl whoami --raw` under `remoteState`.

## What Zalo does not allow

- **History from before the login.** Zalo serves a web session only the messages it received after the session was created. Group history from the cloud comes back filtered, and DMs are kept on the phone, not on Zalo's servers. The [history importer](../history-import/) works around this by reading Zalo PC's local store.
- **Two web sessions.** Opening Zalo Web elsewhere kicks the bridge.
- **Original timestamps for live catch-up.** Only the history importer can set them.
