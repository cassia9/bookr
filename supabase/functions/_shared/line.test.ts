import {
  LineIdentityError,
  verifyLineIdToken,
} from "./line.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function verifiedPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://access.line.me",
    sub: "U11111111111111111111111111111111",
    aud: "2000000001",
    exp: Math.floor(Date.now() / 1000) + 300,
    name: "LINE 測試客戶",
    picture: "https://profile.line-scdn.net/test",
    ...overrides,
  }
}

function jsonFetch(payload: Record<string, unknown>, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch
}

Deno.test("verifyLineIdToken 回傳已驗證的 LINE 身分", async () => {
  const identity = await verifyLineIdToken(
    "header.payload.signature",
    "2000000001",
    jsonFetch(verifiedPayload()),
  )

  assert(identity.providerAccountId === "2000000001", "Channel ID 應一致")
  assert(identity.providerUserId === "U11111111111111111111111111111111", "user ID 應一致")
  assert(identity.displayName === "LINE 測試客戶", "顯示名稱應一致")
  assert(identity.pictureUrl === "https://profile.line-scdn.net/test", "頭像網址應一致")
})

Deno.test("verifyLineIdToken 拒絕不符的 Channel ID", async () => {
  try {
    await verifyLineIdToken(
      "header.payload.signature",
      "2000000001",
      jsonFetch(verifiedPayload({ aud: "2000000002" })),
    )
    throw new Error("預期驗證失敗")
  } catch (error) {
    assert(error instanceof LineIdentityError, "應回傳 LineIdentityError")
    assert(error.code === "LINE_TOKEN_REJECTED", "錯誤碼應為 LINE_TOKEN_REJECTED")
  }
})

Deno.test("verifyLineIdToken 拒絕非 LINE 格式的 user ID", async () => {
  try {
    await verifyLineIdToken(
      "header.payload.signature",
      "2000000001",
      jsonFetch(verifiedPayload({ sub: "not-a-line-user" })),
    )
    throw new Error("預期驗證失敗")
  } catch (error) {
    assert(error instanceof LineIdentityError, "應回傳 LineIdentityError")
    assert(error.code === "LINE_TOKEN_REJECTED", "錯誤碼應為 LINE_TOKEN_REJECTED")
  }
})

Deno.test("verifyLineIdToken 拒絕過期 token", async () => {
  try {
    await verifyLineIdToken(
      "header.payload.signature",
      "2000000001",
      jsonFetch(verifiedPayload({ exp: Math.floor(Date.now() / 1000) - 60 })),
    )
    throw new Error("預期驗證失敗")
  } catch (error) {
    assert(error instanceof LineIdentityError, "應回傳 LineIdentityError")
    assert(error.code === "LINE_TOKEN_REJECTED", "錯誤碼應為 LINE_TOKEN_REJECTED")
  }
})

Deno.test("verifyLineIdToken 不接受 LINE 上游拒絕的 token", async () => {
  try {
    await verifyLineIdToken(
      "header.payload.signature",
      "2000000001",
      jsonFetch({ error: "invalid_request" }, 400),
    )
    throw new Error("預期驗證失敗")
  } catch (error) {
    assert(error instanceof LineIdentityError, "應回傳 LineIdentityError")
    assert(error.code === "LINE_TOKEN_REJECTED", "錯誤碼應為 LINE_TOKEN_REJECTED")
  }
})

Deno.test("verifyLineIdToken 丟棄不安全的頭像網址", async () => {
  const identity = await verifyLineIdToken(
    "header.payload.signature",
    "2000000001",
    jsonFetch(verifiedPayload({ picture: "http://example.test/avatar.png" })),
  )

  assert(identity.pictureUrl === null, "非 HTTPS 頭像不得保留")
})
