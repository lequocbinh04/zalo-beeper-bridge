// Message routes - send messages, reactions, and undo

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";
import type {
  SendTextRequest,
  SendImageRequest,
  SendStickerRequest,
  SendReactionRequest,
  UndoMessageRequest,
} from "../types.js";

const errorSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
    code: { type: "string" as const },
  },
};

const threadFields = {
  threadId: { type: "string" as const, description: "Chat thread ID" },
  threadType: { type: "number" as const, enum: [0, 1], description: "0 = User, 1 = Group" },
};

export async function messageRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // POST /send/text - Send text message
  app.post<{ Body: SendTextRequest }>("/send/text", {
    schema: {
      tags: ["message"],
      summary: "Send text message",
      body: {
        type: "object",
        required: ["msg", "threadId", "threadType"],
        properties: {
          msg: { type: "string", description: "Message content" },
          ...threadFields,
          quote: { type: "string", description: "Message ID to quote/reply to" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            messageId: { type: "string" },
          },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { msg, threadId, threadType, quote } = request.body;

      if (!msg || !threadId || threadType === undefined) {
        return reply.code(400).send({
          error: "Missing required fields: msg, threadId, threadType",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[MessageRoutes] Sending text to ${threadId}`);
      const result = await zaloClient.sendText(msg, threadId, threadType, quote);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "SEND_TEXT_FAILED",
        });
      }

      return reply.send({
        success: true,
        messageId: result.messageId,
      });
    } catch (error: any) {
      console.error("[MessageRoutes] Send text error:", error);
      return reply.code(500).send({
        error: error.message || "Send text failed",
        code: "SEND_TEXT_ERROR",
      });
    }
  });

  // POST /send/image - Send image
  app.post<{ Body: SendImageRequest }>("/send/image", {
    schema: {
      tags: ["message"],
      summary: "Send image",
      body: {
        type: "object",
        required: ["filePath", "threadId", "threadType"],
        properties: {
          filePath: { type: "string", description: "Local path to image file" },
          ...threadFields,
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            messageId: { type: "string" },
          },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { filePath, threadId, threadType } = request.body;

      if (!filePath || !threadId || threadType === undefined) {
        return reply.code(400).send({
          error: "Missing required fields: filePath, threadId, threadType",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[MessageRoutes] Sending image to ${threadId}`);
      const result = await zaloClient.sendImage(filePath, threadId, threadType);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "SEND_IMAGE_FAILED",
        });
      }

      return reply.send({
        success: true,
        messageId: result.messageId,
      });
    } catch (error: any) {
      console.error("[MessageRoutes] Send image error:", error);
      return reply.code(500).send({
        error: error.message || "Send image failed",
        code: "SEND_IMAGE_ERROR",
      });
    }
  });

  // POST /send/sticker - Send sticker
  app.post<{ Body: SendStickerRequest }>("/send/sticker", {
    schema: {
      tags: ["message"],
      summary: "Send sticker",
      body: {
        type: "object",
        required: ["stickerId", "threadId", "threadType"],
        properties: {
          stickerId: { type: "string", description: "Sticker ID" },
          ...threadFields,
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            messageId: { type: "string" },
          },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { stickerId, threadId, threadType } = request.body;

      if (!stickerId || !threadId || threadType === undefined) {
        return reply.code(400).send({
          error: "Missing required fields: stickerId, threadId, threadType",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[MessageRoutes] Sending sticker to ${threadId}`);
      const result = await zaloClient.sendSticker(stickerId, threadId, threadType);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "SEND_STICKER_FAILED",
        });
      }

      return reply.send({
        success: true,
        messageId: result.messageId,
      });
    } catch (error: any) {
      console.error("[MessageRoutes] Send sticker error:", error);
      return reply.code(500).send({
        error: error.message || "Send sticker failed",
        code: "SEND_STICKER_ERROR",
      });
    }
  });

  // POST /send/reaction - Send reaction
  app.post<{ Body: SendReactionRequest }>("/send/reaction", {
    schema: {
      tags: ["message"],
      summary: "Send reaction to a message",
      body: {
        type: "object",
        required: ["messageId", "emoji", "threadId", "threadType"],
        properties: {
          messageId: { type: "string", description: "Target message ID" },
          emoji: { type: "string", description: "Reaction emoji" },
          ...threadFields,
        },
      },
      response: {
        200: {
          type: "object",
          properties: { success: { type: "boolean" } },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { messageId, emoji, threadId, threadType } = request.body;

      if (!messageId || !emoji || !threadId || threadType === undefined) {
        return reply.code(400).send({
          error: "Missing required fields: messageId, emoji, threadId, threadType",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[MessageRoutes] Sending reaction to message ${messageId}`);
      const result = await zaloClient.sendReaction(messageId, emoji, threadId, threadType);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "SEND_REACTION_FAILED",
        });
      }

      return reply.send({
        success: true,
      });
    } catch (error: any) {
      console.error("[MessageRoutes] Send reaction error:", error);
      return reply.code(500).send({
        error: error.message || "Send reaction failed",
        code: "SEND_REACTION_ERROR",
      });
    }
  });

  // POST /send/undo - Undo message
  app.post<{ Body: UndoMessageRequest }>("/send/undo", {
    schema: {
      tags: ["message"],
      summary: "Undo/recall a message",
      body: {
        type: "object",
        required: ["messageId", "threadId", "threadType"],
        properties: {
          messageId: { type: "string", description: "Message ID to undo" },
          ...threadFields,
        },
      },
      response: {
        200: {
          type: "object",
          properties: { success: { type: "boolean" } },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { messageId, threadId, threadType } = request.body;

      if (!messageId || !threadId || threadType === undefined) {
        return reply.code(400).send({
          error: "Missing required fields: messageId, threadId, threadType",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[MessageRoutes] Undoing message ${messageId}`);
      const result = await zaloClient.undoMessage(messageId, threadId, threadType);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "UNDO_MESSAGE_FAILED",
        });
      }

      return reply.send({
        success: true,
      });
    } catch (error: any) {
      console.error("[MessageRoutes] Undo message error:", error);
      return reply.code(500).send({
        error: error.message || "Undo message failed",
        code: "UNDO_MESSAGE_ERROR",
      });
    }
  });
}
