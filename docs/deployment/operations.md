# Operations

Day-to-day running of the container deployment: health, logs, upgrades, backups and rollback. Commands use Podman; replace `podman` with `docker` if you use Docker.

## Health

The image has a health check that requests `http://127.0.0.1:29350/health` inside the container every 30 seconds. Podman drops the Dockerfile `HEALTHCHECK` from OCI images, so `compose.yaml` declares it again.

```bash
podman ps --filter name=zalo-beeper-bridge      # STATUS shows (healthy) / (unhealthy)
```

The health check only tells you that the appservice answers. To check Zalo, send `status` to the bot: it shows the uptime, whether Zalo is logged in, and the listener state.

To check what Beeper sees:

```bash
podman exec zalo-beeper-bridge sh -c 'bbctl -c "$BBCTL_CONFIG" whoami --raw' | grep -A3 remoteState
```

Healthy is an entry for your Zalo uid with `"state_event": "CONNECTED"`.

## Logs

```bash
podman logs -f zalo-beeper-bridge
podman logs --since 1h zalo-beeper-bridge | grep -E '\[zalo\] listener|\[sync\]'
```

See the [log reference](../reference/logs) for every line. Set `ZALO_WS_TRACE=1` in the environment (see `compose.yaml`) only while debugging; it logs every websocket frame header.

## Upgrade

```bash
git pull
podman compose build
podman compose up -d
```

`up -d` recreates the container from the new image. The data volume is kept, and [database migrations](../reference/database#migrations) run on start. Before an upgrade that changes the database schema, prepare a [rollback](#rollback) first.

The history importer also runs from the image, so rebuild after you update the code before you import.

## Backup

Everything stateful is in the named volume mounted at `/data`:

| File                                                       | Content                            |
| ---------------------------------------------------------- | ---------------------------------- |
| `bridge.db` (+ `-wal`, `-shm`)                             | Portal, ghost and message mappings |
| `zalo-creds.session.json` + `.zalo-creds.session.json.key` | Encrypted Zalo session and its key |
| `bbctl/config.json`                                        | Beeper login of `bbctl`            |

Compose names the volume `<project>_zalo-data`, for example `zalo-beeper-bridge_zalo-data` when the repository folder is called `zalo-beeper-bridge`. `podman volume ls` lists it.

**Whole volume**, with the container stopped so SQLite is consistent:

```bash
podman compose stop
podman run --rm -v zalo-beeper-bridge_zalo-data:/data -v "$PWD":/backup docker.io/library/busybox \
  tar czf /backup/zalo-data.tgz -C /data .
podman compose start
```

**Database only**, while the bridge runs (SQLite online backup):

```bash
podman exec zalo-beeper-bridge node -e "new (require('/app/node_modules/better-sqlite3'))('/data/bridge.db',{readonly:true}).backup('/data/bridge.db.bak-<name>')"
podman exec zalo-beeper-bridge chmod 600 /data/bridge.db.bak-<name>
```

::: danger
The archive holds your Zalo session and its key. Anyone with both can use your Zalo account. Store it encrypted and never commit it.
:::

## Rollback

Before a risky upgrade, keep three things: the running image, the code, and the database.

```bash
podman tag "$(podman inspect zalo-beeper-bridge --format '{{.Image}}')" localhost/zalo-beeper-bridge:rollback-<name>
git tag -a rollback/<name> -m "last deployed state"
# plus a database backup as shown above
```

**Roll back the code** (the normal case; the database stays as it is):

```bash
podman tag localhost/zalo-beeper-bridge:rollback-<name> localhost/zalo-beeper-bridge:latest
podman compose up -d --no-build --force-recreate
git switch --detach rollback/<name>   # so the next build does not bring the change back
```

Migrations only add tables and columns, so older code runs on a newer database. This was verified for schema v7 → v6 on a copy of a live database: the v6 code reads and writes normally, and its new rows have no `account_id` until newer code runs again. The older code also re-sends each portal's `m.bridge` state without `fi.mau.receiver`.

**Restore the database** only if it is damaged. Messages bridged since the backup lose their mapping, so replies and reactions to them stop working.

```bash
podman compose stop
podman run --rm -v zalo-beeper-bridge_zalo-data:/data --entrypoint sh localhost/zalo-beeper-bridge:latest \
  -c 'cd /data && rm -f bridge.db-wal bridge.db-shm && cp bridge.db bridge.db.broken && cp bridge.db.bak-<name> bridge.db'
podman compose up -d
```

## Re-login

When Zalo ends the session (the log shows `listener DEAD`, `status` shows the listener as dead, or Beeper shows the network as disconnected), send `login` to the bot and scan the new QR code in the Zalo app. Before that, check [Troubleshooting](../troubleshooting#messages-stop-flowing-listener-not-connected) for the cause.
