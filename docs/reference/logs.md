# Log reference

The bridge logs to stdout and stderr. Every line starts with a prefix that names the part of the bridge that wrote it. Log lines carry **ids, counts and states only**, never message text.

Read the logs with:

::: code-group

```bash [Container]
podman logs -f zalo-beeper-bridge      # or: docker logs -f zalo-beeper-bridge
```

```bash [macOS launchd]
tail -f ~/zalo-beeper-bridge/logs/bridge.log   # path set in the plist
```

:::

## Prefixes

| Prefix         | Written by                                   |
| -------------- | -------------------------------------------- |
| `[zalo]`       | Zalo login, listener and incoming events     |
| `[zalo:ws]`    | Raw websocket trace (`ZALO_WS_TRACE=1` only) |
| `[zalo:http]`  | Recent-history requests (`ZALO_WS_TRACE=1`)  |
| `[bridge]`     | Inbound and outbound message handling        |
| `[sync]`       | The `sync` command and reconnect catch-up    |
| `[beeper]`     | Beeper account state and network branding    |
| `[media]`      | Zalo CDN downloads                           |
| `[audio]`      | Voice note conversion                        |
| `[outbound]`   | Sends to Zalo                                |
| `[appservice]` | HTTP requests from `bbctl proxy`             |
| `[import]`     | History importer                             |
| `[verify]`     | Importer `--verify`                          |
| `[retire]`     | Importer room deletion                       |

## `[zalo]`

| Line                                                        | Meaning                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `in\|own <threadType> <kind> thread=… msg=…`                | A message arrived from someone else (`in`) or from your own account on another device (`own`).                    |
| `re-logged in from saved credentials (uid …)`               | Start-up login with the encrypted saved session worked.                                                           |
| `no valid saved credentials — send 'login'`                 | No usable session. Send `login` to the bot.                                                                       |
| `listener connected`                                        | The Zalo websocket is up. A catch-up follows.                                                                     |
| `listener reconnecting (attempt N, in Nms)`                 | The websocket closed; the bridge retries with backoff. Normal during network outages.                             |
| `listener error:`                                           | An error reported by the listener. Usually followed by a reconnect.                                               |
| `listener restart skipped:`                                 | zca-js reported the listener as already running; treated as recovered.                                            |
| `listener DEAD: <reason> — send 'login'…`                   | Zalo ended the session (cookie expired, or Zalo Web opened elsewhere). See [Troubleshooting](../troubleshooting). |
| `E2EE DM push (cmd 551) seen — rerouting to the DM handler` | A DM arrived in Zalo's newer encrypted-push format and is handled like a normal DM.                               |
| `history batch type=group\|user raw=N usable=N`             | One page of recent history was fetched.                                                                           |
| `unhandled ws cmd N (subCmd N) — not bridged`               | Zalo sent an event type the bridge does not handle.                                                               |

With `ZALO_WS_TRACE=1` the bridge also writes `[zalo:ws] cmd=… sub=… bytes=…` for every websocket frame and `[zalo:http] getrecentv2 <groupId> cursor=… msgs=N` for every history request. Use it only to debug; it is verbose.

## `[bridge]`

| Line                                                              | Meaning                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `account <uid>: N portals, N messages assigned`                   | Older rows were tagged with the logged-in account (once, after an upgrade).                                               |
| `removed N malformed portal(s)`                                   | Start-up cleanup of portals an old `sync` created with invalid ids; you leave those empty rooms.                          |
| `profile repair: N profiles checked, N named, N avatars set`      | Ghosts without a name or avatar were looked up again.                                                                     |
| `profile repair lookup failed`                                    | That lookup failed; it is retried later.                                                                                  |
| `inbound <msgId> failed:`                                         | A Zalo message could not be posted to Beeper.                                                                             |
| `unsupported Zalo msgType <type> (content keys: …)`               | A new Zalo message type. Beeper shows a placeholder; see [Troubleshooting](../troubleshooting#unknown-zalo-message-type). |
| `reply target not bridged`                                        | A Zalo reply quotes a message that has no Beeper event (for example, older than the bridge).                              |
| `redact … failed`                                                 | A recall from Zalo could not be applied in Beeper.                                                                        |
| `chat.delete without message ids`                                 | A Zalo "delete for me" event without ids was ignored.                                                                     |
| `owner auto-join … failed (manual accept needed)`                 | Accept the room invite in Beeper by hand.                                                                                 |
| `owner leave … failed`                                            | Leaving a malformed portal for you failed; its rows are dropped anyway.                                                   |
| `recording the Zalo account failed (retried on the next connect)` | The `account` row could not be written (usually the importer holds the database lock).                                    |

Two messages are posted as notices **in the chat** instead of logged: `[bridge] this message type is not supported outbound yet` (you sent something the bridge cannot send to Zalo) and `[bridge] Zalo only allows recalling your own messages` (you deleted someone else's message).

## `[sync]`

| Line                                                            | Meaning                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `catch-up user\|group: N page(s)[ (stopped at the page limit)]` | Recent history read after a reconnect.                               |
| `catch-up: N missed message(s) to bridge`                       | Messages that arrived while the listener was down, now being posted. |
| `catch-up failed:`                                              | The catch-up failed; the next reconnect tries again.                 |

## `[beeper]`, `[media]`, `[audio]`, `[outbound]`, `[appservice]`

| Line                                                     | Meaning                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `[beeper] remote state <X> rejected: HTTP …`             | Beeper refused the account state update. The network may show as disconnected.     |
| `[beeper] remote state <X> failed:`                      | The update could not be sent.                                                      |
| `[beeper] own avatar upload failed`                      | The bridge logo could not be uploaded; the account state is published without it.  |
| `[media] download from <host> failed: <reason>`          | A Zalo CDN download failed (often an expired link). A text line is posted instead. |
| `[audio] voice transcode to AAC failed: …`               | A voice note from Beeper could not be converted for Zalo.                          |
| `[outbound] quoted send failed, retrying without quote:` | Zalo rejected the reply; it is sent as a plain message.                            |
| `[appservice] unhandled <METHOD> <path>`                 | `bbctl proxy` called an endpoint the bridge has no route for. Usually harmless.    |

## Importer: `[import]`, `[verify]`, `[retire]`

| Line                                                       | Meaning                                        |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `[verify] <key> → <room>: N mapped, N timeline events, OK` | The chat's room holds every exported message.  |
| `[verify] <key> → <room>: … PROBLEMS: …`                   | Something is missing; the old room is kept.    |
| `[retire] <roomId>: <outcome>, N stale mapping(s) dropped` | A superseded room was deleted.                 |
| `[retire] delete … as … failed`                            | Deleting the room failed; delete it in Beeper. |

See [History import](../history-import/) for the importer itself.
