// Server setup - Fastify + WebSocket server

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "./zalo-client.js";
import type { BroadcastFn, WsEvent } from "./types.js";
import { loginRoutes } from "./routes/login.js";
import { messageRoutes } from "./routes/message.js";
import { userRoutes } from "./routes/user.js";
import { groupRoutes } from "./routes/group.js";

export async function createServer(
  port: number,
  zaloClient: ZaloClientWrapper
): Promise<{ app: FastifyInstance; broadcast: BroadcastFn }> {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // WebSocket clients set
  const wsClients = new Set<any>();

  // Broadcast function to send events to all connected WS clients
  const broadcast: BroadcastFn = (evt: WsEvent) => {
    const payload = JSON.stringify(evt);
    let sent = 0;
    let failed = 0;

    for (const client of wsClients) {
      try {
        if (client.socket.readyState === 1) {
          // OPEN state
          client.socket.send(payload);
          sent++;
        }
      } catch (error) {
        console.error("[Server] Failed to send to WebSocket client:", error);
        failed++;
      }
    }

    if (sent > 0 || failed > 0) {
      console.log(`[Server] Broadcast ${evt.type}: sent=${sent}, failed=${failed}`);
    }
  };

  // Swagger docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: "mautrix-zalo Sidecar API",
        description: "Node.js sidecar wrapping zca-js for Zalo API access",
        version: "1.0.0",
      },
      tags: [
        { name: "health", description: "Health check" },
        { name: "login", description: "Authentication" },
        { name: "message", description: "Send messages, reactions, undo" },
        { name: "user", description: "User info" },
        { name: "group", description: "Group info" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Register WebSocket plugin
  await app.register(websocket);

  // WebSocket endpoint
  app.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (connection, req) => {
      console.log("[Server] WebSocket client connected");
      wsClients.add(connection);

      connection.socket.on("message", (message: Buffer) => {
        console.log("[Server] WebSocket message received:", message.toString());
      });

      connection.socket.on("close", () => {
        console.log("[Server] WebSocket client disconnected");
        wsClients.delete(connection);
      });

      connection.socket.on("error", (error: Error) => {
        console.error("[Server] WebSocket error:", error);
        wsClients.delete(connection);
      });

      // Send welcome message
      connection.socket.send(
        JSON.stringify({
          type: "connection",
          data: { message: "Connected to mautrix-zalo sidecar" },
          timestamp: Date.now(),
        })
      );
    });
  });

  // Health check
  app.get("/health", {
    schema: {
      tags: ["health"],
      summary: "Health check",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "number" },
            loggedIn: { type: "boolean" },
          },
        },
      },
    },
  }, async (request, reply) => {
    return reply.send({
      status: "ok",
      timestamp: Date.now(),
      loggedIn: zaloClient.isLoggedIn(),
    });
  });

  // Register route modules
  await app.register(loginRoutes, { zaloClient });
  await app.register(messageRoutes, { zaloClient });
  await app.register(userRoutes, { zaloClient });
  await app.register(groupRoutes, { zaloClient });

  // Start server
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`[Server] Sidecar listening on http://0.0.0.0:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return { app, broadcast };
}
