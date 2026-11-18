// Websocket frame tap in front of the zca-js listener.
//
// Zalo delivers 1-1 messages of accounts in its E2EE rollout as cmd 551 instead of
// 501 (Zalo Web: SignalCommands.MSG.RECEIVE_ONEONE). zca-js only handles 501, so
// those DMs were dropped silently — the listener looked "connected" but no DM ever
// arrived. The payload envelope is identical, so rewriting the header cmd to 501
// routes them through the normal DM handler (zca-js PR #384, closed unmerged).
// zca-js 2.3.0 handles cmd 551 itself ([501, 551].includes(cmd)), so the rewrite is
// now redundant but harmless; it stays until 2.3.0 is proven on a live account.
// Unknown cmds are logged once each so future protocol drift is visible.
import { errorMessage } from '../error-message.ts';

// version(u8) | cmd(u16 LE) | subCmd(i8) — mirrors zca-js listen.js getHeader
const HEADER_BYTES = 4;
const E2EE_DM_CMD = 551;
const DM_CMD = 501;
// Every cmd zca-js 2.3.0 listen.js handles (551 included)
const KNOWN_CMDS = new Set([1, 2, 501, 502, 510, 511, 521, 522, 551, 601, 602, 610, 611, 612, 3000]);

/**
 * Decodes the 4-byte binary header of a Zalo websocket frame.
 *
 * @returns version / cmd / subCmd, or null when the frame is shorter than a header
 */
export function readHeader(frame: Buffer): { version: number; cmd: number; subCmd: number } | null {
  if (frame.byteLength < HEADER_BYTES) return null;
  return { version: frame[0]!, cmd: frame.readUInt16LE(1), subCmd: frame[3]! };
}

/**
 * Returns the frame to hand to zca-js (a rewritten copy for E2EE DM pushes).
 * Only version-1 / cmd-551 / subCmd-0 frames are rewritten (cmd → 501); the input
 * buffer is never mutated and every other frame is returned as-is.
 */
export function rerouteFrame(frame: Buffer): Buffer {
  const header = readHeader(frame);
  if (!header || header.version !== 1 || header.cmd !== E2EE_DM_CMD || header.subCmd !== 0) return frame;
  const copy = Buffer.from(frame);
  copy.writeUInt16LE(DM_CMD, 1);
  return copy;
}

// ZALO_WS_TRACE=1 logs every frame header (cmd/subCmd/size only, never content)
const TRACE = process.env.ZALO_WS_TRACE === '1';

/**
 * Structure of a decoded payload — key names, types and array sizes, never values.
 * Used to diagnose unknown cmds in logs without leaking message content.
 *
 * @param depth how many object/array levels to expand before printing `{…}`
 */
function describeShape(value: unknown, depth = 3): string {
  if (Array.isArray(value))
    return `[${value.length}]${value.length && depth > 0 ? describeShape(value[0], depth - 1) : ''}`;
  if (value && typeof value === 'object') {
    if (depth <= 0) return '{…}';
    return `{${Object.entries(value)
      .map(([key, nestedValue]) => `${key}:${describeShape(nestedValue, depth - 1)}`)
      .join(',')}}`;
  }
  return typeof value;
}

/**
 * Decodes a frame body's `data` field. Mirrors zca-js utils.decodeEventData (not
 * exported by the package): encrypt 0 = plain JSON, 1 = base64 JSON; any other value
 * = URI-encoded base64, AES-GCM decrypted (iv | aad | ciphertext) when the session
 * key is known, and for 2/3 gunzipped when compressed. Only used for trace diagnostics.
 *
 * @param body parsed frame body (returned unchanged when it has no string data / numeric encrypt)
 * @param cipherKey base64 session key from the listener (absent before `cipher_key`)
 * @throws on invalid JSON, base64 or AES-GCM authentication failure
 */
async function decodePayload(
  body: { data?: unknown; encrypt?: unknown },
  cipherKey: string | undefined,
): Promise<unknown> {
  if (typeof body.data !== 'string' || typeof body.encrypt !== 'number') return body;
  if (body.encrypt === 0) return JSON.parse(body.data);
  let payloadBytes: Buffer = Buffer.from(body.encrypt === 1 ? body.data : decodeURIComponent(body.data), 'base64');
  if (body.encrypt !== 1 && cipherKey && payloadBytes.length >= 48) {
    const bytes = new Uint8Array(payloadBytes);
    const algorithm = { name: 'AES-GCM', iv: bytes.slice(0, 16), tagLength: 128, additionalData: bytes.slice(16, 32) };
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.from(cipherKey, 'base64')),
      algorithm,
      false,
      ['decrypt'],
    );
    payloadBytes = Buffer.from(await crypto.subtle.decrypt(algorithm, key, bytes.slice(32)));
  }
  if (body.encrypt === 2 || body.encrypt === 3) {
    const { gunzipSync } = await import('node:zlib');
    try {
      payloadBytes = gunzipSync(payloadBytes);
    } catch {
      // not compressed
    }
  }
  return JSON.parse(payloadBytes.toString('utf8'));
}

type WsLike = { onmessage: ((event: { data: unknown }) => unknown) | null };
const tappedSockets = new WeakSet<object>();
const reportedCmds = new Set<number>();

/**
 * Wraps the listener's current websocket (call on every "connected" — zca-js opens a new ws per (re)connect).
 * Replaces `ws.onmessage` with a wrapper that reroutes E2EE DM frames, logs each
 * unknown cmd once (plus its payload shape / server error when ZALO_WS_TRACE=1) and
 * then delegates to zca-js's original handler. Idempotent per websocket; a no-op
 * when the listener has no socket or no handler yet.
 *
 * @param listener the zca-js Listener (reads its private `ws` and `cipherKey` fields)
 */
export function installFrameTap(listener: unknown): void {
  const ws = (listener as { ws?: WsLike | null }).ws;
  if (!ws || tappedSockets.has(ws) || typeof ws.onmessage !== 'function') return;
  tappedSockets.add(ws);
  const original = ws.onmessage;
  ws.onmessage = (event) => {
    const { data } = event;
    if (!(data instanceof Buffer)) return original.call(ws, event);
    const header = readHeader(data);
    if (TRACE && header) console.log(`[zalo:ws] cmd=${header.cmd} sub=${header.subCmd} bytes=${data.byteLength}`);
    if (header && !KNOWN_CMDS.has(header.cmd) && !reportedCmds.has(header.cmd)) {
      reportedCmds.add(header.cmd);
      console.log(`[zalo] unhandled ws cmd ${header.cmd} (subCmd ${header.subCmd}) — not bridged`);
      if (TRACE) {
        const cipherKey = (listener as { cipherKey?: string }).cipherKey;
        void (async () =>
          JSON.parse(data.subarray(HEADER_BYTES).toString('utf8')) as { data?: unknown; encrypt?: unknown })()
          .then((body) => decodePayload(body, cipherKey))
          .then((decoded) => {
            console.log(`[zalo:ws] cmd ${header.cmd} shape: ${describeShape(decoded)}`);
            // Server error frames carry only a code + message (no user content) — log them
            const errorFrame = decoded as {
              error_code?: unknown;
              error_message?: unknown;
              data?: { error_code?: unknown; error_message?: unknown };
            };
            if (errorFrame && typeof errorFrame === 'object' && 'error_code' in errorFrame) {
              console.log(
                `[zalo:ws] cmd ${header.cmd} error ${String(errorFrame.error_code)} "${String(errorFrame.error_message)}" / inner ${String(errorFrame.data?.error_code)} "${String(errorFrame.data?.error_message)}"`,
              );
            }
          })
          .catch((err: unknown) => console.log(`[zalo:ws] cmd ${header.cmd} undecodable: ${errorMessage(err)}`));
      }
    }
    if (header?.cmd === E2EE_DM_CMD && !reportedCmds.has(E2EE_DM_CMD)) {
      reportedCmds.add(E2EE_DM_CMD);
      console.log('[zalo] E2EE DM push (cmd 551) seen — rerouting to the DM handler');
    }
    return original.call(ws, { ...event, data: rerouteFrame(data) });
  };
}
