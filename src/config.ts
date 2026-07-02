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
  }),
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
