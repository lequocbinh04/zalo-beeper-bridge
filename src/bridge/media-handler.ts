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
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`sticker download failed: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error("sticker exceeds size cap");
    const mimetype = response.headers.get("content-type")?.split(";")[0] ?? "image/webp";
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
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error(`photo download failed: HTTP ${response.status}`);

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`photo exceeds size cap (${declared} > ${maxBytes} bytes)`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`photo exceeds size cap (${buffer.byteLength} > ${maxBytes} bytes)`);

  const mimetype = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
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
