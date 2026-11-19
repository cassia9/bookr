import { classifySendGridFailureStatus } from "./invitation-email.ts"

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
  }
}

Deno.test("SendGrid 401 會辨識為寄信憑證失效", () => {
  assertEquals(classifySendGridFailureStatus(401), "EMAIL_PROVIDER_UNAUTHORIZED")
})

Deno.test("SendGrid 403 會辨識為寄信權限或寄件者遭拒", () => {
  assertEquals(classifySendGridFailureStatus(403), "EMAIL_PROVIDER_FORBIDDEN")
})

Deno.test("SendGrid 429 會辨識為寄信流量限制", () => {
  assertEquals(classifySendGridFailureStatus(429), "EMAIL_PROVIDER_RATE_LIMITED")
})

Deno.test("SendGrid 5xx 會辨識為寄信服務暫時不可用", () => {
  assertEquals(classifySendGridFailureStatus(503), "EMAIL_PROVIDER_UNAVAILABLE")
})

Deno.test("其他拒絕狀態不會暴露上游回應內容", () => {
  assertEquals(classifySendGridFailureStatus(422), "EMAIL_PROVIDER_REJECTED")
})
