// Group routes - group info endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";

export async function groupRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // GET /group/:id - Get group info
  app.get<{ Params: { id: string } }>("/group/:id", async (request, reply) => {
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
  app.get("/groups", async (request, reply) => {
    try {
      console.log("[GroupRoutes] Fetching all groups");

      // Note: This endpoint may not be available in zca-js API
      // May need to implement group list caching or alternative approach
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
