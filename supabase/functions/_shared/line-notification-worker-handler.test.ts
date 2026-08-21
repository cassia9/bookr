import { createLineNotificationWorkerHandler } from "./line-notification-worker-handler.ts"
import type { LineNotificationJob } from "./line-notification-worker-handler.ts"
import { LineMessagingError } from "./line-messaging.ts"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const workerSecret = "local-worker-secret-with-at-least-32-characters"

function validJob(overrides: Partial<LineNotificationJob> = {}): LineNotificationJob {
  return {
    job_id: "90000000-0000-4000-8000-000000000001",
    store_id: "00000000-0000-4000-8000-000000000001",
    booking_id: "80000000-0000-4000-8000-000000000001",
    event_type: "booking_confirmed",
    idempotency_key: "booking:test:confirmed",
    attempt_count: 1,
    channel_access_token: "local-test-access-token-value",
    provider_user_id: "U11111111111111111111111111111111",
    friend_status: "friend",
    template_content: "{{store_name}}：{{customer_name}} 的 {{service_name}} 已確認，老師 {{practitioner_name}}，時間 {{start_time}}",
    customer_name: "王小明",
    service_name: "伸展課",
    practitioner_name: "林老師",
    start_time: "2026-08-22T06:00:00.000Z",
    booking_status: "confirmed",
    store_name: "Bookr",
    store_timezone: "Asia/Taipei",
    ...overrides,
  }
}

function request(secret = workerSecret) {
  return new Request("http://localhost/line-notification-worker", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  })
}

function dependencies(jobs: LineNotificationJob[], overrides: Record<string, unknown> = {}) {
  const completed: string[] = []
  const retried: string[] = []
  const skipped: string[] = []

  return {
    state: { completed, retried, skipped },
    values: {
      workerSecret,
      enqueueReminders: async () => 0,
      claimJobs: async () => jobs,
      completeJob: async (jobId: string) => {
        completed.push(jobId)
        return true
      },
      retryJob: async (jobId: string) => {
        retried.push(jobId)
        return true
      },
      skipJob: async (jobId: string) => {
        skipped.push(jobId)
        return true
      },
      send: async () => ({ requestId: "line-request-1" }),
      ...overrides,
    },
  }
}

Deno.test("Worker 拒絕無效 secret 且不碰佇列", async () => {
  let queueCalled = false
  const setup = dependencies([], {
    enqueueReminders: async () => {
      queueCalled = true
      return 0
    },
  })
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request("wrong-secret"))

  assert(response.status === 401, "無效 secret 應回 401")
  assert(!queueCalled, "未授權不得碰佇列")
})

Deno.test("Worker 組版發送並完成有效確認通知", async () => {
  let sentMessage = ""
  const job = validJob()
  const setup = dependencies([job], {
    enqueueReminders: async () => 1,
    send: async (options: { message: string }) => {
      sentMessage = options.message
      return { requestId: "line-request-1" }
    },
  })
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()

  assert(response.status === 200, "有效 Worker 請求應成功")
  assert(body.enqueuedReminders === 1, "應回報新提醒數")
  assert(body.sent === 1, "應完成一筆發送")
  assert(setup.state.completed[0] === job.job_id, "應完成正確工作")
  assert(sentMessage.includes("14:00"), "訊息應使用店家時區")
})

Deno.test("Worker 略過狀態已改變的舊確認通知", async () => {
  const setup = dependencies([validJob({ booking_status: "cancelled" })])
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()

  assert(body.skipped === 1, "舊確認通知應略過")
  assert(setup.state.skipped.length === 1, "應呼叫 skip RPC")
  assert(setup.state.completed.length === 0, "不得標為送出")
})

Deno.test("Worker 略過已取消好友的身分", async () => {
  const setup = dependencies([validJob({ friend_status: "not_friend" })])
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()
  assert(body.skipped === 1, "非好友應略過")
  assert(setup.state.skipped.length === 1, "應記錄略過")
})

Deno.test("Worker 將 LINE 429 排入重試", async () => {
  let retryDelay = 0
  const setup = dependencies([validJob({ attempt_count: 2 })], {
    send: async () => {
      throw new LineMessagingError("LINE_RATE_LIMITED", "rate limited", {
        retryable: true,
        httpStatus: 429,
        retryAfterSeconds: 90,
      })
    },
    retryJob: async (
      _jobId: string,
      _errorCode: string,
      _httpStatus: number | null,
      retryAfterSeconds: number,
    ) => {
      retryDelay = retryAfterSeconds
      return true
    },
  })
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()

  assert(body.retried === 1, "429 應重試")
  assert(retryDelay === 90, "應尊重 LINE Retry-After")
})

Deno.test("Worker 將不可重試的 LINE 400 標為略過", async () => {
  const setup = dependencies([validJob()], {
    send: async () => {
      throw new LineMessagingError("LINE_RECIPIENT_REJECTED", "bad recipient", {
        httpStatus: 400,
      })
    },
  })
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()

  assert(body.skipped === 1, "不可重試錯誤應略過")
  assert(setup.state.retried.length === 0, "400 不得自動重試")
})

Deno.test("Worker 略過缺少範本或秘密的工作", async () => {
  const setup = dependencies([
    validJob({ template_content: null }),
    validJob({
      job_id: "90000000-0000-4000-8000-000000000002",
      channel_access_token: null,
    }),
  ])
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()
  assert(body.skipped === 2, "資料缺失工作都應略過")
})

Deno.test("Worker 將未知暫時錯誤排入重試", async () => {
  const setup = dependencies([validJob()], {
    send: async () => {
      throw new Error("network reset")
    },
  })
  const handler = createLineNotificationWorkerHandler(setup.values)
  const response = await handler(request())
  const body = await response.json()
  assert(body.retried === 1, "未知暫時錯誤應重試")
})
