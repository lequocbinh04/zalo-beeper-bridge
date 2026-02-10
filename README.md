# mautrix-zalo

A Matrix-Zalo puppeting bridge built on [mautrix-go](https://github.com/mautrix/go) bridgev2.

## How it works

```
Matrix / Beeper  <-->  Go Bridge (bridgev2)  <--HTTP/WS-->  Node.js Sidecar (zca-js)  <-->  Zalo
```

The bridge runs as two processes:

- **Go bridge** — handles Matrix protocol, message storage, room management
- **Node.js sidecar** — wraps [zca-js](https://github.com/AKA-Starter/zca-js) for Zalo API access

They communicate via HTTP (outgoing actions) and WebSocket (incoming events).

## Features

| Feature | Zalo → Matrix | Matrix → Zalo |
|---------|:---:|:---:|
| Text messages | :white_check_mark: | :white_check_mark: |
| Images / GIFs | :white_check_mark: | :white_check_mark: |
| Stickers | :white_check_mark: | |
| Reactions | :white_check_mark: | :white_check_mark: |
| Message recall | :white_check_mark: | :white_check_mark: |
| Group chats | :white_check_mark: | :white_check_mark: |
| Direct messages | :white_check_mark: | :white_check_mark: |

## Setup

### Docker (recommended)

```bash
cp config.example.yaml config.yaml
# edit config.yaml with your homeserver details
docker compose up -d
```

### Manual

**Sidecar:**

```bash
cd sidecar
npm install
npm run build
npm start
```

**Bridge** (requires CGo):

```bash
CGO_ENABLED=1 go build -o mautrix-zalo ./cmd/mautrix-zalo/
./mautrix-zalo -c config.yaml
```

## Configuration

See [`config.example.yaml`](config.example.yaml) for all options. Key settings:

```yaml
sidecar_url: http://localhost:3500    # Node.js sidecar address

bridge:
  permissions:
    "@you:example.com": user          # who can use the bridge
```

## Login

Start a chat with the bridge bot and send:

```
login
```

Scan the QR code with your Zalo mobile app. The bridge will store session credentials for automatic reconnection.

## Project structure

```
├── cmd/mautrix-zalo/       # Go entry point
├── pkg/connector/          # bridgev2 implementation
│   ├── connector.go        #   NetworkConnector
│   ├── client.go           #   NetworkAPI
│   ├── login.go            #   QR login flow
│   ├── handle_remote.go    #   Zalo → Matrix messages
│   ├── handle_matrix.go    #   Matrix → Zalo messages
│   ├── handle_reaction.go  #   reactions (both ways)
│   ├── handle_redaction.go #   message recall (both ways)
│   └── ...
├── sidecar/
│   └── src/
│       ├── zalo-client.ts  #   zca-js wrapper
│       ├── server.ts       #   Fastify HTTP + WebSocket
│       ├── routes/         #   REST API handlers
│       └── events/         #   incoming event processors
├── Dockerfile
├── docker-compose.yml
└── config.example.yaml
```

## Disclaimer

This bridge uses an unofficial Zalo API. Use at your own risk — your account may be restricted. The bridge takes exclusive control of the Zalo session (single session per account).

## License

AGPL-3.0
