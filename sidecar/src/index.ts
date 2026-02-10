// Main entry point for mautrix-zalo sidecar

import { ZaloClientWrapper } from "./zalo-client.js";
import { createServer } from "./server.js";

async function main() {
  // Read configuration from environment
  const port = parseInt(process.env.SIDECAR_PORT || "3500", 10);

  console.log("[Main] Starting mautrix-zalo sidecar...");
  console.log(`[Main] Port: ${port}`);

  // Create broadcast function placeholder
  let broadcastFn = (evt: any) => {
    console.warn("[Main] Broadcast called before server ready:", evt.type);
  };

  // Create Zalo client with broadcast function
  const zaloClient = new ZaloClientWrapper((evt) => broadcastFn(evt));

  // Create and start server
  const { app, broadcast } = await createServer(port, zaloClient);

  // Update broadcast function reference
  broadcastFn = broadcast;

  console.log("[Main] Sidecar started successfully");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Main] Received ${signal}, shutting down gracefully...`);

    try {
      zaloClient.disconnect();
      await app.close();
      console.log("[Main] Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[Main] Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Start the application
main().catch((error) => {
  console.error("[Main] Fatal error:", error);
  process.exit(1);
});
