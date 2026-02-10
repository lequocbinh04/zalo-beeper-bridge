// Login routes - authentication endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";
import type { CookieLoginRequest } from "../types.js";

export async function loginRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // POST /login/qr - Initiate QR login
  app.post("/login/qr", async (request, reply) => {
    try {
      console.log("[LoginRoutes] QR login requested");
      const result = await zaloClient.loginQR();

      if (result.error) {
        return reply.code(500).send({
          error: result.error,
          code: "QR_LOGIN_FAILED",
        });
      }

      return reply.send({
        success: true,
        qr: result.qr,
        session: result.session,
      });
    } catch (error: any) {
      console.error("[LoginRoutes] QR login error:", error);
      return reply.code(500).send({
        error: error.message || "QR login failed",
        code: "QR_LOGIN_ERROR",
      });
    }
  });

  // POST /login/cookie - Restore session with cookie
  app.post<{ Body: CookieLoginRequest }>("/login/cookie", async (request, reply) => {
    try {
      const { cookie, imei, userAgent } = request.body;

      if (!cookie || !imei || !userAgent) {
        return reply.code(400).send({
          error: "Missing required fields: cookie, imei, userAgent",
          code: "INVALID_REQUEST",
        });
      }

      console.log("[LoginRoutes] Cookie login requested");
      const result = await zaloClient.loginCookie(cookie, imei, userAgent);

      if (!result.success) {
        return reply.code(500).send({
          error: result.error,
          code: "COOKIE_LOGIN_FAILED",
        });
      }

      return reply.send({
        success: true,
        ownId: result.ownId,
      });
    } catch (error: any) {
      console.error("[LoginRoutes] Cookie login error:", error);
      return reply.code(500).send({
        error: error.message || "Cookie login failed",
        code: "COOKIE_LOGIN_ERROR",
      });
    }
  });

  // POST /logout - Disconnect
  app.post("/logout", async (request, reply) => {
    try {
      console.log("[LoginRoutes] Logout requested");
      zaloClient.disconnect();

      return reply.send({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      console.error("[LoginRoutes] Logout error:", error);
      return reply.code(500).send({
        error: error.message || "Logout failed",
        code: "LOGOUT_ERROR",
      });
    }
  });
}
