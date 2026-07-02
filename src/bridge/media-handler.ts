// Inbound media pipeline: Zalo CDN URL → download → Matrix content repo → m.image.
// Phase 1 verified the CDN is public (no session headers), but URLs may expire —
// always download immediately on event receipt.
import type { Intent } from "matrix-appservice-bridge";

export interface InboundPhoto {
  url: string;
  width?: number;
  height?: number;
}

export interface MediaResult {
  eventId: string;
}

const FETCH_TIMEOUT_MS = 30_000;
// Media URLs come from message payloads (contact-influenced input) — restrict
// to Zalo CDN hosts over https to close SSRF toward localhost/LAN.
const ALLOWED_HOST_SUFFIXES = [".zdn.vn", ".zadn.vn"];

export interface FetchedMedia {
  buffer: Buffer;
  mimetype: string;
}

/** Guarded download: https-only, Zalo CDN hosts, hard timeout, streamed byte cap. */
export async function fetchMediaCapped(url: string, maxBytes: number): Promise<FetchedMedia> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`refusing non-https media URL (${parsed.protocol})`);
  if (!ALLOWED_HOST_SUFFIXES.some((s) => parsed.hostname.endsWith(s))) {
    throw new Error(`refusing media host outside Zalo CDN (${parsed.hostname})`);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`media download failed: HTTP ${response.status}`);
  if (!response.body) throw new Error("media download returned no body");

  // Stream with a cap — content-length can be spoofed, never trust it for allocation
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error(`media exceeds size cap (>${maxBytes} bytes)`);
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    mimetype: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
  };
}

// Sticker mxc cache — the same sticker id is sent many times; upload once per run
const stickerMxcCache = new Map<number, { mxc: string; mimetype: string; size: number }>();

/** Renders a Zalo sticker as a native Matrix m.sticker event. */
export async function bridgeInboundSticker(
  intent: Intent,
  roomId: string,
  stickerId: number,
  imageUrl: string,
  maxBytes: number,
): Promise<MediaResult> {
  let cached = stickerMxcCache.get(stickerId);
  if (!cached) {
    const { buffer, mimetype } = await fetchMediaCapped(imageUrl, maxBytes);
    const mxc = await intent.uploadContent(buffer, { type: mimetype, name: `zalo-sticker-${stickerId}` });
    cached = { mxc, mimetype, size: buffer.byteLength };
    stickerMxcCache.set(stickerId, cached);
  }
  const { event_id } = await intent.sendEvent(roomId, "m.sticker", {
    body: "sticker",
    url: cached.mxc,
    info: { mimetype: cached.mimetype, size: cached.size },
  });
  return { eventId: event_id };
}

export async function bridgeInboundPhoto(
  intent: Intent,
  roomId: string,
  photo: InboundPhoto,
  maxBytes: number,
): Promise<MediaResult> {
  const { buffer, mimetype } = await fetchMediaCapped(photo.url, maxBytes);
  const mxcUrl = await intent.uploadContent(buffer, { type: mimetype, name: "zalo-photo" });
  const { event_id } = await intent.sendMessage(roomId, {
    msgtype: "m.image",
    body: "photo",
    url: mxcUrl,
    info: {
      mimetype,
      size: buffer.byteLength,
      ...(photo.width ? { w: photo.width } : {}),
      ...(photo.height ? { h: photo.height } : {}),
    },
  });
  return { eventId: event_id };
}
