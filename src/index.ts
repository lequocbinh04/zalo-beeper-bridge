// Entrypoint: load config → start appservice → route events.
import { loadConfig } from "./config.ts";
import { createBridge, startBridge } from "./matrix/appservice.ts";
import { handleBotEvent } from "./matrix/bot-commands.ts";

const config = loadConfig();

const bridge = createBridge(config, async (event) => {
  if (config.logging.level === "debug") {
    console.log(`[event] ${event.type} room=${event.room_id} sender=${event.sender}`);
  }
  await handleBotEvent(bridge, event);
  // Non-bot (portal room) traffic is handled from Phase 4/5 onward
});

await startBridge(bridge, config);
