# Manual steps

This page describes what the [quick-start scripts](./quick-start) automate. Use it to understand the process or to run single steps yourself.

## Step 1: Run Zalo PC with a local debug port {#step-1-run-zalo-pc-with-a-local-debug-port}

The tools read Zalo PC's own, already decrypted data over the Chrome DevTools Protocol on `127.0.0.1` only. Quit Zalo PC completely, then start it with:

::: code-group

```powershell [Windows]
& "$env:LOCALAPPDATA\Programs\Zalo\Zalo-<version>\Zalo.exe" --remote-debugging-port=9229
```

```bash [macOS]
open -a Zalo --args --remote-debugging-port=9229
```

:::

The tools find it at `http://127.0.0.1:9229`; set `ZALO_CDP_URL` to use another address.

## Step 2 (optional): Prepare media from a Zalo PC backup {#step-2-optional-prepare-media-from-a-zalo-pc-backup}

Do this when you want old photos, videos and files whose Zalo CDN links have expired.

Create the backup in Zalo PC: **Cài đặt → Sao lưu & đồng bộ → Xuất dữ liệu** (Settings → Backup & sync → Export data). It produces `backup_zalo_<date>.zl.zip`, a tar stream encrypted with AES-256-CBC:

- key = SHA-256 of the session UIN (the login `dkey`),
- IV = `"zie"` + the first 13 characters of the UIN.

The UIN is only available from the running, logged-in Zalo PC that made the backup.

```bash
npm install          # dev dependencies (@jsquash JPEG XL / JPEG codecs)

# 1. Read the backup key. SECRET: anyone holding it can decrypt your backups.
node scripts/zalo-pc/get-uin.mjs > ~/zalo-uin.txt

# 2. Check the key, then extract database and media (the backup file is only read)
node scripts/zalo-pc/backup-extract.mjs backup_zalo_22_10_2026.zl.zip ~/zalo-uin.txt work/backup --peek
node scripts/zalo-pc/backup-extract.mjs backup_zalo_22_10_2026.zl.zip ~/zalo-uin.txt work/backup --all
rm ~/zalo-uin.txt

# 3. Map media files to messages, decode obfuscated files, convert JPEG XL to JPEG
node scripts/zalo-pc/backup-media.mjs work/backup/<yourZaloUid>/ZaloDownloads <yourZaloUid> work/media
```

`<yourZaloUid>` is the top-level folder inside the extracted backup. `backup-media.mjs` writes `work/media/<msgId>.<ext>` and `work/media/media-index.json`. Files it cannot read (for example Intune-encrypted attachments) are skipped and fall back to a text line.

Copy the folder into the container:

```bash
tar -C work/media -cf - . | podman exec -i zalo-beeper-bridge sh -c 'mkdir -p /data/import-media && tar -C /data/import-media -xf - && chown -R node:node /data/import-media'
```

## Step 3: Export and import {#step-3-export-and-import}

`scripts/zalo-pc/migrate-all.sh` works chat by chat: a fresh export of the chat from Zalo PC, then the importer with `--rebuild --remove-old` inside the container.

- It waits while Beeper or Zalo PC is unreachable.
- It records `OK <key>` or `FAIL <key>` in `<workDir>/done.txt` and skips chats that are already OK on a re-run.
- A failed chat keeps its old room and can simply be run again.

```bash
# order.txt: one chat key per line, "g<groupId>" for groups, the peer uid for DMs.
# Get every key with an export first:
node scripts/zalo-pc/export-cdp.mjs work/export
ls work/export/*.ndjson | xargs -n1 basename | sed 's/\.ndjson$//' > work/order.txt   # reorder as you like

scripts/zalo-pc/migrate-all.sh work work/order.txt <yourZaloUid> /data/import-media
tail -f work/run.log
```

The script runs the importer baked into the image (`/app/src/tools/import-zalo-export.ts`). Rebuild the image after you update the code.

## Tools in `scripts/zalo-pc/`

| Script               | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `import.ps1`         | One-command import on Windows                                            |
| `import.sh`          | One-command import on macOS                                              |
| `migrate-all.sh`     | Export and import chat by chat, with `done.txt` and `run.log`            |
| `export-cdp.mjs`     | Export chats from Zalo PC as NDJSON over the debug port                  |
| `get-uin.mjs`        | Read the backup key from the running Zalo PC                             |
| `backup-extract.mjs` | Decrypt and extract a `.zl.zip` backup (`--peek` to check the key first) |
| `backup-media.mjs`   | Map backup media to message ids and convert it                           |
| `cdp.mjs`            | Shared DevTools client (uses `ZALO_CDP_URL`)                             |
