// Type declarations for zca-js

declare module "zca-js" {
  export class Zalo {
    constructor(options?: any);
    login(credentials: {
      imei: string;
      cookie: any;
      userAgent: string;
    }): Promise<API>;
    loginQR(options?: {
      userAgent?: string;
      language?: string;
      qrPath?: string;
    }, callback?: any): Promise<API>;
    listener: {
      on(event: string, callback: (data: any) => void): void;
      start(): void;
      stop(): void;
    };
  }

  export class API {
    sendMessage(message: any, threadId: string, threadType: number): Promise<any>;
    sendReaction(emoji: string, messageId: string, threadId: string, threadType: number): Promise<any>;
    undoMessage(messageId: string, threadId: string, threadType: number): Promise<any>;
    getUserInfo(userId: string): Promise<any>;
    getGroupInfo(groupId: string): Promise<any>;
    getOwnId(): Promise<string>;
  }

  export enum ThreadType {
    User = 0,
    Group = 1,
  }
}
