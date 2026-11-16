# Bot commands

The bridge bot (`@sh-zalobot:beeper.local` for a bridge registered as `sh-zalo`) is how you control the bridge. Start a chat with it in Beeper; it joins as soon as **you** (the configured `owner`) invite it and replies with its command list:

```
sh-zalo bridge bot ready. Commands: ping | login | logout | status | sync | accounts
```

Commands are case-insensitive. Messages from anyone other than the owner are ignored.

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| [`ping`](#ping)         | Health check. Answers `pong!` with the uptime.                        |
| [`login`](#login)       | Starts a QR login to Zalo.                                            |
| [`logout`](#logout)     | Logs out of Zalo and deletes the saved session.                       |
| [`status`](#status)     | Shows uptime, Zalo login state and listener state.                    |
| [`sync`](#sync)         | Creates rooms for pinned chats and every group and fills empty rooms. |
| [`accounts`](#accounts) | Lists the Zalo accounts this bridge has logged in to. Read-only.      |

## `ping`

```
pong! uptime 76h 12m 5s
```

Use it to check that Beeper, `bbctl proxy` and the appservice are all connected. No answer means one of them is down; see [Troubleshooting](../troubleshooting).

## `login`

1. The bot posts `Generating Zalo QR — scan it with the Zalo app, then confirm on your phone.` followed by the QR image.
2. Scan it in the Zalo phone app and confirm.
3. On success: `✓ Logged in to Zalo (uid …), listener started.` On failure the bot posts `Zalo login failed: <reason>`.

If a session is already active the bot refuses with `Already logged in to Zalo … Use 'logout' first to switch.` The session is saved encrypted, so after a restart the bridge logs in again by itself (`[zalo] re-logged in from saved credentials`). You only need `login` again when the session expires or Zalo ends it.

## `logout`

Stops the listener, logs out of Zalo and deletes the saved session file. Beeper then shows the account as logged out. Existing rooms and the database stay; log in again with `login`.

## `status`

```
bridge uptime: 76h 12m 5s
zalo: logged in (uid 1111111111111111111)
listener: connected
```

`listener` is `connected`, `reconnecting`, `dead` or `stopped`. `dead` means the listener gave up after repeated failures; send `login` again (see [How it works](./how-it-works#listener-and-reconnects)).

## `sync`

Creates a portal room for every **pinned** chat and every **group** you are in, invites and joins you to them, and fills rooms that are still empty with the recent history Zalo gives this session. It ends with a summary like:

```
Sync done: 52/52 pinned/group conversations ensured (4 pinned, 48 groups).
```

- It is paced (1.5 s between steps) to avoid bursts of API calls on your account: about 50 groups take 2 minutes.
- History is limited to what Zalo serves a web session, which is nothing from before the login. Use the [history importer](../history-import/) for older messages.
- Old messages are never inserted into a room that already has messages, so `sync` is safe to run again.
- DMs that are not pinned get their room when the first message arrives.

## `accounts`

Lists every Zalo account this bridge has logged in to, with the last login time (UTC), and marks the current one:

```
Zalo accounts:
● 1111111111111111111 — last login 2026-11-01 08:30 UTC (logged in, listener connected)
○ 2222222222222222222 — last login 2026-10-20 14:05 UTC
```

It is read-only. One bridge serves one Zalo account at a time; see [Multiple accounts](./multiple-accounts).
