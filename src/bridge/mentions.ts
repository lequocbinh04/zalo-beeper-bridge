// Bridges @mentions both directions between Zalo (uid + pos/len in text) and
// Matrix (m.mentions.user_ids + an org.matrix.custom.html formatted_body of pills).
import type { ZaloMention } from "../zalo/types.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface InboundMentionResult {
  formattedBody: string;
  userIds: string[];
}

/**
 * Zalo → Matrix: turn Zalo mentions into a formatted_body with matrix.to pills
 * and the list of mentioned MXIDs. resolveMxid maps a Zalo uid to a Matrix id
 * (owner for the account itself, else the contact's ghost).
 */
export function buildInboundMentions(
  text: string,
  mentions: ZaloMention[],
  resolveMxid: (uid: string) => string,
): InboundMentionResult {
  const userIds = new Set<string>();
  const valid = mentions
    .filter((m) => m.pos >= 0 && m.len > 0 && m.pos + m.len <= text.length)
    .sort((a, b) => a.pos - b.pos);
  let html = "";
  let cursor = 0;
  for (const m of valid) {
    if (m.pos < cursor) continue; // overlapping — skip
    const mxid = resolveMxid(m.uid);
    userIds.add(mxid);
    html += escapeHtml(text.slice(cursor, m.pos));
    const label = escapeHtml(text.slice(m.pos, m.pos + m.len));
    // Raw MXID in the matrix.to link — clients only detect pills in this literal
    // form; percent-encoding (%40/%3A) makes them render as a plain link instead.
    html += `<a href="https://matrix.to/#/${mxid}">${label}</a>`;
    cursor = m.pos + m.len;
  }
  html += escapeHtml(text.slice(cursor));
  return { formattedBody: html, userIds: [...userIds] };
}

/**
 * Matrix → Zalo mentions from `m.mentions.user_ids` (Beeper sends these WITHOUT a
 * formatted_body pill). resolve maps an MXID to {uid, name}; we locate "@name" in
 * the plain body to get pos/len. Used as the primary path since Beeper omits pills.
 */
export function mentionsFromUserIds(
  body: string,
  userIds: string[],
  resolve: (mxid: string) => { uid: string; name: string } | null,
): ZaloMention[] {
  const out: ZaloMention[] = [];
  for (const mxid of userIds) {
    const r = resolve(mxid);
    if (!r?.name) continue;
    const label = `@${r.name}`;
    const pos = body.indexOf(label);
    if (pos === -1) continue;
    out.push({ uid: r.uid, pos, len: label.length });
  }
  return out;
}

/**
 * Matrix → Zalo: parse a formatted_body's matrix.to pills into Zalo mentions.
 * resolveUid maps an MXID back to a Zalo uid (null if not a bridge user).
 * pos/len are located in the plain-text `body`.
 */
export function parseOutboundMentions(
  body: string,
  formattedBody: string | undefined,
  resolveUid: (mxid: string) => string | null,
): ZaloMention[] {
  if (!formattedBody) return [];
  const out: ZaloMention[] = [];
  // Tolerant: href may sit among other attributes; the label may contain markup.
  const anchor = /<a\b[^>]*\bhref="https:\/\/matrix\.to\/#\/([^"]+)"[^>]*>(.*?)<\/a>/gi;
  const usedUpto = new Map<string, number>(); // label → search start (handle repeats)
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(formattedBody)) !== null) {
    const mxid = decodeURIComponent(match[1]!);
    const label = match[2]!
      .replace(/<[^>]+>/g, "") // strip any nested tags in the pill label
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const uid = resolveUid(mxid);
    if (!uid) continue;
    const from = usedUpto.get(label) ?? 0;
    const pos = body.indexOf(label, from);
    if (pos === -1) continue;
    usedUpto.set(label, pos + label.length);
    out.push({ uid, pos, len: label.length });
  }
  return out;
}
