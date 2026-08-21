import { verifyLineWebhookSignature } from "./line-messaging.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const lineUserIdPattern = /^U[0-9a-f]{32}$/i

export interface LineWebhookConfig {
  storeId: string
  connectionId: string
  channelSecret: string
  loginChannelId: string
}

export interface LineWebhookEventInput {
  connectionId: string
  webhookEventId: string
  eventType: "follow" | "unfollow"
  providerUserId: string
}

export interface LineWebhookDependencies {
  getConfig: (connectionId: string) => Promise<LineWebhookConfig | null>
  recordEvent: (event: LineWebhookEventInput) => Promise<void>
  verifySignature?: typeof verifyLineWebhookSignature
}

interface UnknownLineEvent {
  type?: unknown
  webhookEventId?: unknown
  source?: {
    type?: unknown
    userId?: unknown
  }
}

interface UnknownWebhookBody {
  events?: unknown
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function supportedEvent(value: unknown): value is "follow" | "unfollow" {
  return value === "follow" || value === "unfollow"
}

export function createLineWebhookHandler(dependencies: LineWebhookDependencies) {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405)
    }

    const contentLength = Number(request.headers.get("content-length") || "0")
    if (contentLength > 1_048_576) {
      return jsonResponse({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413)
    }

    const url = new URL(request.url)
    const connectionId = url.searchParams.get("connection_id")?.trim() || ""
    const signature = request.headers.get("x-line-signature")?.trim() || ""

    if (!uuidPattern.test(connectionId) || !signature || signature.length > 512) {
      return jsonResponse({ ok: false, code: "INVALID_WEBHOOK_REQUEST" }, 400)
    }

    const config = await dependencies.getConfig(connectionId)
    if (!config || config.connectionId !== connectionId) {
      return jsonResponse({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, 404)
    }

    let rawBody: string
    try {
      rawBody = await request.text()
    } catch {
      return jsonResponse({ ok: false, code: "INVALID_WEBHOOK_BODY" }, 400)
    }

    if (!rawBody || rawBody.length > 1_048_576) {
      return jsonResponse({ ok: false, code: "INVALID_WEBHOOK_BODY" }, 400)
    }

    const signatureIsValid = await (
      dependencies.verifySignature || verifyLineWebhookSignature
    )(rawBody, signature, config.channelSecret)

    if (!signatureIsValid) {
      return jsonResponse({ ok: false, code: "INVALID_LINE_SIGNATURE" }, 401)
    }

    let payload: UnknownWebhookBody
    try {
      payload = JSON.parse(rawBody) as UnknownWebhookBody
    } catch {
      return jsonResponse({ ok: false, code: "INVALID_JSON" }, 400)
    }

    if (!Array.isArray(payload.events) || payload.events.length > 100) {
      return jsonResponse({ ok: false, code: "INVALID_WEBHOOK_EVENTS" }, 400)
    }

    let processed = 0
    for (const unknownEvent of payload.events) {
      if (!unknownEvent || typeof unknownEvent !== "object") continue

      const event = unknownEvent as UnknownLineEvent
      if (!supportedEvent(event.type) || event.source?.type !== "user") continue

      const webhookEventId = typeof event.webhookEventId === "string"
        ? event.webhookEventId.trim()
        : ""
      const providerUserId = typeof event.source.userId === "string"
        ? event.source.userId.trim()
        : ""

      if (
        !webhookEventId
        || webhookEventId.length > 255
        || !lineUserIdPattern.test(providerUserId)
      ) {
        continue
      }

      try {
        await dependencies.recordEvent({
          connectionId,
          webhookEventId,
          eventType: event.type,
          providerUserId,
        })
        processed += 1
      } catch {
        return jsonResponse({ ok: false, code: "WEBHOOK_PROCESSING_FAILED" }, 500)
      }
    }

    return jsonResponse({ ok: true, processed }, 200)
  }
}
