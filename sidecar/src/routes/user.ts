// User routes - user info endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";

export async function userRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // GET /user/:id - Get user info
  app.get<{ Params: { id: string } }>("/user/:id", async (request, reply) => {
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

  // GET /self - Get own info
  app.get("/self", async (request, reply) => {
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
