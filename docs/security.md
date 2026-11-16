# Security & privacy

## Where your data goes

The bridge runs entirely on your own machine. Message content is sent only to Zalo and to your Beeper account. There is no telemetry and no third-party service.

## Risk to your Zalo account

The bridge uses [zca-js](https://github.com/RFS-ADRENO/zca-js), an **unofficial** client of the Zalo Web protocol. Zalo does not support third-party clients and may lock or ban accounts that use them. The bridge reduces the risk but cannot remove it:

- Outbound messages go through a token-bucket rate limiter (by default a burst of 30, then 60 per minute; see [Configuration](./guide/configuration)).
- The bridge holds the only Zalo Web session of the account. Do not use Zalo Web in a browser at the same time: Zalo allows one web listener, and the bridge and the browser would keep disconnecting each other.
- The `sync` command and the ghost profile repair are paced, and the repair waits an hour after Zalo refuses a lookup.

Only use the bridge with an account you can afford to lose access to for a while.

## Secrets on disk

| What                                    | Where                                           | Protection                                                   |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Zalo session (cookie, IMEI, user agent) | `zalo-creds.session.json`                       | AES-256-GCM; the key is in a separate `0600` file next to it |
| Appservice tokens                       | `registration.yaml`                             | File permissions                                             |
| Beeper login of `bbctl`                 | `bbctl-config.json` / `/data/bbctl/config.json` | File permissions (`0600` in the container)                   |
| Room, ghost and message ids             | `bridge.db`                                     | File permissions                                             |

All of these are gitignored. Never commit or share them, and keep backups of the data volume encrypted. Anyone holding the session file **and** its key can use your Zalo account.

If one of them leaks:

1. Re-register the bridge (`bbctl register`) to get new appservice tokens.
2. Send `logout` and then `login` to the bot to get a new Zalo session.
3. Log out of Beeper on that device and log in again to rotate the `bbctl` login.

## Network exposure

- The appservice listens on port `29350` on the loopback interface inside the container. `bbctl proxy` connects out to Beeper, so no port needs to be published. Do not publish it.
- Media is downloaded only over HTTPS from Zalo's CDN hosts (`zdn.vn`, `zadn.vn`, and the video and file CDNs `dlmd.me` / `mdchat.me`, `dlfl.vn` / `flchat.vn`). The host is checked again on every redirect.

## Who can control the bridge

Only the owner set in `config.yaml` (`matrix.owner`) can use the bot commands; everyone else is ignored. Only the owner's messages in a portal room are sent to Zalo.

## Logs

Logs carry ids, counts, states and hostnames. They never contain message text or signed media links. See [Logs](./reference/logs).

## History import {#history-import}

The history import reads your full message history, so treat everything it produces as private:

- **Debug port.** Zalo PC's debug port listens on `127.0.0.1` only, but while it is open **any local program can read your messages** through it. Restart Zalo PC normally when you are done.
- **Backup key.** The key printed by `get-uin.mjs` decrypts every backup of the account. Keep it in a private file and delete it after use.
- **Work files.** Exports, extracted backups and prepared media contain your history and media in clear text. When the import is finished, delete `work/` on the host and the import folders in the container:

  ```bash
  rm -rf work/
  podman exec zalo-beeper-bridge rm -rf /data/import-export /data/import-media
  ```

## Dependencies

`npm audit` (2026-10-28, matrix-appservice-bridge 12.0.1) reports 6 findings. None is reachable from this bridge and none has an upstream fix:

- `ip-address` (through `ip-cidr`) is used only by the provisioning API of matrix-appservice-bridge, which the bridge does not enable.
- `deepmerge` (through `html-to-text`) is used only by matrix-bot-sdk's `sendHtmlText` / `replyHtmlText`, which the bridge does not call.

They are checked again after an upgrade of either package.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** ([new advisory](https://github.com/lethucthanhtu/zalo-beeper-bridge/security/advisories/new)). See [SECURITY.md](https://github.com/lethucthanhtu/zalo-beeper-bridge/blob/main/SECURITY.md) for scope and response times.
