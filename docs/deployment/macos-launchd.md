# macOS (launchd)

The bridge runs as two launchd user agents so it starts on login, restarts on crash, and survives closing your terminal:

- `dev.beeper-zalo.bridge` — the appservice (`node src/index.ts`)
- `dev.beeper-zalo.proxy` — `bbctl proxy` (Beeper websocket ⇄ local port 29350)

Both **must** run together. They are single-user and single-listener: never run a second copy (e.g. `npm run dev`) while the agents are loaded, or the two Zalo listeners will kick each other.

## Install

Plist templates live in `deploy/launchd/`. They use absolute paths (launchd has a minimal env): replace `YOUR_USER`, the repo path and the Node version (`vXX`, see `which node`) before installing, and again if you move the repo or change Node version.

```bash
cp deploy/launchd/dev.beeper-zalo.bridge.plist ~/Library/LaunchAgents/
cp deploy/launchd/dev.beeper-zalo.proxy.plist  ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/dev.beeper-zalo.bridge.plist
launchctl load ~/Library/LaunchAgents/dev.beeper-zalo.proxy.plist
```

## Keep the Mac awake on AC power

The bridge only works while the Mac is on and not asleep. Disable sleep when plugged in (needs sudo, run it yourself):

```bash
sudo pmset -c sleep 0        # never sleep on AC power
```

## Manage

```bash
# status (PID + last exit code; exit 0 = healthy)
launchctl list | grep beeper-zalo

# live logs
tail -f ~/zalo-beeper-bridge/logs/bridge.log   # paths set in the plists
tail -f ~/zalo-beeper-bridge/logs/proxy.log

# restart after a code change / config edit
launchctl kickstart -k gui/$(id -u)/dev.beeper-zalo.bridge

# stop / start
launchctl unload ~/Library/LaunchAgents/dev.beeper-zalo.bridge.plist
launchctl load   ~/Library/LaunchAgents/dev.beeper-zalo.bridge.plist
```

After editing a `.plist`, copy it to `~/Library/LaunchAgents/` again and `unload`+`load` for changes to take effect.

## Bot commands (in the Beeper management chat)

`ping` · `status` · `login` (QR) · `logout` · `sync` (pinned chats + every group) · `accounts` (Zalo accounts seen by this bridge). See [Bot commands](../guide/bot-commands).

## Troubleshooting

See [Troubleshooting](../troubleshooting). For backups, upgrades and rollback, see [Operations](./operations): the same steps apply, but the database and session files live in the repository folder instead of a volume.
