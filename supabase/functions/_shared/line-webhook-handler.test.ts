import { createLineWebhookHandler } from "./line-webhook-handler.ts"
import type {
  LineWebhookEventInput,
} from "./line-webhook-handler.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const connectionId = "60000000-0000-4000-8000-000000000001"
const channelSecret = "local-test-channel-secret-value"

function webhookBody(events: Array<Record<string, unknown>>) {
  return JSON.stringify({ destination: "U00000000000000000000000000000000", events })
}

async function signatureFor(rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  ))
  return btoa(String.fromCharCode(...digest))
}

async function request(rawBody: string, options: {
  signature?: string
  requestedConnectionId?: string
} = {}) {
  return new Request(
    `http://localhost/line-webhook?connection_id=${options.requestedConnectionId ?? connectionId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Line-Signature": options.signature ?? await signatureFor(rawBody),
      },
      body: rawBody,
    },
  )
}

function dependencies(recorded: LineWebhookEventInput[] = []) {
  return {
    getConfig: async (requestedConnectionId: string) => requestedConnectionId === connectionId
      ? {
        storeId: "00000000-0000-4000-8000-000000000001",
        connectionId,
        channelSecret,
        loginChannelId: "2000000001",
      }
      : null,
    recordEvent: async (event: LineWebhookEventInput) => {
      recorded.push(event)
    },
  }
}

Deno.test("Webhook 以原始 body 驗證簽章後處理 follow", async () => {
  const recorded: LineWebhookEventInput[] = []
  const handler = createLineWebhookHandler(dependencies(recorded))
  const rawBody = webhookBody([{
    type: "follow",
    webhookEventId: "event-follow-1",
    source: {
      type: "user",
      userId: "U11111111111111111111111111111111",
    },
  }])

  const response = await handler(await request(rawBody))
  const body = await response.json()

  assert(response.status === 200, "有效 Webhook 應回 200")
  assert(body.processed === 1, "應處理一筆 follow")
  assert(recorded[0]?.eventType === "follow", "事件類型應為 follow")
})

Deno.test("Webhook 拒絕 body 被修改後的簽章", async () => {
  const recorded: LineWebhookEventInput[] = []
  const handler = createLineWebhookHandler(dependencies(recorded))
  const originalBody = webhookBody([])
  const response = await handler(await request(`${originalBody} `, {
    signature: await signatureFor(originalBody),
  }))

  assert(response.status === 401, "簽章不符應回 401")
  assert(recorded.length === 0, "簽章不符不得處理事件")
})

Deno.test("Webhook 在簽章驗證前不解析 JSON", async () => {
  let verifyCalled = false
  const handler = createLineWebhookHandler({
    ...dependencies(),
    verifySignature: async rawBody => {
      verifyCalled = rawBody === "not-json"
      return false
    },
  })

  const response = await handler(await request("not-json", { signature: "invalid" }))
  const body = await response.json()

  assert(verifyCalled, "應先以原始文字驗證簽章")
  assert(response.status === 401, "簽章失敗優先於 JSON 錯誤")
  assert(body.code === "INVALID_LINE_SIGNATURE", "應回簽章錯誤")
})

Deno.test("Webhook 忽略非 follow/unfollow 與群組來源", async () => {
  const recorded: LineWebhookEventInput[] = []
  const handler = createLineWebhookHandler(dependencies(recorded))
  const rawBody = webhookBody([
    {
      type: "message",
      webhookEventId: "event-message-1",
      source: { type: "user", userId: "U11111111111111111111111111111111" },
    },
    {
      type: "follow",
      webhookEventId: "event-follow-group",
      source: { type: "group", userId: "U11111111111111111111111111111111" },
    },
  ])

  const response = await handler(await request(rawBody))
  const body = await response.json()
  assert(response.status === 200, "不支援事件仍應回 200")
  assert(body.processed === 0, "不支援事件不得寫入")
  assert(recorded.length === 0, "不得記錄不支援事件")
})

Deno.test("Webhook 找不到有效 connection 時回 404", async () => {
  const handler = createLineWebhookHandler(dependencies())
  const rawBody = webhookBody([])
  const response = await handler(await request(rawBody, {
    requestedConnectionId: "60000000-0000-4000-8000-000000000099",
  }))
  assert(response.status === 404, "無效 connection 應回 404")
})

Deno.test("Webhook 資料庫失敗時回 500 讓 LINE 重送", async () => {
  const handler = createLineWebhookHandler({
    ...dependencies(),
    recordEvent: async () => {
      throw new Error("database unavailable")
    },
  })
  const rawBody = webhookBody([{
    type: "unfollow",
    webhookEventId: "event-unfollow-1",
    source: {
      type: "user",
      userId: "U11111111111111111111111111111111",
    },
  }])

  const response = await handler(await request(rawBody))
  assert(response.status === 500, "暫時處理失敗應回 500")
})
