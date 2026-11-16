# Getting started

This page takes you from nothing to a working bridge. It takes about 15 minutes.

::: tip Recommended: run it in a container
For a bridge that runs 24/7, follow [Container deployment](../deployment/container) after step 2. The container runs both processes for you, keeps state on a volume and restarts on failure. The steps below show the plain Node setup, which is also what you use for development.
:::

## Requirements

- macOS or Linux. On Windows, use the [container](../deployment/container) with Docker or Podman.
- [Node.js](https://nodejs.org/) **22.18 or newer**. It runs the TypeScript sources directly, so there is no build step. The container image ships Node 24.
- A [Beeper](https://www.beeper.com/) account and [bbctl](https://github.com/beeper/bridge-manager).
- `ffmpeg`, used to re-encode voice notes sent from Beeper. bbctl also needs Python 3.
- A Zalo account you can log in to by scanning a QR code with the Zalo phone app.

::: danger Account risk
zca-js reverse-engineers Zalo Web. Zalo can lock or ban an account that uses it. Consider a secondary account.
:::

## 1. Install bbctl and register the bridge

```bash
# Install bbctl (macOS arm64 shown; pick the binary for your platform from the releases page)
curl -sL -o ~/.local/bin/bbctl \
  https://github.com/beeper/bridge-manager/releases/latest/download/bbctl-macos-arm64
chmod +x ~/.local/bin/bbctl

bbctl login                                # log in to your Beeper account
bbctl register -o registration.yaml sh-zalo
```

`sh-zalo` is the bridge name. Beeper derives everything else from it: the bot is `@sh-zalobot:beeper.local` and Zalo contacts become ghosts named `@sh-zalo_<zalo uid>:beeper.local`. The bridge reads these names from `registration.yaml`, so another name works too.

Open the generated `registration.yaml` and set `url` to the port the bridge will listen on:

```yaml
url: http://localhost:29350
```

::: warning Keep these files private
`registration.yaml` holds the appservice tokens. Never commit or share it. It is already in `.gitignore`.
:::

## 2. Configure the bridge

```bash
git clone https://github.com/lethucthanhtu/zalo-beeper-bridge.git
cd zalo-beeper-bridge
npm ci
cp config.yaml.example config.yaml
```

Fill in `config.yaml` with the values `bbctl register` printed:

```yaml
matrix:
  homeserverUrl: https://matrix.beeper.com/_hungryserv/<your-beeper-username>
  domain: beeper.local
  registrationPath: registration.yaml
  port: 29350 # must match the port in registration.yaml's url
  owner: '@<your-beeper-username>:beeper.com' # the only user allowed to give bot commands
```

The other sections are optional. [Configuration](./configuration) lists every option.

## 3. Run the bridge and the proxy

The appservice and `bbctl proxy` must run at the same time. Use two terminals or a process manager:

```bash
npm run dev                         # the appservice on localhost:29350
bbctl proxy -r registration.yaml    # connects Beeper to the appservice over a websocket
```

A healthy start logs `Appservice listening on localhost:29350` and, on the first run, `[zalo] no valid saved credentials — send 'login'`.

::: warning One instance per registration
Never run two bridges or two proxies with the same registration (for example `npm run dev` while a container is running). The second one kicks the first, and the two Zalo listeners keep disconnecting each other.
:::

## 4. Log in to Zalo

1. In Beeper, start a chat with `@sh-zalobot:beeper.local`. The bot joins when you invite it and answers with its command list.
2. Send `login`.
3. The bot posts a QR code. Scan it with the Zalo app on your phone and confirm the login there.
4. The bot answers `✓ Logged in to Zalo (uid …), listener started.`

Now message the account from another Zalo user: the chat appears in Beeper. The session is saved encrypted, so restarts log in again without a new QR code.

## 5. Create rooms for existing chats

New rooms are created automatically when a message arrives. To create rooms for your pinned chats and every group straight away, send `sync` to the bot. See [Bot commands](./bot-commands#sync).

::: info Only one Zalo Web session
Zalo allows one web session per account. If you open Zalo Web in a browser while the bridge runs, the bridge is kicked. You can keep using the phone app and Zalo PC.
:::

## Next steps

- Run it 24/7: [Container](../deployment/container) or [macOS launchd](../deployment/macos-launchd).
- Bring over your old messages: [History import](../history-import/).
- Learn what is bridged and what is not: [Features](./features).
