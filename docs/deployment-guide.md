# Deployment Guide — running the bridge 24/7 (macOS launchd)

The bridge runs as two launchd user agents so it starts on login, restarts on crash, and survives closing your terminal:

- `dev.beeper-zalo.bridge` — the appservice (`node src/index.ts`)
- `dev.beeper-zalo.proxy` — `bbctl proxy` (Beeper websocket ⇄ local port 29350)

Both **must** run together. They are single-user and single-listener: never run a second copy (e.g. `npm run dev`) while the agents are loaded, or the two Zalo listeners will kick each other.

## Install

Plist templates live in `deploy/launchd/`. They use absolute paths (launchd has a minimal env). If you move the repo or change Node version, update the paths inside them.

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
# optional, also prevent display-off from sleeping the system:
sudo pmset -c disablesleep 0
```

## Manage

```bash
# status (PID + last exit code; exit 0 = healthy)
launchctl list | grep beeper-zalo

# live logs
tail -f logs/bridge.log
tail -f logs/proxy.log

# restart after a code change / config edit
launchctl kickstart -k gui/$(id -u)/dev.beeper-zalo.bridge

# stop / start
launchctl unload ~/Library/LaunchAgents/dev.beeper-zalo.bridge.plist
launchctl load   ~/Library/LaunchAgents/dev.beeper-zalo.bridge.plist
```

After editing a `.plist`, copy it to `~/Library/LaunchAgents/` again and `unload`+`load` for changes to take effect.

## Bot commands (in the Beeper management chat)

`ping` · `status` · `login` (QR) · `logout` · `sync` (pinned + top groups).

## Troubleshooting

See `docs/troubleshooting-runbook.md`.
