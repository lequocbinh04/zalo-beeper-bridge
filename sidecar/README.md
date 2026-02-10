# Mautrix-Zalo Sidecar

Node.js/TypeScript sidecar service that bridges mautrix-zalo (Python) with the Zalo API via zca-js.

## Architecture

- **Fastify HTTP server** - REST API for sending messages, reactions, etc.
- **WebSocket server** - Real-time event streaming to mautrix-zalo
- **zca-js wrapper** - Manages Zalo API interactions and event listeners

## Installation

```bash
npm install
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Type check without compiling
npm run typecheck

# Build for production
npm run build
```

## Production

```bash
# Build and run
npm run build
npm start
```

## Environment Variables

- `SIDECAR_PORT` - HTTP/WebSocket server port (default: 3500)

## API Endpoints

### Authentication
- `POST /login/qr` - Initiate QR code login
- `POST /login/cookie` - Restore session with cookie
- `POST /logout` - Disconnect from Zalo

### Messages
- `POST /send/text` - Send text message
- `POST /send/image` - Send image
- `POST /send/sticker` - Send sticker
- `POST /send/reaction` - Add reaction to message
- `POST /send/undo` - Delete/undo message

### User Info
- `GET /user/:id` - Get user profile
- `GET /self` - Get own profile

### Group Info
- `GET /group/:id` - Get group info
- `GET /groups` - List groups (not yet implemented)

### WebSocket
- `GET /ws` - WebSocket connection for real-time events

### Health
- `GET /health` - Health check endpoint

## WebSocket Events

Events are broadcast as JSON with this structure:

```json
{
  "type": "message" | "reaction" | "undo" | "group_event",
  "data": { ... },
  "timestamp": 1234567890
}
```

### Event Types

- **message** - Incoming message (text, image, sticker)
- **reaction** - Message reaction added/removed
- **undo** - Message deleted
- **group_event** - Group membership changes, etc.

## Project Structure

```
sidecar/
├── src/
│   ├── events/              # Event handlers
│   │   ├── message-handler.ts
│   │   ├── reaction-handler.ts
│   │   ├── undo-handler.ts
│   │   └── group-handler.ts
│   ├── routes/              # API route modules
│   │   ├── login.ts
│   │   ├── message.ts
│   │   ├── user.ts
│   │   └── group.ts
│   ├── zalo-client.ts       # Zalo API wrapper
│   ├── server.ts            # Fastify server setup
│   ├── types.ts             # TypeScript types
│   ├── zca-js.d.ts          # Type declarations for zca-js
│   └── index.ts             # Entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Notes

- Uses ES modules (`"type": "module"`)
- Requires Node.js 18+ for native fetch support
- Discovery logging enabled for reaction/undo/group events
- Custom type declarations for zca-js package
