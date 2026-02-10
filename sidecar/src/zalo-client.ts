// Zalo client wrapper - manages Zalo API interactions

import { Zalo, API } from "zca-js";
import type { LoginState, BroadcastFn, ThreadType } from "./types.js";
import { handleMessage } from "./events/message-handler.js";
import { handleReaction } from "./events/reaction-handler.js";
import { handleUndo } from "./events/undo-handler.js";
import { handleGroupEvent } from "./events/group-handler.js";

export class ZaloClientWrapper {
  private zalo: Zalo | null = null;
  private state: LoginState = {
    api: null,
    loggedIn: false,
    ownId: null,
  };
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  async loginQR(): Promise<{ qr?: string; session?: any; error?: string }> {
    try {
      console.log("[ZaloClient] Initiating QR login...");
      this.zalo = new Zalo();

      const api = await this.zalo.loginQR();
      this.state.api = api;
      this.state.loggedIn = true;
      this.state.ownId = await api.getOwnId();

      this.setupListeners(this.broadcast);

      console.log(`[ZaloClient] QR login successful, ownId: ${this.state.ownId}`);
      return { session: { ownId: this.state.ownId } };
    } catch (error: any) {
      console.error("[ZaloClient] QR login failed:", error);
      return { error: error.message || "QR login failed" };
    }
  }

  async loginCookie(
    cookie: string,
    imei: string,
    userAgent: string
  ): Promise<{ success: boolean; ownId?: string; error?: string }> {
    try {
      console.log("[ZaloClient] Initiating cookie login...");
      this.zalo = new Zalo();

      // Parse cookie string to cookie array
      const cookies = JSON.parse(cookie);

      const api = await this.zalo.login({
        cookie: cookies,
        imei,
        userAgent,
      });

      this.state.api = api;
      this.state.loggedIn = true;
      this.state.ownId = await api.getOwnId();

      this.setupListeners(this.broadcast);

      console.log(`[ZaloClient] Cookie login successful, ownId: ${this.state.ownId}`);
      return { success: true, ownId: this.state.ownId || undefined };
    } catch (error: any) {
      console.error("[ZaloClient] Cookie login failed:", error);
      return { success: false, error: error.message || "Cookie login failed" };
    }
  }

  async sendText(
    msg: string,
    threadId: string,
    threadType: ThreadType,
    quote?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.state.loggedIn || !this.state.api) {
      return { success: false, error: "Not logged in" };
    }

    try {
      const result = await this.state.api.sendMessage(
        {
          msg,
          quote: quote || undefined,
        },
        threadId,
        threadType
      );

      console.log(`[ZaloClient] Sent text message to ${threadId}`);
      return { success: true, messageId: result?.msgId };
    } catch (error: any) {
      console.error("[ZaloClient] Send text failed:", error);
      return { success: false, error: error.message || "Send text failed" };
    }
  }

  async sendImage(
    filePath: string,
    threadId: string,
    threadType: ThreadType
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.state.loggedIn || !this.state.api) {
      return { success: false, error: "Not logged in" };
    }

    try {
      const result = await this.state.api.sendMessage(
        {
          file: filePath,
        },
        threadId,
        threadType
      );

      console.log(`[ZaloClient] Sent image to ${threadId}`);
      return { success: true, messageId: result?.msgId };
    } catch (error: any) {
      console.error("[ZaloClient] Send image failed:", error);
      return { success: false, error: error.message || "Send image failed" };
    }
  }

  async sendSticker(
    stickerId: string,
    threadId: string,
    threadType: ThreadType
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.state.loggedIn || !this.state.api) {
      return { success: false, error: "Not logged in" };
    }

    try {
      // Fetch sticker and send
      const result = await this.state.api.sendMessage(
        {
          sticker: stickerId,
        },
        threadId,
        threadType
      );

      console.log(`[ZaloClient] Sent sticker ${stickerId} to ${threadId}`);
      return { success: true, messageId: result?.msgId };
    } catch (error: any) {
      console.error("[ZaloClient] Send sticker failed:", error);
      return { success: false, error: error.message || "Send sticker failed" };
    }
  }

  async sendReaction(
    messageId: string,
    emoji: string,
    threadId: string,
    threadType: ThreadType
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.state.loggedIn || !this.state.api) {
      return { success: false, error: "Not logged in" };
    }

    try {
      await this.state.api.sendReaction(emoji, messageId, threadId, threadType);
      console.log(`[ZaloClient] Sent reaction ${emoji} to message ${messageId}`);
      return { success: true };
    } catch (error: any) {
      console.error("[ZaloClient] Send reaction failed:", error);
      return { success: false, error: error.message || "Send reaction failed" };
    }
  }

  async undoMessage(
    messageId: string,
    threadId: string,
    threadType: ThreadType
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.state.loggedIn || !this.state.api) {
      return { success: false, error: "Not logged in" };
    }

    try {
      await this.state.api.undoMessage(messageId, threadId, threadType);
      console.log(`[ZaloClient] Undone message ${messageId}`);
      return { success: true };
    } catch (error: any) {
      console.error("[ZaloClient] Undo message failed:", error);
      return { success: false, error: error.message || "Undo message failed" };
    }
  }

  async getUserInfo(userId: string): Promise<any> {
    if (!this.state.loggedIn || !this.state.api) {
      throw new Error("Not logged in");
    }

    try {
      const userInfo = await this.state.api.getUserInfo(userId);
      console.log(`[ZaloClient] Fetched user info for ${userId}`);
      return userInfo;
    } catch (error: any) {
      console.error("[ZaloClient] Get user info failed:", error);
      throw error;
    }
  }

  async getGroupInfo(groupId: string): Promise<any> {
    if (!this.state.loggedIn || !this.state.api) {
      throw new Error("Not logged in");
    }

    try {
      const groupInfo = await this.state.api.getGroupInfo(groupId);
      console.log(`[ZaloClient] Fetched group info for ${groupId}`);
      return groupInfo;
    } catch (error: any) {
      console.error("[ZaloClient] Get group info failed:", error);
      throw error;
    }
  }

  async getSelfId(): Promise<string | null> {
    if (!this.state.loggedIn || !this.state.api) {
      return null;
    }

    try {
      if (this.state.ownId) {
        return this.state.ownId;
      }
      const ownId = await this.state.api.getOwnId();
      this.state.ownId = ownId;
      return ownId;
    } catch (error: any) {
      console.error("[ZaloClient] Get self ID failed:", error);
      return null;
    }
  }

  setupListeners(broadcast: BroadcastFn): void {
    if (!this.state.api) {
      console.warn("[ZaloClient] Cannot setup listeners - no API instance");
      return;
    }

    const listener = this.state.api.listener;
    console.log("[ZaloClient] Setting up event listeners...");

    listener.on("message", (message: any) => {
      handleMessage(message, broadcast);
    });

    listener.on("reaction", (reaction: any) => {
      handleReaction(reaction, broadcast);
    });

    listener.on("undo", (undo: any) => {
      handleUndo(undo, broadcast);
    });

    listener.on("group_event", (event: any) => {
      handleGroupEvent(event, broadcast);
    });

    listener.on("connected", () => {
      console.log("[ZaloClient] Listener connected");
    });

    listener.on("error", (error: any) => {
      console.error("[ZaloClient] Listener error:", error);
    });

    listener.on("closed", (code: number, reason: string) => {
      console.warn(`[ZaloClient] Listener closed: code=${code}, reason=${reason}`);
    });

    console.log("[ZaloClient] Event listeners registered");

    listener.start();
    console.log("[ZaloClient] Listener started");
  }

  disconnect(): void {
    if (this.state.api) {
      console.log("[ZaloClient] Disconnecting...");
      this.state.api.listener.stop();
    }
    this.zalo = null;

    this.state = {
      api: null,
      loggedIn: false,
      ownId: null,
    };

    console.log("[ZaloClient] Disconnected");
  }

  isLoggedIn(): boolean {
    return this.state.loggedIn;
  }
}
