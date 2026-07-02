// Phase 1 spike: QR login, persist credentials, log all listener events.
// Run: npm run spike:login  (scan QR with the Zalo phone app)
// Requires Node 22+ (runs .ts via native type stripping — no TS enums here).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { Zalo, LoginQRCallbackEventType, type API } from "zca-js";

const spikeDir = path.dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = path.join(spikeDir, "creds.session.json");
const EVENTS_PATH = path.join(spikeDir, "raw-events.ndjson");

// Raw event capture feeds Phase 3/4 schema design — keep everything.
function logEvent(kind: string, payload: unknown) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, payload });
  fs.appendFileSync(EVENTS_PATH, line + "\n");
}

async function login(): Promise<API> {
  const zalo = new Zalo();

  if (fs.existsSync(CREDS_PATH)) {
    console.log("Found saved credentials — trying cookie re-login (no QR)...");
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
    try {
      const api = await zalo.login(creds);
      console.log("✓ Cookie re-login OK");
      return api;
    } catch (err) {
      console.warn("Cookie re-login failed, falling back to QR:", (err as Error).message);
    }
  }

  const api = await zalo.loginQR({}, (event) => {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated: {
        // data.code is a token, NOT the QR payload — only the PNG zca-js renders is scannable
        const qrPath = path.join(spikeDir, "qr.png");
        Promise.resolve(event.actions.saveToFile(qrPath)).then(() => {
          execFile("open", [qrPath]); // macOS Preview
          console.log(`QR opened in Preview (${qrPath}) — scan with the Zalo app. Waiting...`);
        });
        break;
      }
      case LoginQRCallbackEventType.QRCodeScanned:
        console.log(`✓ Scanned by: ${event.data.display_name} — confirm on phone`);
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        console.log("QR expired — retrying...");
        event.actions.retry();
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        console.error("Login declined on phone. Aborting.");
        process.exit(1);
        break;
      case LoginQRCallbackEventType.GotLoginInfo: {
        // Exactly the Credentials shape zalo.login() needs on restart
        const { cookie, imei, userAgent } = event.data;
        fs.writeFileSync(CREDS_PATH, JSON.stringify({ cookie, imei, userAgent }, null, 2), { mode: 0o600 });
        console.log(`✓ Credentials saved to ${CREDS_PATH} (0600)`);
        break;
      }
    }
  });
  if (!api) throw new Error("loginQR returned null");
  return api;
}

const api = await login();
console.log("Own Zalo ID:", api.getOwnId());

const { listener } = api;

listener.on("connected", () => console.log("✓ Listener connected — send messages from another account now"));

listener.on("message", (message) => {
  logEvent("message", message);
  const d = message.data as Record<string, unknown>;
  // threadId + type tell DM vs group; content may be string (text) or object (media)
  const snippet = typeof d.content === "string" ? d.content.slice(0, 80) : `[${d.msgType}]`;
  console.log(`[msg] thread=${message.threadId} type=${message.type} from=${d.dName ?? d.uidFrom} msgType=${d.msgType}: ${snippet}`);
});

listener.on("group_event", (data: unknown) => { logEvent("group_event", data); console.log("[group_event]", (data as { type?: unknown }).type); });
listener.on("seen_messages", (data: unknown) => logEvent("seen_messages", data));
listener.on("delivered_messages", (data: unknown) => logEvent("delivered_messages", data));
listener.on("reaction", (data: unknown) => logEvent("reaction", data));
listener.on("undo", (data: unknown) => logEvent("undo", data));

// CloseReason 3000=DuplicateConnection (Zalo Web opened elsewhere), 3003=KickConnection
listener.on("closed", (code: unknown, reason: unknown) => {
  logEvent("closed", { code, reason });
  console.warn(`[closed] code=${code} reason=${reason} — note timestamp for stability report`);
});
listener.on("error", (error: unknown) => {
  logEvent("error", { message: (error as Error)?.message ?? String(error) });
  console.error("[error]", error);
});

listener.start();
console.log(`Listening. Raw events → ${EVENTS_PATH}. Ctrl-C to stop.`);
