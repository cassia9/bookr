import { classifyEmailProviderFailureStatus } from "./invitation-email.ts"

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
  }
}

Deno.test("寄信服務 401 會辨識為憑證失效", () => {
  assertEquals(classifyEmailProviderFailureStatus(401), "EMAIL_PROVIDER_UNAUTHORIZED")
})

Deno.test("寄信服務 403 會辨識為權限或寄件者遭拒", () => {
  assertEquals(classifyEmailProviderFailureStatus(403), "EMAIL_PROVIDER_FORBIDDEN")
})

Deno.test("寄信服務 429 會辨識為流量限制", () => {
  assertEquals(classifyEmailProviderFailureStatus(429), "EMAIL_PROVIDER_RATE_LIMITED")
})

Deno.test("寄信服務 5xx 會辨識為暫時不可用", () => {
  assertEquals(classifyEmailProviderFailureStatus(503), "EMAIL_PROVIDER_UNAVAILABLE")
})

Deno.test("其他拒絕狀態不會暴露上游回應內容", () => {
  assertEquals(classifyEmailProviderFailureStatus(422), "EMAIL_PROVIDER_REJECTED")
})
