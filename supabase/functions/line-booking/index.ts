import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import {
  LineIdentityError,
  verifyLineIdToken,
} from "../_shared/line.ts"

// PostgreSQL 的 uuid 型別接受標準 8-4-4-4-12 十六進位格式，
// 不要求特定 RFC version／variant 位元；staging 的固定店家 ID 也使用此格式。
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const defaultAllowedOrigins = new Set([
  "https://bookr-5ph.pages.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
])

interface LineBookingPayload {
  storeId?: unknown
  fullName?: unknown
  phone?: unknown
  serviceId?: unknown
  practitionerId?: unknown
  startTime?: unknown
  notes?: unknown
  idToken?: unknown
}

interface StoreLineSettings {
  line_login_channel_id: string | null
  booking_enabled: boolean
}

interface BookingResult {
  ok: boolean
  error?: string
  id?: string
  status?: "pending" | "confirmed"
}

function allowedOrigins() {
  const configured = Deno.env.get("LINE_BOOKING_ALLOWED_ORIGINS")
  if (!configured) return defaultAllowedOrigins

  return new Set(
    configured
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  )
}

function corsHeaders(origin: string | null) {
  const fallbackOrigin = "https://bookr-5ph.pages.dev"
  return {
    "Access-Control-Allow-Origin": origin || fallbackOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Vary": "Origin",
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function containsControlCharacter(value: string, allowFormattingWhitespace = false) {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0) ?? 0
    if (allowFormattingWhitespace && [9, 10, 13].includes(codePoint)) return false
    return codePoint < 32 || codePoint === 127
  })
}

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

function errorStatus(code?: string) {
  if (code === "CONFLICT" || code === "PHONE_LINK_CONFLICT" || code === "PHONE_ALREADY_REGISTERED") {
    return 409
  }
  if (code === "SERVICE_NOT_FOUND" || code === "PRACTITIONER_NOT_FOUND") return 404
  if (code === "STORE_NOT_FOUND" || code === "LINE_CHANNEL_NOT_CONFIGURED") return 403
  return 400
}

serve(async req => {
  const origin = req.headers.get("origin")
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ ok: false, error: "Origin not allowed", code: "ORIGIN_NOT_ALLOWED" }, 403, null)
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405, origin)
  }

  const contentLength = Number(req.headers.get("content-length") || "0")
  if (contentLength > 16_384) {
    return jsonResponse({ ok: false, error: "Request body is too large", code: "PAYLOAD_TOO_LARGE" }, 413, origin)
  }

  let payload: LineBookingPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body", code: "INVALID_JSON" }, 400, origin)
  }

  if (
    typeof payload.storeId !== "string"
    || typeof payload.fullName !== "string"
    || typeof payload.phone !== "string"
    || typeof payload.serviceId !== "string"
    || typeof payload.practitionerId !== "string"
    || typeof payload.startTime !== "string"
    || typeof payload.idToken !== "string"
    || (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== "string")
  ) {
    return jsonResponse({ ok: false, error: "Missing or invalid fields", code: "INVALID_INPUT" }, 400, origin)
  }

  const fullName = payload.fullName.trim()
  const phone = payload.phone.trim()
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : ""
  const startTime = new Date(payload.startTime)

  if (
    !uuidPattern.test(payload.storeId)
    || !uuidPattern.test(payload.serviceId)
    || !uuidPattern.test(payload.practitionerId)
    || !fullName
    || fullName.length > 100
    || containsControlCharacter(fullName)
    || phone.length < 6
    || phone.length > 50
    || containsControlCharacter(phone)
    || notes.length > 2000
    || containsControlCharacter(notes, true)
    || payload.idToken.trim().length === 0
    || payload.idToken.length > 4096
    || Number.isNaN(startTime.getTime())
  ) {
    return jsonResponse({ ok: false, error: "Invalid booking data", code: "INVALID_INPUT" }, 400, origin)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseSecretKey = parseSecretKey()
  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("LINE booking server configuration is incomplete")
    return jsonResponse({ ok: false, error: "Server configuration missing", code: "SERVER_CONFIG_ERROR" }, 500, origin)
  }

  const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: storeData, error: storeError } = await adminClient
    .from("stores")
    .select("line_login_channel_id, booking_enabled")
    .eq("id", payload.storeId)
    .maybeSingle()

  const store = storeData as StoreLineSettings | null
  if (storeError || !store || !store.booking_enabled || !store.line_login_channel_id) {
    return jsonResponse({ ok: false, error: "LINE booking is unavailable", code: "LINE_NOT_CONFIGURED" }, 403, origin)
  }

  let lineIdentity
  try {
    lineIdentity = await verifyLineIdToken(payload.idToken, store.line_login_channel_id)
  } catch (error) {
    if (error instanceof LineIdentityError) {
      const status = error.code === "LINE_VERIFY_UNAVAILABLE" ? 503 : 401
      return jsonResponse({ ok: false, error: "LINE verification failed", code: error.code }, status, origin)
    }

    console.error("Unexpected LINE verification failure")
    return jsonResponse({ ok: false, error: "LINE verification failed", code: "LINE_VERIFY_UNAVAILABLE" }, 503, origin)
  }

  const { data, error } = await adminClient.rpc("create_line_booking", {
    p_full_name: fullName,
    p_phone: phone,
    p_service_id: payload.serviceId,
    p_practitioner_id: payload.practitionerId,
    p_start_time: startTime.toISOString(),
    p_store_id: payload.storeId,
    p_line_provider_account_id: lineIdentity.providerAccountId,
    p_line_user_id: lineIdentity.providerUserId,
    p_line_display_name: lineIdentity.displayName,
    p_line_picture_url: lineIdentity.pictureUrl,
    p_notes: notes || null,
  })

  if (error) {
    console.error("LINE booking database operation failed", error.code || "UNKNOWN_DATABASE_ERROR")
    return jsonResponse({ ok: false, error: "Unable to create booking", code: "DATABASE_ERROR" }, 500, origin)
  }

  const result = data as BookingResult
  if (!result.ok) {
    return jsonResponse(
      { ok: false, error: "Unable to create booking", code: result.error || "BOOKING_FAILED" },
      errorStatus(result.error),
      origin,
    )
  }

  return jsonResponse({
    ok: true,
    id: result.id,
    status: result.status,
  }, 200, origin)
})
