// Login routes - authentication endpoints

import type { FastifyInstance } from "fastify";
import type { ZaloClientWrapper } from "../zalo-client.js";
import type { CookieLoginRequest } from "../types.js";

const errorSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
    code: { type: "string" as const },
  },
};

export async function loginRoutes(
  app: FastifyInstance,
  options: { zaloClient: ZaloClientWrapper }
) {
  const { zaloClient } = options;

  // POST /login/qr - Initiate QR login
  app.post("/login/qr", {
    schema: {
      tags: ["login"],
      summary: "Initiate QR code login",
      description: "Start a QR login flow. Returns QR data to display to the user.",
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            qr: { type: "string", description: "QR code data" },
            session: { type: "object", description: "Session data" },
          },
        },
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
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
  app.post<{ Body: CookieLoginRequest }>("/login/cookie", {
    schema: {
      tags: ["login"],
      summary: "Login with stored cookie",
      description: "Restore a Zalo session using previously saved credentials.",
      body: {
        type: "object",
        required: ["cookie", "imei", "userAgent"],
        properties: {
          cookie: { type: "string", description: "Zalo session cookie" },
          imei: { type: "string", description: "Device IMEI" },
          userAgent: { type: "string", description: "Browser user agent" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            ownId: { type: "string", description: "Logged-in user's Zalo ID" },
          },
        },
        400: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
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
  app.post("/logout", {
    schema: {
      tags: ["login"],
      summary: "Logout",
      description: "Disconnect the current Zalo session.",
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
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
