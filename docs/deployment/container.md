# Container deployment (Docker or Podman)

One image runs **both** processes the bridge needs: the appservice (`node src/index.ts`)
and `bbctl proxy`. They share the container's loopback, so `registration.yaml` keeps
`url: http://localhost:29350` and nothing is published on the host.

> Run exactly **one** instance per registration. A second bridge/proxy (another
> container, `npm run dev`, a launchd agent, `bbctl proxy` in WSL…) kicks the first.

## 1. Inputs (`container-config/`, gitignored) {#_1-inputs-container-config-gitignored}

| File                             | Where it comes from                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `config.yaml`                    | `cp config.yaml.example` and fill in (relative paths are fine — they resolve to `/data`) |
| `registration.yaml`              | `bbctl register -o registration.yaml sh-zalo`, with `url: http://localhost:29350`        |
| `bbctl-config.json` _(optional)_ | your existing `~/.config/bbctl/config.json` (Beeper login; `bbctl proxy` needs it)       |

Instead of `bbctl-config.json` you can set `MATRIX_ACCESS_TOKEN` (the `access_token`
from that file), or log in inside the container once:

```bash
docker compose run --rm zalo-bridge bbctl login      # or: podman compose run --rm ...
```

On rootless Podman the files must be readable by the container user: `chmod 644`
them on the host (a 600 file is unreadable inside). On SELinux hosts (Fedora/RHEL)
change the mount in `compose.yaml` to `./container-config:/config:ro,Z`.

## 2. Run

```bash
# Docker
docker compose up -d --build
docker compose logs -f

# Podman (podman compose uses podman-compose or docker-compose as provider)
podman compose up -d --build
podman logs -f zalo-beeper-bridge
```

Without compose:

```bash
podman build -t localhost/zalo-beeper-bridge .          # or docker build
podman run -d --name zalo-beeper-bridge --restart unless-stopped \
  -v ./container-config:/config:ro -v zalo-data:/data \
  localhost/zalo-beeper-bridge
```

Healthy startup log:

```
Appservice listening on localhost:29350 ...
DBG Appservice transaction websocket opened        <- bbctl proxy connected to Beeper
[zalo] no valid saved credentials — send 'login'   <- first run only
```

## 3. Add the Zalo account and sync

1. In Beeper, open the DM with `@sh-zalobot:beeper.local` and send `login`.
2. Scan the QR with the Zalo phone app and confirm. Expect `✓ Logged in to Zalo`.
3. Send `sync`. It creates a room for pinned chats and **every** group, joins you
   into them, and fills empty rooms with whatever history Zalo hands this session.
   It is paced (1.5 s per step); ~50 groups take about 2 minutes.

From then on every new Zalo message (DM or group, including ones you send from the
phone) appears in Beeper. Zalo does not re-send what arrived while the bridge was away
(container down, PC asleep, network drop), so after every (re)connect the bridge asks
Zalo for everything newer than the last message it bridged — the feed runs forward from a
message id, 50 messages per page, up to 10 pages per DMs and groups — and replays the gap
in order. The log shows `[sync] catch-up user|group: N page(s)` and
`[sync] catch-up: N missed message(s) to bridge`.

The encrypted Zalo session lives on the `zalo-data` volume, so restarts and rebuilds
re-login silently (`[zalo] re-logged in from saved credentials`).

### What Zalo does not allow

- **History from before the login.** Zalo only serves a web session the messages it
  received after that session was created. Cloud group history comes back
  `isFiltered=1` (the server has the messages but withholds them); DMs are kept on the
  phone, not on Zalo's servers. Zalo's own apps get old chats only via the phone's
  "sync messages" transfer, which no third-party client can use.
- **Original timestamps** for caught-up/backfilled messages (they carry bridge time).

## Troubleshooting

The full list is on the [Troubleshooting](../troubleshooting) page.

| Symptom                                                      | Check                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Chats missing in Beeper although the log shows `[zalo] in …` | You were left at "invite" (old versions). Restart: startup joins you into every portal                                     |
| No `[zalo] in/own …` lines at all                            | Close Zalo Web in the browser (one web session only), then `logout` + `login`                                              |
| Unknown protocol frames                                      | `ZALO_WS_TRACE=1 podman compose up -d` logs every frame header (cmd/size only, never content)                              |
| Network visible in Beeper Desktop, but no chats              | Remote-account state missing, see [Troubleshooting](../troubleshooting#beeper-desktop-shows-the-zalo-network-but-no-chats) |

Each bridged Zalo message logs one line with ids only: `[zalo] in group text thread=… msg=…`.
End-to-end-encrypted 1-1 pushes (cmd 551, dropped by zca-js) are rerouted to the DM handler.

## State and backup

Everything stateful is in the named volume (`/data`): `bridge.db` (portal/message
mapping), `zalo-creds.session.json` + its key, and the bbctl login. A named volume is
used on purpose: SQLite WAL is unreliable on Windows bind mounts.

See [Operations](./operations#backup) for backups, upgrades and rollback.

## History import and a second account

- Import history with `scripts/zalo-pc/import.ps1` (Windows) or `scripts/zalo-pc/import.sh` (macOS) (see [History import](../history-import/)). They run the importer inside this container (`-ContainerCli docker` / `-r docker` for Docker, `-Container` / `-n` for another container name).
- A second Zalo account runs as a second bridge with its own `bbctl register` name, config dir and volume (see [Multiple accounts](../guide/multiple-accounts)).

## Limits

- Backfilled messages only go into rooms that are still empty (old messages are never
  appended below newer ones in a room that already shows messages).
- Podman builds OCI images, which drop the Dockerfile `HEALTHCHECK`; `compose.yaml`
  declares it again so both engines report health. Both probe the appservice's own
  `GET /health` (served by matrix-appservice) with `curl`, as does the entrypoint before
  it starts `bbctl proxy`.
