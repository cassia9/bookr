import {
  fetchLineBotInfo,
  LineMessagingError,
} from "./line-messaging.ts"
import type { LineBotInfo } from "./line-messaging.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerIdPattern = /^[0-9]{1,32}$/
const channelIdPattern = /^[0-9]{5,32}$/

export interface LineMessagingAdmin {
  id: string
  storeId: string
  role: "admin" | "member"
}

export interface LineMessagingConfiguration {
  actorId: string
  storeId: string
  connectionId: string
  providerId: string
  messagingChannelId: string
  botInfo: LineBotInfo
  channelAccessToken: string
  channelSecret: string
}

export interface LineMessagingSettingsDependencies {
  authenticate: (token: string) => Promise<LineMessagingAdmin | null>
  configure: (configuration: LineMessagingConfiguration) => Promise<Record<string, unknown>>
  fetchBotInfo?: typeof fetchLineBotInfo
  allowedOrigins: Set<string>
}

interface ConnectPayload {
  action?: unknown
  connectionId?: unknown
  providerId?: unknown
  messagingChannelId?: unknown
  channelAccessToken?: unknown
  channelSecret?: unknown
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : ""
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, allowedOrigins),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function createLineMessagingSettingsHandler(
  dependencies: LineMessagingSettingsDependencies,
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin")
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      return jsonResponse(
        { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" },
        403,
        null,
        dependencies.allowedOrigins,
      )
    }

    if (request.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders(origin, dependencies.allowedOrigins),
      })
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" },
        405,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const contentLength = Number(request.headers.get("content-length") || "0")
    if (contentLength > 16_384) {
      return jsonResponse(
        { ok: false, code: "PAYLOAD_TOO_LARGE", error: "Request body is too large" },
        413,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ") || authHeader.length > 8_192) {
      return jsonResponse(
        { ok: false, code: "UNAUTHORIZED", error: "Unauthorized" },
        401,
        origin,
        dependencies.allowedOrigins,
      )
    }

    let payload: ConnectPayload
    try {
      payload = await request.json() as ConnectPayload
    } catch {
      return jsonResponse(
        { ok: false, code: "INVALID_JSON", error: "Invalid JSON body" },
        400,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const action = normalizedString(payload.action)
    const connectionId = normalizedString(payload.connectionId)
    const providerId = normalizedString(payload.providerId)
    const messagingChannelId = normalizedString(payload.messagingChannelId)
    const channelAccessToken = normalizedString(payload.channelAccessToken)
    const channelSecret = normalizedString(payload.channelSecret)

    if (
      action !== "connect"
      || !uuidPattern.test(connectionId)
      || !providerIdPattern.test(providerId)
      || !channelIdPattern.test(messagingChannelId)
      || channelAccessToken.length < 20
      || channelAccessToken.length > 4_096
      || channelSecret.length < 20
      || channelSecret.length > 255
      || /[\r\n]/.test(channelAccessToken)
      || /[\r\n]/.test(channelSecret)
    ) {
      return jsonResponse(
        { ok: false, code: "INVALID_INPUT", error: "Invalid LINE Messaging configuration" },
        400,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const admin = await dependencies.authenticate(authHeader.slice(7))
    if (!admin) {
      return jsonResponse(
        { ok: false, code: "UNAUTHORIZED", error: "Invalid or expired session" },
        401,
        origin,
        dependencies.allowedOrigins,
      )
    }

    if (admin.role !== "admin") {
      return jsonResponse(
        { ok: false, code: "ADMIN_REQUIRED", error: "Admin permission required" },
        403,
        origin,
        dependencies.allowedOrigins,
      )
    }

    let botInfo: LineBotInfo
    try {
      botInfo = await (dependencies.fetchBotInfo || fetchLineBotInfo)(channelAccessToken)
    } catch (error) {
      if (error instanceof LineMessagingError) {
        const status = error.retryable ? 503 : 400
        return jsonResponse(
          { ok: false, code: error.code, error: "Unable to verify LINE Messaging channel" },
          status,
          origin,
          dependencies.allowedOrigins,
        )
      }
      return jsonResponse(
        { ok: false, code: "LINE_API_UNAVAILABLE", error: "Unable to verify LINE Messaging channel" },
        503,
        origin,
        dependencies.allowedOrigins,
      )
    }

    try {
      const result = await dependencies.configure({
        actorId: admin.id,
        storeId: admin.storeId,
        connectionId,
        providerId,
        messagingChannelId,
        botInfo,
        channelAccessToken,
        channelSecret,
      })

      return jsonResponse({
        ok: true,
        status: result.status || "active",
        connectionId,
        messagingChannelId,
        botBasicId: botInfo.basicId,
        botDisplayName: botInfo.displayName,
      }, 200, origin, dependencies.allowedOrigins)
    } catch {
      return jsonResponse(
        { ok: false, code: "CONFIGURATION_SAVE_FAILED", error: "Unable to save LINE Messaging configuration" },
        500,
        origin,
        dependencies.allowedOrigins,
      )
    }
  }
}
