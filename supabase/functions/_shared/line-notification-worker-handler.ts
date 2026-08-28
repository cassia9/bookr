import {
  buildLineBookingFlexMessage,
  calculateLineRetryDelay,
  formatLineBookingTime,
  LineMessagingError,
  renderLineMessageTemplate,
  sendLinePushMessage,
  validateLineMessageTemplate,
} from "./line-messaging.ts"

export type LineNotificationEvent =
  | "booking_received"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "reminder"
  | "test"

export interface LineNotificationJob {
  job_id: string
  store_id: string
  booking_id: string | null
  event_type: LineNotificationEvent
  idempotency_key: string
  attempt_count: number
  channel_access_token: string | null
  provider_user_id: string | null
  friend_status: "unknown" | "friend" | "not_friend" | null
  template_content: string | null
  customer_name: string | null
  service_name: string | null
  practitioner_name: string | null
  start_time: string | null
  booking_status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | null
  store_name: string | null
  store_timezone: string | null
}

export interface LineNotificationWorkerDependencies {
  workerSecret: string
  enqueueReminders: () => Promise<number>
  claimJobs: (limit: number) => Promise<LineNotificationJob[]>
  completeJob: (jobId: string, lineRequestId: string | null) => Promise<boolean>
  retryJob: (
    jobId: string,
    errorCode: string,
    httpStatus: number | null,
    retryAfterSeconds: number,
  ) => Promise<boolean>
  skipJob: (jobId: string, reason: string) => Promise<boolean>
  send?: typeof sendLinePushMessage
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

async function constantTimeEqual(left: string, right: string) {
  if (!left || !right) return false

  const encoder = new TextEncoder()
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = 0

  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

function skipReason(job: LineNotificationJob) {
  if (job.friend_status === "not_friend") return "line_not_reachable"
  if (
    !job.channel_access_token
    || !job.provider_user_id
    || !job.template_content
    || !job.customer_name
    || !job.store_name
    || !job.store_timezone
  ) {
    return "notification_data_missing"
  }

  if (job.event_type === "test") return null

  if (!job.booking_id || !job.start_time || !job.booking_status) {
    return "booking_not_available"
  }

  if (job.event_type === "booking_received" && job.booking_status !== "pending") {
    return "booking_state_changed"
  }
  if (job.event_type === "booking_confirmed" && job.booking_status !== "confirmed") {
    return "booking_state_changed"
  }
  if (job.event_type === "booking_cancelled" && job.booking_status !== "cancelled") {
    return "booking_state_changed"
  }
  if (
    job.event_type === "booking_rescheduled"
    && !["pending", "confirmed"].includes(job.booking_status)
  ) {
    return "booking_state_changed"
  }
  if (job.event_type === "reminder" && job.booking_status !== "confirmed") {
    return "booking_state_changed"
  }

  return null
}

export function createLineNotificationWorkerHandler(
  dependencies: LineNotificationWorkerDependencies,
) {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405)
    }

    const authHeader = request.headers.get("authorization")
    const suppliedSecret = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : ""

    if (
      dependencies.workerSecret.length < 32
      || suppliedSecret.length > 512
      || !await constantTimeEqual(suppliedSecret, dependencies.workerSecret)
    ) {
      return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401)
    }

    let enqueuedReminders = 0
    let jobs: LineNotificationJob[]
    try {
      enqueuedReminders = await dependencies.enqueueReminders()
      jobs = await dependencies.claimJobs(20)
    } catch {
      return jsonResponse({ ok: false, code: "QUEUE_UNAVAILABLE" }, 500)
    }

    let sent = 0
    let retried = 0
    let skipped = 0
    const send = dependencies.send || sendLinePushMessage

    for (const job of jobs) {
      const reason = skipReason(job)
      if (reason) {
        await dependencies.skipJob(job.job_id, reason)
        skipped += 1
        continue
      }

      try {
        const templateValues = {
          customer_name: job.customer_name as string,
          service_name: job.service_name || "",
          practitioner_name: job.practitioner_name || "",
          start_time: formatLineBookingTime(
            job.start_time as string,
            job.store_timezone as string,
          ),
          store_name: job.store_name as string,
        }
        const renderedText = job.event_type === "test"
          ? validateLineMessageTemplate(job.template_content as string)
          : renderLineMessageTemplate(job.template_content as string, templateValues)
        const message = job.event_type === "test"
          ? renderedText
          : buildLineBookingFlexMessage(job.event_type, renderedText, templateValues)

        const result = await send({
          channelAccessToken: job.channel_access_token as string,
          to: job.provider_user_id as string,
          message,
          retryKey: job.job_id,
        })

        if (await dependencies.completeJob(job.job_id, result.requestId)) {
          sent += 1
        } else {
          retried += 1
        }
      } catch (error) {
        if (error instanceof LineMessagingError && !error.retryable) {
          await dependencies.skipJob(job.job_id, error.code.toLowerCase())
          skipped += 1
          continue
        }

        const errorCode = error instanceof LineMessagingError
          ? error.code.toLowerCase()
          : "unexpected_worker_error"
        const httpStatus = error instanceof LineMessagingError ? error.httpStatus : null
        const retryAfter = calculateLineRetryDelay(
          job.attempt_count,
          error instanceof LineMessagingError ? error.retryAfterSeconds : null,
        )

        await dependencies.retryJob(
          job.job_id,
          errorCode,
          httpStatus,
          retryAfter,
        )
        retried += 1
      }
    }

    return jsonResponse({
      ok: true,
      enqueuedReminders,
      claimed: jobs.length,
      sent,
      retried,
      skipped,
    }, 200)
  }
}
