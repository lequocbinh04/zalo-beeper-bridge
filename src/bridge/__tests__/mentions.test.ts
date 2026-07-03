import { describe, expect, it } from "vitest";
import { buildInboundMentions, parseOutboundMentions } from "../mentions.ts";

describe("buildInboundMentions (Zalo → Matrix)", () => {
  const resolve = (uid: string) => (uid === "own" ? "@owner:beeper.com" : `@sh-zalo_${uid}:beeper.local`);

  it("wraps mentions in matrix.to pills and collects user_ids", () => {
    const text = "hi @Tuan and @Binh";
    const mentions = [
      { uid: "111", pos: 3, len: 5 }, // "@Tuan"
      { uid: "222", pos: 13, len: 5 }, // "@Binh"
    ];
    const r = buildInboundMentions(text, mentions, resolve);
    expect(r.userIds).toEqual(["@sh-zalo_111:beeper.local", "@sh-zalo_222:beeper.local"]);
    expect(r.formattedBody).toBe(
      'hi <a href="https://matrix.to/#/%40sh-zalo_111%3Abeeper.local">@Tuan</a> and <a href="https://matrix.to/#/%40sh-zalo_222%3Abeeper.local">@Binh</a>',
    );
  });

  it("escapes HTML in the surrounding text", () => {
    const r = buildInboundMentions("a <b> @X", [{ uid: "1", pos: 6, len: 2 }], resolve);
    expect(r.formattedBody).toContain("a &lt;b&gt; ");
  });

  it("ignores out-of-range mentions", () => {
    const r = buildInboundMentions("short", [{ uid: "1", pos: 10, len: 5 }], resolve);
    expect(r.userIds).toEqual([]);
    expect(r.formattedBody).toBe("short");
  });
});

describe("parseOutboundMentions (Matrix → Zalo)", () => {
  const resolveUid = (mxid: string) => {
    if (mxid === "@owner:beeper.com") return "own";
    const m = /^@sh-zalo_(.+):/.exec(mxid);
    return m ? m[1]! : null;
  };

  it("maps pills back to Zalo uid + pos/len in the plain body", () => {
    const body = "hi @Tuan bye";
    const fb = 'hi <a href="https://matrix.to/#/%40sh-zalo_111%3Abeeper.local">@Tuan</a> bye';
    expect(parseOutboundMentions(body, fb, resolveUid)).toEqual([{ uid: "111", pos: 3, len: 5 }]);
  });

  it("skips non-bridge pills", () => {
    const body = "hey @someone";
    const fb = 'hey <a href="https://matrix.to/#/%40real%3Abeeper.com">@someone</a>';
    expect(parseOutboundMentions(body, fb, resolveUid)).toEqual([]);
  });

  it("returns [] with no formatted_body", () => {
    expect(parseOutboundMentions("plain", undefined, resolveUid)).toEqual([]);
  });
});
