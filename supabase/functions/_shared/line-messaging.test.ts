import {
  calculateLineRetryDelay,
  fetchLineBotInfo,
  formatLineBookingTime,
  LineMessagingError,
  renderLineMessageTemplate,
  sendLinePushMessage,
  validateLineMessageTemplate,
  verifyLineWebhookSignature,
} from "./line-messaging.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function expectMessagingError(
  action: () => Promise<unknown> | unknown,
  code: LineMessagingError["code"],
) {
  try {
    await action()
    throw new Error("預期 LineMessagingError")
  } catch (error) {
    assert(error instanceof LineMessagingError, "應回傳 LineMessagingError")
    assert(error.code === code, `錯誤碼應為 ${code}`)
    return error
  }
}

function jsonFetch(
  payload: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })) as typeof fetch
}

Deno.test("fetchLineBotInfo 驗證並正規化 Bot metadata", async () => {
  const info = await fetchLineBotInfo(
    "local-test-access-token-value",
    jsonFetch({
      userId: "U11111111111111111111111111111111",
      basicId: "@bookrtest",
      displayName: "Bookr 測試官方帳號",
    }),
  )

  assert(info.botUserId === "U11111111111111111111111111111111", "bot user ID 應一致")
  assert(info.basicId === "@bookrtest", "Basic ID 應一致")
  assert(info.displayName === "Bookr 測試官方帳號", "顯示名稱應一致")
})

Deno.test("fetchLineBotInfo 將 401 分類為不可重試的 Token 錯誤", async () => {
  const error = await expectMessagingError(
    () => fetchLineBotInfo("local-test-access-token-value", jsonFetch({}, 401)),
    "LINE_AUTH_REJECTED",
  )
  assert(!error.retryable, "401 不應自動重試")
})

Deno.test("validateLineMessageTemplate 拒絕未知變數與不完整語法", async () => {
  await expectMessagingError(
    () => validateLineMessageTemplate("您好 {{unknown_value}}"),
    "INVALID_LINE_CONFIGURATION",
  )
  await expectMessagingError(
    () => validateLineMessageTemplate("您好 {{customer_name}"),
    "INVALID_LINE_CONFIGURATION",
  )
})

Deno.test("renderLineMessageTemplate 只替換白名單變數", () => {
  const message = renderLineMessageTemplate(
    "{{store_name}}：{{customer_name}} 已預約 {{service_name}}／{{practitioner_name}}／{{start_time}}",
    {
      customer_name: "王小明",
      service_name: "伸展課",
      practitioner_name: "林老師",
      start_time: "2026/08/22 14:00",
      store_name: "Bookr",
    },
  )

  assert(
    message === "Bookr：王小明 已預約 伸展課／林老師／2026/08/22 14:00",
    "範本替換結果應一致",
  )
})

Deno.test("renderLineMessageTemplate 將舊版字面換行轉為真正換行", () => {
  const message = renderLineMessageTemplate(
    "您好 {{customer_name}}\\n預約已確認",
    {
      customer_name: "王小明",
      service_name: "伸展課",
      practitioner_name: "林老師",
      start_time: "2026/08/22 14:00",
      store_name: "Bookr",
    },
  )

  assert(message === "您好 王小明\n預約已確認", "字面換行應轉為真正換行")
  assert(!message.includes("\\n"), "推播內容不得保留字面反斜線 n")
})

Deno.test("formatLineBookingTime 使用店家時區", () => {
  const formatted = formatLineBookingTime("2026-08-22T06:00:00.000Z", "Asia/Taipei")
  assert(formatted.includes("14:00"), "台北時區應顯示 14:00")
})

Deno.test("verifyLineWebhookSignature 驗證原始 body HMAC-SHA256", async () => {
  const rawBody = '{"events":[{"type":"follow"}]}'
  const secret = "local-test-channel-secret-value"
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  ))
  const signature = btoa(String.fromCharCode(...digest))

  assert(
    await verifyLineWebhookSignature(rawBody, signature, secret),
    "有效簽章應通過",
  )
  assert(
    !await verifyLineWebhookSignature(`${rawBody} `, signature, secret),
    "body 被修改後應拒絕",
  )
})

Deno.test("sendLinePushMessage 使用 Retry Key 且不把 Token 放入 body", async () => {
  let capturedRetryKey: string | null = null
  let capturedRequestBody = ""
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    capturedRetryKey = request.headers.get("x-line-retry-key")
    capturedRequestBody = await request.text()
    return new Response("{}", {
      status: 200,
      headers: { "x-line-request-id": "request-123" },
    })
  }) as typeof fetch

  const result = await sendLinePushMessage({
    channelAccessToken: "local-test-access-token-value",
    to: "U11111111111111111111111111111111",
    message: "預約已確認",
    retryKey: "90000000-0000-4000-8000-000000000001",
  }, fetchImpl)

  assert(result.requestId === "request-123", "應保留 LINE request ID")
  assert(
    capturedRetryKey === "90000000-0000-4000-8000-000000000001",
    "應帶入工作 UUID 作為 Retry Key",
  )
  assert(!capturedRequestBody.includes("local-test-access-token-value"), "body 不得包含 Token")
})

Deno.test("sendLinePushMessage 將 429 分類為可重試並尊重 Retry-After", async () => {
  const error = await expectMessagingError(
    () => sendLinePushMessage({
      channelAccessToken: "local-test-access-token-value",
      to: "U11111111111111111111111111111111",
      message: "預約提醒",
      retryKey: "90000000-0000-4000-8000-000000000002",
    }, jsonFetch({}, 429, { "Retry-After": "120" })),
    "LINE_RATE_LIMITED",
  )

  assert(error.retryable, "429 應可重試")
  assert(error.retryAfterSeconds === 120, "應使用 Retry-After 秒數")
})

Deno.test("sendLinePushMessage 將 400 分類為不可重試收件者錯誤", async () => {
  const error = await expectMessagingError(
    () => sendLinePushMessage({
      channelAccessToken: "local-test-access-token-value",
      to: "U11111111111111111111111111111111",
      message: "預約提醒",
      retryKey: "90000000-0000-4000-8000-000000000003",
    }, jsonFetch({}, 400)),
    "LINE_RECIPIENT_REJECTED",
  )

  assert(!error.retryable, "400 不應自動重試")
})

Deno.test("calculateLineRetryDelay 使用指數退避與上限", () => {
  assert(calculateLineRetryDelay(1) === 30, "第一次重試應為 30 秒")
  assert(calculateLineRetryDelay(3) === 120, "第三次重試應為 120 秒")
  assert(calculateLineRetryDelay(10) === 3_600, "退避不得超過一小時")
  assert(calculateLineRetryDelay(2, 75) === 75, "LINE Retry-After 優先")
})
