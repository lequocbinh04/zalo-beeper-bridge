// Normalized Zalo event model — the only shapes the bridge layer sees.
// Derived from live fixtures captured in Phase 1 (plans/.../reports/phase-01-spike-findings.md).

export type ZaloThreadType = "user" | "group";

export type ZaloContent =
  | { kind: "text"; text: string }
  | { kind: "photo"; url: string; thumbUrl?: string; width?: number; height?: number }
  | { kind: "sticker"; id: number; catId: number }
  | { kind: "unsupported"; msgType: string };

export interface ZaloMessage {
  msgId: string;
  threadId: string;
  threadType: ZaloThreadType;
  /** uidFrom — universal puppet key (equals the sender's DM threadId) */
  senderId: string;
  senderName?: string;
  /** epoch millis */
  timestamp: number;
  /** true when sent by the bridged account itself (any device) — zca-js selfListen */
  isSelf: boolean;
  content: ZaloContent;
}

/** Raw zca-js listener "message" event shape (subset we rely on). */
export interface RawZaloMessage {
  type: number; // 0=User, 1=Group (zca-js ThreadType)
  threadId: string;
  isSelf: boolean;
  data: {
    msgId: string;
    msgType: string;
    uidFrom: string;
    dName?: string;
    ts: string | number;
    content: unknown;
  };
}
