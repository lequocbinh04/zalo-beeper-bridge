# Database schema

The bridge keeps its state in one SQLite file, `bridge.db` (in `/data` in the container). It is opened with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) in WAL mode by `src/bridge/mapping-store.ts`. The history importer opens the same file.

The database holds **ids and mappings only**: which Matrix room belongs to which Zalo chat, which ghost belongs to which Zalo user, and which Matrix event belongs to which Zalo message. It does not store message text or media.

## Tables

### `portal`

One row per bridged Zalo chat (DM or group).

| Column        | Type    | Notes                                               |
| ------------- | ------- | --------------------------------------------------- |
| `thread_id`   | TEXT PK | Zalo thread id: the peer uid for a DM, the group id |
| `thread_type` | TEXT    | `user` or `group`                                   |
| `room_id`     | TEXT    | Matrix room id, unique                              |
| `name`        | TEXT    | Last known chat name                                |
| `created_at`  | INTEGER | Unix ms                                             |
| `account_id`  | TEXT    | Zalo uid of the account the chat belongs to (v7)    |

### `puppet`

One row per Zalo user that has a Matrix ghost.

| Column               | Type    | Notes                                                     |
| -------------------- | ------- | --------------------------------------------------------- |
| `zalo_uid`           | TEXT PK | Zalo user id                                              |
| `mxid`               | TEXT    | Ghost user id, e.g. `@sh-zalo_<uid>:beeper.local`, unique |
| `display_name`       | TEXT    | Last name set on the ghost                                |
| `updated_at`         | INTEGER | Unix ms                                                   |
| `avatar_url`         | TEXT    | Zalo avatar URL last synced to the ghost (v2)             |
| `profile_checked_at` | INTEGER | Last profile repair lookup (v6)                           |

### `message`

One row per bridged message, in either direction. Used for de-duplication, echo suppression, replies, edits, reactions, recalls and read receipts.

| Column        | Type    | Notes                                                         |
| ------------- | ------- | ------------------------------------------------------------- |
| `zalo_msg_id` | TEXT PK | Zalo message id                                               |
| `room_id`     | TEXT    | Matrix room id                                                |
| `event_id`    | TEXT    | Matrix event id, unique                                       |
| `direction`   | TEXT    | `inbound` (Zalo → Beeper) or `outbound` (Beeper → Zalo)       |
| `ts`          | INTEGER | Unix ms                                                       |
| `quote_json`  | TEXT    | What Zalo needs to quote this message in a reply (v3)         |
| `cli_msg_id`  | TEXT    | Zalo client message id, needed for reactions and recalls (v4) |
| `sender_id`   | TEXT    | Zalo uid of the sender (v5)                                   |
| `msg_type`    | TEXT    | Zalo message type, needed for "seen" events (v5)              |
| `account_id`  | TEXT    | Zalo uid of the account (v7)                                  |

### `account`

One row per Zalo account the bridge has logged in to (v7). Listed by the [`accounts`](../guide/bot-commands#accounts) command.

| Column          | Type    | Notes                                  |
| --------------- | ------- | -------------------------------------- |
| `zalo_uid`      | TEXT PK | Zalo user id of the account            |
| `creds_path`    | TEXT    | Path of its encrypted credentials file |
| `added_at`      | INTEGER | Unix ms                                |
| `last_login_at` | INTEGER | Unix ms                                |

### `reaction`

One row per reaction bridged in either direction (v8), so a reaction removed on one side can be removed on the other.

| Column          | Type    | Notes                              |
| --------------- | ------- | ---------------------------------- |
| `event_id`      | TEXT PK | Matrix reaction event id           |
| `room_id`       | TEXT    | Matrix room id                     |
| `target_msg_id` | TEXT    | Zalo message id the reaction is on |
| `sender_id`     | TEXT    | Zalo uid of the reacting user      |
| `zalo_icon`     | TEXT    | Zalo reaction icon code            |
| `ts`            | INTEGER | Unix ms                            |

Index `reaction_target (target_msg_id, sender_id)`. `message` also has a partial index on rows without an `account_id`, used when those rows are assigned to an account.

## Migrations

The schema version is stored in `PRAGMA user_version`. The current version is **8**.

| Version | Change                                                            |
| ------- | ----------------------------------------------------------------- |
| 1       | `portal`, `puppet`, `message`                                     |
| 2       | `puppet.avatar_url`                                               |
| 3       | `message.quote_json`                                              |
| 4       | `message.cli_msg_id`                                              |
| 5       | `message.sender_id`, `message.msg_type`                           |
| 6       | `puppet.profile_checked_at`                                       |
| 7       | `account` table, `portal.account_id`, `message.account_id`, index |
| 8       | `reaction` table and index                                        |

Migrations run at start-up inside one `BEGIN IMMEDIATE` transaction that re-reads the version first. If the bridge and the importer open an old database at the same time, only one of them migrates, and a crash halfway leaves the database at the old version with no partial changes.

Every migration only **adds** tables, columns or indexes. An older bridge version therefore still runs on a newer database, which makes rolling back an image safe (see [Operations](../deployment/operations#rollback)).

## Inspecting it

Stop the bridge or work on a copy, then:

```bash
sqlite3 bridge.db 'PRAGMA user_version;'
sqlite3 bridge.db 'SELECT thread_type, count(*) FROM portal GROUP BY thread_type;'
```

After a Zalo login the bridge logs `[bridge] account <uid>: N portals, N messages assigned` when it tags older rows with the logged-in account.
