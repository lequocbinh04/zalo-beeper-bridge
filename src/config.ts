// Zod-validated loader for config.yaml — fail fast with a clear message.
import fs from "node:fs";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const configSchema = z.object({
  matrix: z.object({
    // Values printed by `bbctl register sh-zalo`
    homeserverUrl: z.url(),
    domain: z.string().min(1),
    registrationPath: z.string().min(1),
    // Must match the port in registration.yaml `url:` (bbctl proxy forwards here)
    port: z.number().int().positive(),
    // Only this MXID may issue bot commands (single-user bridge)
    owner: z.string().regex(/^@.+:.+$/, "must be a full Matrix ID like @user:beeper.com"),
  }),
  zalo: z.object({
    credsPath: z.string().min(1).default("zalo-creds.session.json"),
    // Token-bucket pacing: `burst` sends go through instantly (normal chatting),
    // then refills at messagesPerMinute. Protects the main account from sustained spam
    // without adding latency to real conversations.
    messagesPerMinute: z.number().positive().max(240).default(60),
    burst: z.number().int().positive().max(120).default(30),
  }).default({ credsPath: "zalo-creds.session.json", messagesPerMinute: 60, burst: 30 }),
  bridge: z.object({
    dbPath: z.string().min(1).default("bridge.db"),
    mediaMaxBytes: z.number().int().positive().default(10 * 1024 * 1024),
  }).default({ dbPath: "bridge.db", mediaMaxBytes: 10 * 1024 * 1024 }),
  // How the bridge presents itself as a network in Beeper (bot name + logo + chat network chip)
  network: z.object({
    name: z.string().min(1).default("Zalo"),
    logoPath: z.string().min(1).default("assets/zalo-logo.png"),
  }).default({ name: "Zalo", logoPath: "assets/zalo-logo.png" }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }).default({ level: "info" }),
});

export type BridgeConfig = z.infer<typeof configSchema>;

export function loadConfig(path = "config.yaml"): BridgeConfig {
  if (!fs.existsSync(path)) {
    throw new Error(`Missing ${path} — copy config.yaml.example and fill in values from 'bbctl register sh-zalo'`);
  }
  const parsed = configSchema.safeParse(loadYaml(fs.readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}
