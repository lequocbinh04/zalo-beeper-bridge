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

export async function messageRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // POST /send/text - Send text message
  app.post<{ Body: SendTextRequest }>("/send/text", async (request, reply) => {
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
  app.post<{ Body: SendImageRequest }>("/send/image", async (request, reply) => {
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
  app.post<{ Body: SendStickerRequest }>("/send/sticker", async (request, reply) => {
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
  app.post<{ Body: SendReactionRequest }>("/send/reaction", async (request, reply) => {
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
  app.post<{ Body: UndoMessageRequest }>("/send/undo", async (request, reply) => {
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
