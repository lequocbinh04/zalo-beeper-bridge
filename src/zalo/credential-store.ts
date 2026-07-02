// Persist zca-js Credentials ({cookie, imei, userAgent}) with 0600 perms and atomic writes.
import fs from "node:fs";
import path from "node:path";
import type { Credentials } from "zca-js";

export function loadCredentials(credsPath: string): Credentials | null {
  if (!fs.existsSync(credsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(credsPath, "utf8")) as Credentials;
  } catch {
    console.warn(`Corrupt credentials file at ${credsPath} — ignoring`);
    return null;
  }
}

export function saveCredentials(credsPath: string, creds: Credentials): void {
  const tmp = path.join(path.dirname(credsPath), `.${path.basename(credsPath)}.tmp`);
  fs.rmSync(tmp, { force: true }); // mode: only applies on creation — never reuse a stale tmp
  fs.writeFileSync(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, credsPath);
}

export function clearCredentials(credsPath: string): void {
  fs.rmSync(credsPath, { force: true });
}
