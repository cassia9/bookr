import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import { createLineNotificationWorkerHandler } from "../_shared/line-notification-worker-handler.ts"
import type { LineNotificationJob } from "../_shared/line-notification-worker-handler.ts"

function parseSecretKey() {
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>
      const defaultKey = parsed.default
      if (typeof defaultKey === "string" && defaultKey) return defaultKey
    } catch {
      // 繼續嘗試本地及舊版相容環境變數。
    }
  }

  return Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || null
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseSecretKey = parseSecretKey()
const workerSecret = Deno.env.get("LINE_NOTIFICATION_WORKER_SECRET") || ""

if (!supabaseUrl || !supabaseSecretKey || workerSecret.length < 32) {
  console.error("LINE notification Worker server configuration is incomplete")
  throw new Error("SERVER_CONFIG_ERROR")
}

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function databaseError(operation: string, code?: string) {
  console.error(`LINE notification ${operation} failed`, code || "UNKNOWN_DATABASE_ERROR")
  return new Error("QUEUE_OPERATION_FAILED")
}

const handler = createLineNotificationWorkerHandler({
  workerSecret,
  enqueueReminders: async () => {
    const { data, error } = await adminClient.rpc("enqueue_line_reminders")
    if (error) throw databaseError("reminder enqueue", error.code)
    return Number(data || 0)
  },
  claimJobs: async limit => {
    const { data, error } = await adminClient.rpc("claim_line_notification_jobs", {
      p_limit: limit,
    })
    if (error) throw databaseError("claim", error.code)
    return (Array.isArray(data) ? data : []) as LineNotificationJob[]
  },
  completeJob: async (jobId, lineRequestId) => {
    const { data, error } = await adminClient.rpc("complete_line_notification_job", {
      p_job_id: jobId,
      p_line_request_id: lineRequestId,
    })
    if (error) throw databaseError("complete", error.code)
    return data === true
  },
  retryJob: async (jobId, errorCode, httpStatus, retryAfterSeconds) => {
    const { data, error } = await adminClient.rpc("retry_line_notification_job", {
      p_job_id: jobId,
      p_error_code: errorCode,
      p_http_status: httpStatus,
      p_retry_after_seconds: retryAfterSeconds,
    })
    if (error) throw databaseError("retry", error.code)
    return data === true
  },
  skipJob: async (jobId, reason) => {
    const { data, error } = await adminClient.rpc("skip_line_notification_job", {
      p_job_id: jobId,
      p_reason: reason,
    })
    if (error) throw databaseError("skip", error.code)
    return data === true
  },
})

serve(handler)
