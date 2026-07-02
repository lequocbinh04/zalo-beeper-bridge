// Phase 1 spike: re-login from saved credentials (no QR) and send a text.
// Run: npm run spike:send -- <threadId> <user|group> "text to send"
// Get threadId from spike:login console output ([msg] thread=...).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo, ThreadType } from "zca-js";

const spikeDir = path.dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = path.join(spikeDir, "creds.session.json");

const [threadId, threadTypeArg, ...textParts] = process.argv.slice(2);
if (!threadId || !threadTypeArg || textParts.length === 0) {
  console.error('Usage: npm run spike:send -- <threadId> <user|group> "text"');
  process.exit(1);
}
const threadType = threadTypeArg === "group" ? ThreadType.Group : ThreadType.User;
const text = textParts.join(" ");

if (!fs.existsSync(CREDS_PATH)) {
  console.error(`No ${CREDS_PATH} — run spike:login first.`);
  process.exit(1);
}
const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));

const zalo = new Zalo();
console.log("Logging in from saved cookies (no QR)...");
const api = await zalo.login(creds);
console.log("✓ Re-login OK. Own ID:", api.getOwnId());

const result = await api.sendMessage(text, threadId, threadType);
console.log("✓ Sent. msgId:", result.message?.msgId, "— verify it arrived on the phone");
