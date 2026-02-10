// Group routes - group info endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";

const errorSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
    code: { type: "string" as const },
  },
};

export async function groupRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // GET /group/:id - Get group info
  app.get<{ Params: { id: string } }>("/group/:id", {
    schema: {
      tags: ["group"],
      summary: "Get group info",
      params: {
        type: "object",
        properties: {
          id: { type: "string", description: "Zalo group ID" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            group: {
              type: "object",
              properties: {
                groupId: { type: "string" },
                name: { type: "string" },
                members: { type: "array", items: { type: "object" } },
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
          error: "Missing group ID",
          code: "INVALID_REQUEST",
        });
      }

      console.log(`[GroupRoutes] Fetching group info for ${id}`);
      const groupInfo = await zaloClient.getGroupInfo(id);

      return reply.send({
        success: true,
        group: groupInfo,
      });
    } catch (error: any) {
      console.error("[GroupRoutes] Get group info error:", error);
      return reply.code(500).send({
        error: error.message || "Get group info failed",
        code: "GET_GROUP_INFO_ERROR",
      });
    }
  });

  // GET /groups - List all groups
  app.get("/groups", {
    schema: {
      tags: ["group"],
      summary: "List all groups",
      description: "List all known groups. May return empty if not yet cached.",
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            groups: { type: "array", items: { type: "object" } },
            message: { type: "string" },
          },
        },
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      console.log("[GroupRoutes] Fetching all groups");

      return reply.send({
        success: true,
        groups: [],
        message: "Group listing not yet implemented - cache groups from incoming messages",
      });
    } catch (error: any) {
      console.error("[GroupRoutes] List groups error:", error);
      return reply.code(500).send({
        error: error.message || "List groups failed",
        code: "LIST_GROUPS_ERROR",
      });
    }
  });
}
