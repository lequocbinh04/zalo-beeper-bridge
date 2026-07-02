// Persist zca-js Credentials ({cookie, imei, userAgent}) encrypted at rest.
// A leaked plaintext session = full Zalo account takeover, so we AES-256-GCM the
// file with a key kept in a sibling 0600 key file (auto-generated once).
// Legacy plaintext JSON files are transparently read and re-encrypted on next save.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Credentials } from "zca-js";

const MAGIC = "ZBENC1"; // marks an encrypted payload vs legacy plaintext JSON

function keyPathFor(credsPath: string): string {
  return path.join(path.dirname(credsPath), `.${path.basename(credsPath)}.key`);
}

function loadOrCreateKey(credsPath: string): Buffer {
  const keyPath = keyPathFor(credsPath);
  if (fs.existsSync(keyPath)) return Buffer.from(fs.readFileSync(keyPath, "utf8"), "base64");
  const key = crypto.randomBytes(32);
  const tmp = `${keyPath}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, key.toString("base64"), { mode: 0o600 });
  fs.renameSync(tmp, keyPath);
  return key;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${MAGIC}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(payload: string, key: Buffer): string {
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString("utf8");
}

export function loadCredentials(credsPath: string): Credentials | null {
  if (!fs.existsSync(credsPath)) return null;
  const raw = fs.readFileSync(credsPath, "utf8");
  try {
    if (raw.startsWith(`${MAGIC}:`)) {
      return JSON.parse(decrypt(raw, loadOrCreateKey(credsPath))) as Credentials;
    }
    return JSON.parse(raw) as Credentials; // legacy plaintext — re-encrypted on next save
  } catch {
    console.warn(`Corrupt or undecryptable credentials at ${credsPath} — ignoring`);
    return null;
  }
}

export function saveCredentials(credsPath: string, creds: Credentials): void {
  const payload = encrypt(JSON.stringify(creds), loadOrCreateKey(credsPath));
  const tmp = path.join(path.dirname(credsPath), `.${path.basename(credsPath)}.tmp`);
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, payload, { mode: 0o600 });
  fs.renameSync(tmp, credsPath);
}

export function clearCredentials(credsPath: string): void {
  fs.rmSync(credsPath, { force: true });
  fs.rmSync(keyPathFor(credsPath), { force: true });
}
