# Multiple Zalo accounts

One bridge serves one Zalo account. To bridge a second account, run a **second bridge** next to the first, with its own registration, config and data. One bridge serving several accounts is in preparation: the database already records which account owns each portal and message (see [Database schema](../reference/database)).

## Steps (container)

1. Register the second bridge under another name. The bot, the ghosts and the namespace follow the name: `sh-zalo2` gives bot `@sh-zalo2bot` and ghosts `@sh-zalo2_<uid>`. The bridge reads them from the registration.

   ```bash
   bbctl register -o registration.yaml sh-zalo2
   ```

   Set `url: http://localhost:29350` in it as for the first bridge. Each container has its own loopback, so both can use the same port.

2. Create `container-config-2/` with that `registration.yaml`, a `config.yaml` and `bbctl-config.json`, as described in [Container deployment](../deployment/container#_1-inputs-container-config-gitignored).

3. Add a second service with its own data volume to `compose.yaml`:

   ```yaml
   services:
     # zalo-bridge: … (the first bridge, unchanged)
     zalo-bridge-2:
       image: localhost/zalo-beeper-bridge:latest
       container_name: zalo-beeper-bridge-2
       restart: unless-stopped
       init: false
       volumes:
         - ./container-config-2:/config:ro
         - zalo-data-2:/data

   volumes:
     zalo-data:
     zalo-data-2:
   ```

4. Start it and log in:

   ```bash
   podman compose up -d        # or: docker compose up -d
   ```

   Then send `login` to `@sh-zalo2bot:beeper.local`.

Beeper shows the second bridge as a separate network. A contact you know from both accounts gets one ghost per bridge.

::: warning
Never run two bridges with the **same** registration. Beeper disconnects the first one.
:::

::: info Status
Running two bridges side by side has not yet been verified end to end with two live accounts.
:::

## The `accounts` command

[`accounts`](./bot-commands#accounts) lists every Zalo account a bridge has logged in to. If you `logout` and `login` with another account on the same bridge, both are listed, but only the logged-in one is bridged.
