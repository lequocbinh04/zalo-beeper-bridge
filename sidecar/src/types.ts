// Core type definitions for mautrix-zalo sidecar

export interface WsEvent {
  type: "message" | "reaction" | "undo" | "group_event";
  data: unknown;
  timestamp: number;
}

export enum ThreadType {
  User = 0,
  Group = 1,
}

export interface LoginState {
  api: any;
  loggedIn: boolean;
  ownId: string | null;
}

export interface ErrorResponse {
  error: string;
  code: string;
}

export type BroadcastFn = (evt: WsEvent) => void;

// Login request/response types
export interface QRLoginResponse {
  qr?: string;
  session?: any;
  error?: string;
}

export interface CookieLoginRequest {
  cookie: string;
  imei: string;
  userAgent: string;
}

export interface CookieLoginResponse {
  success: boolean;
  ownId?: string;
  error?: string;
}

// Message request types
export interface SendTextRequest {
  msg: string;
  threadId: string;
  threadType: ThreadType;
  quote?: string;
}

export interface SendImageRequest {
  filePath: string;
  threadId: string;
  threadType: ThreadType;
}

export interface SendStickerRequest {
  stickerId: string;
  threadId: string;
  threadType: ThreadType;
}

export interface SendReactionRequest {
  messageId: string;
  emoji: string;
  threadId: string;
  threadType: ThreadType;
}

export interface UndoMessageRequest {
  messageId: string;
  threadId: string;
  threadType: ThreadType;
}

// Response types
export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UserInfoResponse {
  userId: string;
  displayName: string;
  avatar?: string;
  error?: string;
}

export interface GroupInfoResponse {
  groupId: string;
  name: string;
  members?: any[];
  error?: string;
}
