# Troubleshooting

Start with these quick checks:

::: code-group

```bash [Container]
podman ps --filter name=zalo-beeper-bridge   # STATUS should show (healthy)
podman logs --since 1h zalo-beeper-bridge
```

```bash [macOS launchd]
launchctl list | grep beeper-zalo            # both jobs should show exit code 0
tail -f ~/zalo-beeper-bridge/logs/bridge.log
```

:::

Then send `status` to the bot in Beeper: it shows whether Zalo is logged in and the listener state. The [log reference](./reference/logs) explains each log line.

## Messages stop flowing / listener not connected

The log shows `listener reconnecting` or `listener DEAD`.

- **You opened Zalo Web in a browser.** Zalo allows one web session, and the browser kicked the bridge off. Close Zalo Web and the listener reconnects by itself (backoff up to 5 minutes). The phone app and Zalo PC are fine to use alongside the bridge; Zalo Web is not.
- **Network outage.** The bridge keeps retrying, every 5 minutes at most, until the network is back. No action is needed.
- **The session expired, or the log shows `[zalo] listener DEAD`.** The session can no longer be used. Send `login` to the bot and scan the QR code again.

## Account locked or sends keep failing

If Zalo throttles or locks the account, sends fail and the log shows repeated errors. Stop the bridge (`podman compose stop`, or `launchctl unload …` on macOS). Then open Zalo on your phone and clear any security prompt before you start the bridge again. If it happens again, lower `zalo.messagesPerMinute` and `zalo.burst` in `config.yaml` (see [Configuration](./guide/configuration)).

## Bridge won't start

- **Container:** `podman ps -a` shows the container exited or restarting. `podman logs zalo-beeper-bridge` shows the reason.
- **macOS launchd:** `launchctl list | grep beeper-zalo` shows a non-zero exit code. `logs/bridge.log` shows the stack trace.

Common causes:

- `config.yaml` is missing or invalid. The error names the bad field. Copy `config.yaml.example` and compare.
- `registration.yaml` is missing. Run `bbctl register sh-zalo`.
- launchd only: the Node path in the plist is wrong, for example after an nvm upgrade.
- Another bridge or `bbctl proxy` is already running with the same registration.

## Beeper Desktop shows the Zalo network but no chats

Beeper hides every chat of a bridge whose remote-account state is missing, even while the bridge shows as running.

- Check it inside the container: `podman exec zalo-beeper-bridge sh -c 'bbctl -c "$BBCTL_CONFIG" whoami --raw' | grep -A3 remoteState`. Healthy is an entry for your Zalo uid with `"state_event": "CONNECTED"`.
- A `bbctl proxy` (re)connect can wipe that state. That happens on every restart and roughly every hour. The bridge posts it again every minute, so the chats come back within a minute. If they stay away longer, look for `[beeper] remote state … rejected` or `failed` in the log.
- `BAD_CREDENTIALS` or `LOGGED_OUT`: the Zalo session ended or you sent `logout`. Send `login` to the bot.

## Messages missing after the PC slept or the container was down

Zalo does not re-send missed messages, so the bridge fetches them itself after each reconnect. Look for `[zalo] listener connected` followed by `[sync] catch-up user: N page(s)`, `[sync] catch-up group: N page(s)` and `[sync] catch-up: N missed message(s) to bridge`.

- `(stopped at the page limit)`: more than about 500 messages of that kind arrived while the bridge was away, and the newest of them were not fetched. Restart the bridge to run another catch-up from there.
- No catch-up line: the listener did not really reconnect (the session key never arrived). Restart the bridge.
- A catch-up is skipped while a `sync` runs, because both read the same feed.

## Images / media won't send

- The chat shows a notice `⚠ Failed to send <type> to Zalo: <reason>` with Zalo's error.
- Media larger than `bridge.mediaMaxBytes` (default 10 MB) is rejected. Raise the cap or send a smaller file.
- Voice notes go to Zalo as voice messages. AAC (Beeper iOS) is sent as is. Other codecs (ogg/opus from Beeper Android) are re-encoded to AAC with `ffmpeg`. If a voice note still arrives as a file, the log has `[audio] voice transcode to AAC failed: …`. The usual cause is that `ffmpeg` is not on the PATH when the bridge runs outside the container.

## `[Zalo video / file could not be bridged: …]` notice

The notice keeps the Zalo link. The log line `[media] download from <host> failed: <reason>` gives the reason:

- `refusing media host outside Zalo CDN (<host>)`: Zalo moved media to a new CDN domain. Check the redirect chain with `curl -sI <link>`. If the new domain belongs to Zalo, add it to `ALLOWED_HOST_SUFFIXES` in `src/bridge/media-handler.ts`. In 2026-10 Zalo moved `dlmd.me` to `mdchat.me` and `dlfl.vn` to `flchat.vn`.
- `HTTP 403/404` or `error page`: the link expired. Zalo CDN links last about 14 days.
- `media exceeds size cap`: videos and files are capped at 100 MB, photos at `bridge.mediaMaxBytes`.
- A timeout: videos and files get 180 seconds, photos 30 seconds.

## Images stuck "loading" in Beeper (mostly older ones)

This is not a bridge problem, because the bridge uploaded them fine. Beeper serves media by redirecting to object storage: recent uploads to Cloudflare R2, older ones to Wasabi S3 (`s3.eu-central-1.wasabisys.com`). From some networks (seen on VNPT, Vietnam) the route to Wasabi loses packets. TLS then takes 1–15 seconds or times out, and the client keeps spinning.

- Confirm: open Beeper on another network (4G, Cloudflare WARP or a VPN). The old images then load.
- Measure: `curl -s -o /dev/null -w '%{time_appconnect}s\n' https://s3.eu-central-1.wasabisys.com/`. A healthy result is well under 1 second.
- Fix: only Beeper can change where media is stored. Report "media redirect to Wasabi eu-central-1 times out from &lt;ISP/country&gt;" to Beeper support. Images that loaded once stay cached in the client.

## `[Zalo message type not supported by bridge: <type>]` {#unknown-zalo-message-type}

The log has `[bridge] unsupported Zalo msgType <type> (content keys: …)` with the payload's field **names** only. Please [open an issue](https://github.com/lethucthanhtu/zalo-beeper-bridge/issues) with the type and the keys. To add the type yourself, see [Adding a Zalo message type](./contributing/development#adding-a-zalo-message-type).

## Recall didn't reach Zalo

Only messages **you sent from Beeper** can be recalled, because Zalo only lets you recall your own messages, and only within Zalo's recall time window. When you delete someone else's message, the bridge posts the notice "Zalo only allows recalling your own messages".

## Not enough (or too many) log lines

`logging.level` in `config.yaml` sets the log level of matrix-appservice-bridge (the Matrix side):

- `warn` (default) keeps its errors and warnings.
- `info` also logs every HTTP request, including the 30-second `/health` check.
- `debug` logs everything.

The bridge's own `[zalo]`, `[bridge]` and `[beeper]` lines are always logged. For a websocket trace, set `ZALO_WS_TRACE=1`.

## The network badge on chat avatars is generic

This is expected for self-hosted bridges. Beeper's apps draw that badge only for bridge types they know, and `bbctl` registers self-hosted bridges as the generic `bridgev2` type. A self-hosted mautrix Teams bridge shows the same badge. The bridge sets everything a bridge can: the bot avatar and `m.bridge` `protocol.avatar_url`. The network **name** "Zalo" comes from those.

## Network name still shows "sh-zalo"

The bot profile is "Zalo" and the portals carry the network branding. The top-level network label, however, is fixed to the `bbctl` registration name, and a custom appservice cannot rename it.

## History import {#history-import}

- **`Zalo main window not found`**: Zalo PC is not running with `--remote-debugging-port=9229`, or it is still starting.
- **`bad tar header — wrong UIN`**: the key does not belong to this backup. Read it from the Zalo PC session of the account that created the backup.
- **A chat ends `FAIL`**: its old room is untouched, and any half-built room is deleted automatically. Check `run.log` and re-run the script. It skips the chats that already finished OK.
- **`WARNING … live message(s) could not be carried over`**: the Matrix event of a live-only message could not be read. In that case the old room is not removed.
- **Photos or videos show as text lines**: the CDN copy expired and the backup has no copy, so nothing holds the file any more.

See [History import](./history-import/) for the full process.

## Rolling back a deploy

See [Operations → Rollback](./deployment/operations#rollback).
