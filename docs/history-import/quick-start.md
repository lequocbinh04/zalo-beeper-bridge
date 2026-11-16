# Quick start

One command imports your history chat by chat.

## Requirements

- The bridge running in its container (Podman or Docker), logged in to Zalo.
- Zalo PC installed and logged in to the same account.
- Node.js 22.18+ on the host.
- **Windows:** PowerShell 7 and Git for Windows (the script runs a Bash helper).
- **macOS:** Zalo PC in `/Applications`, or set `ZALO_APP=/path/to/Zalo.app`.

## Run

::: code-group

```powershell [Windows]
pwsh scripts/zalo-pc/import.ps1
```

```bash [macOS]
scripts/zalo-pc/import.sh
```

:::

The script:

1. checks the bridge container, Beeper, `node` (and Git Bash on Windows);
2. (re)starts Zalo PC with a local debug port. It **asks before closing** a running Zalo PC;
3. lists your chats **by name** (pinned first, then by message count) and lets you pick: `1,3,5-8`, `groups`, `dms` or `all`;
4. imports the chosen chats one by one with live progress (see [Export and import](./manual#step-3-export-and-import)) and prints an OK / FAIL summary.

::: tip
Start with one chat (`-Chats` / `-c`) to check that everything works before you import everything.
:::

Re-running skips chats that are already done. Exports, `run.log` and `done.txt` are written to `work/`, which is gitignored because it holds your messages.

## Options

| Option                   | Windows (`import.ps1`)                     | macOS (`import.sh`)     |
| ------------------------ | ------------------------------------------ | ----------------------- |
| Chats, no picker         | `-Chats g123,4567`                         | `-c g123,4567`          |
| Backup media             | `-MediaDir /data/import-media`             | `-m /data/import-media` |
| Your Zalo uid            | `-OwnUid <uid>` (default: from bridge log) | `-u <uid>`              |
| Container name           | `-Container <name>`                        | `-n <name>`             |
| Docker instead of Podman | `-ContainerCli docker`                     | `-r docker`             |
| Work dir                 | `-WorkDir <dir>`                           | `-w <dir>`              |
| Zalo PC debug port       | `-CdpPort <port>` (default `9229`)         | `-p <port>`             |

A chat key is `g<groupId>` for a group or the peer's uid for a DM.

To include old photos and videos whose CDN links have expired, first [prepare media from a backup](./manual#step-2-optional-prepare-media-from-a-zalo-pc-backup) and pass its folder with `-MediaDir` / `-m`.

## When you are done

Restart Zalo PC normally to close the debug port, and delete `work/`. See [Security](../security#history-import).

If something fails, see [Troubleshooting](../troubleshooting#history-import).
