// User routes - user info endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";

const errorSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
    code: { type: "string" as const },
  },
};

export async function userRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // GET /user/:id - Get user info
  app.get<{ Params: { id: string } }>("/user/:id", {
    schema: {
      tags: ["user"],
      summary: "Get user info",
      params: {
        type: "object",
        properties: {
          id: { type: "string", description: "Zalo user ID" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            user: {
              type: "object",
              properties: {
                userId: { type: "string" },
                displayName: { type: "string" },
                avatar: { type: "string" },
              },
            },
          },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id) {
        return reply.code(400).send({
          error: "Missing user ID",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[UserRoutes] Fetching user info for ${id}`);
      const userInfo = await zaloClient.getUserInfo(id);

      return reply.send({
        success: true,
        user: userInfo,
      });
    } catch (error: any) {
      console.error("[UserRoutes] Get user info error:", error);
      return reply.code(500).send({
        error: error.message || "Get user info failed",
        code: "GET_USER_INFO_ERROR",
      });
    }
  });

  // GET /friends - List all friends
  app.get<{ Querystring: { count?: number; page?: number } }>("/friends", {
    schema: {
      tags: ["user"],
      summary: "List all friends",
      querystring: {
        type: "object",
        properties: {
          count: { type: "number", default: 100, description: "Friends per page" },
          page: { type: "number", default: 1, description: "Page number" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            friends: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  userId: { type: "string" },
                  displayName: { type: "string" },
                  avatar: { type: "string" },
                },
              },
            },
          },
        },
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const { count = 100, page = 1 } = request.query;
      console.log(`[UserRoutes] Fetching friends (count=${count}, page=${page})`);
      const friends = await zaloClient.getAllFriends(count, page);
      return reply.send({ success: true, friends });
    } catch (error: any) {
      console.error("[UserRoutes] Get friends error:", error);
      return reply.code(500).send({
        error: error.message || "Get friends failed",
        code: "GET_FRIENDS_ERROR",
      });
    }
  });

  // GET /self - Get own info
  app.get("/self", {
    schema: {
      tags: ["user"],
      summary: "Get logged-in user info",
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            ownId: { type: "string" },
            user: {
              type: "object",
              properties: {
                userId: { type: "string" },
                displayName: { type: "string" },
                avatar: { type: "string" },
              },
            },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      console.log("[UserRoutes] Fetching self info");
      const ownId = await zaloClient.getSelfId();

      if (!ownId) {
        return reply.code(401).send({
          error: "Not logged in",
          code: "NOT_LOGGED_IN",
        });
      }

      const userInfo = await zaloClient.getUserInfo(ownId);

      return reply.send({
        success: true,
        ownId,
        user: userInfo,
      });
    } catch (error: any) {
      console.error("[UserRoutes] Get self info error:", error);
      return reply.code(500).send({
        error: error.message || "Get self info failed",
        code: "GET_SELF_INFO_ERROR",
      });
    }
  });
}
