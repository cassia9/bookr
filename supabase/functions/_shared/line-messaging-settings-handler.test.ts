import {
  createLineMessagingSettingsHandler,
} from "./line-messaging-settings-handler.ts"
import type { LineMessagingConfiguration } from "./line-messaging-settings-handler.ts"
import { LineMessagingError } from "./line-messaging.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const allowedOrigins = new Set(["http://127.0.0.1:5175"])
const validPayload = {
  action: "connect",
  connectionId: "60000000-0000-4000-8000-000000000001",
  providerId: "3000000001",
  messagingChannelId: "2000000001",
  channelAccessToken: "local-test-access-token-value",
  channelSecret: "local-test-channel-secret-value",
}

function request(payload: Record<string, unknown>, options: {
  token?: string
  origin?: string
} = {}) {
  return new Request("http://localhost/line-messaging-settings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${options.token ?? "valid-admin-token"}`,
      "Content-Type": "application/json",
      "Origin": options.origin ?? "http://127.0.0.1:5175",
    },
    body: JSON.stringify(payload),
  })
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    allowedOrigins,
    authenticate: async () => ({
      id: "50000000-0000-4000-8000-000000000001",
      storeId: "00000000-0000-4000-8000-000000000001",
      role: "admin" as const,
    }),
    fetchBotInfo: async () => ({
      botUserId: "U11111111111111111111111111111111",
      basicId: "@bookrtest",
      displayName: "Bookr 測試官方帳號",
    }),
    configure: async (_configuration: LineMessagingConfiguration) => ({ status: "active" }),
    ...overrides,
  }
}

Deno.test("設定 Handler 驗證 Bot 後只回傳去敏 metadata", async () => {
  let capturedAccessToken = ""
  const handler = createLineMessagingSettingsHandler(dependencies({
    configure: async (configuration: LineMessagingConfiguration) => {
      capturedAccessToken = configuration.channelAccessToken
      return { status: "active" }
    },
  }))

  const response = await handler(request(validPayload))
  const body = await response.json()
  const bodyText = JSON.stringify(body)

  assert(response.status === 200, "有效設定應成功")
  assert(body.ok === true, "回應應為成功")
  assert(capturedAccessToken === validPayload.channelAccessToken, "設定層應收到 Token")
  assert(!bodyText.includes(validPayload.channelAccessToken), "回應不得包含 Token")
  assert(!bodyText.includes(validPayload.channelSecret), "回應不得包含 Channel Secret")
})

Deno.test("設定 Handler 拒絕非白名單 Origin", async () => {
  const handler = createLineMessagingSettingsHandler(dependencies())
  const response = await handler(request(validPayload, { origin: "https://attacker.example" }))
  assert(response.status === 403, "非白名單 Origin 應拒絕")
})

Deno.test("設定 Handler 拒絕未登入請求", async () => {
  const handler = createLineMessagingSettingsHandler(dependencies({
    authenticate: async () => null,
  }))
  const response = await handler(request(validPayload))
  assert(response.status === 401, "無效 session 應回 401")
})

Deno.test("設定 Handler 拒絕一般成員", async () => {
  const handler = createLineMessagingSettingsHandler(dependencies({
    authenticate: async () => ({
      id: "50000000-0000-4000-8000-000000000002",
      storeId: "00000000-0000-4000-8000-000000000001",
      role: "member" as const,
    }),
  }))
  const response = await handler(request(validPayload))
  assert(response.status === 403, "一般成員應回 403")
})

Deno.test("設定 Handler 拒絕格式錯誤且不呼叫 LINE", async () => {
  let lineCalled = false
  const handler = createLineMessagingSettingsHandler(dependencies({
    fetchBotInfo: async () => {
      lineCalled = true
      throw new Error("不應呼叫")
    },
  }))
  const response = await handler(request({ ...validPayload, messagingChannelId: "bad" }))
  assert(response.status === 400, "格式錯誤應回 400")
  assert(!lineCalled, "格式錯誤不得呼叫 LINE")
})

Deno.test("設定 Handler 將 LINE 暫時失敗轉為 503", async () => {
  const handler = createLineMessagingSettingsHandler(dependencies({
    fetchBotInfo: async () => {
      throw new LineMessagingError(
        "LINE_API_UNAVAILABLE",
        "temporary",
        { retryable: true },
      )
    },
  }))
  const response = await handler(request(validPayload))
  assert(response.status === 503, "LINE 暫時失敗應回 503")
})
