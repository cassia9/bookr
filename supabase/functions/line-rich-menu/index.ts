import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import {
  createLineRichMenuApi,
  createLineRichMenuHandler,
} from "../_shared/line-rich-menu-handler.ts"
import type {
  LineRichMenuConfig,
  LineRichMenuPublicationJob,
} from "../_shared/line-rich-menu-handler.ts"

const defaultAllowedOrigins = new Set([
  "https://bookr-5ph.pages.dev",
  "https://bookr-staging.pages.dev",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
])

function allowedOrigins() {
  const configured = Deno.env.get("LINE_MESSAGING_ALLOWED_ORIGINS")
  if (!configured) return defaultAllowedOrigins

  return new Set(
    configured
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  )
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

const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
const supabaseSecretKey = parseSecretKey()
const bookingOrigin = (
  Deno.env.get("BOOKING_SITE_ORIGIN") || "https://bookr-5ph.pages.dev"
).replace(/\/+$/, "")

if (!supabaseUrl || !supabaseAnonKey || !supabaseSecretKey) {
  console.error("LINE rich menu server configuration is incomplete")
  throw new Error("SERVER_CONFIG_ERROR")
}

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function databaseError(operation: string, code?: string) {
  console.error(`LINE rich menu ${operation} failed`, code || "UNKNOWN_DATABASE_ERROR")
  return new Error("RICH_MENU_DATABASE_ERROR")
}

const handler = createLineRichMenuHandler({
  allowedOrigins: allowedOrigins(),
  bookingOrigin,
  lineApi: createLineRichMenuApi(),
  authenticate: async token => {
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) return null

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id, store_id, role")
      .eq("id", authData.user.id)
      .is("deleted_at", null)
      .maybeSingle()

    if (profileError || !profile || !["admin", "member"].includes(profile.role)) {
      return null
    }

    return {
      id: profile.id,
      storeId: profile.store_id,
      role: profile.role as "admin" | "member",
    }
  },
  authorizePublication: async (publicationId, storeId) => {
    const { data, error } = await adminClient
      .from("line_rich_menu_publications")
      .select("id")
      .eq("id", publicationId)
      .eq("store_id", storeId)
      .eq("status", "queued")
      .maybeSingle()

    if (error) throw databaseError("authorization", error.code)
    return Boolean(data)
  },
  claimPublication: async publicationId => {
    const { data, error } = await adminClient.rpc("claim_line_rich_menu_publication", {
      p_publication_id: publicationId,
    })
    if (error) throw databaseError("claim", error.code)

    const row = Array.isArray(data) ? data[0] : null
    if (!row) return null

    return {
      publicationId: row.publication_id,
      storeId: row.store_id,
      setId: row.set_id,
      versionNumber: row.version_number,
      config: row.config_snapshot as unknown as LineRichMenuConfig,
      channelAccessToken: row.channel_access_token,
      storeCode: row.store_code,
      liffId: row.liff_id,
      imageBucket: row.image_bucket,
    } satisfies LineRichMenuPublicationJob
  },
  downloadImage: async (bucket, path) => {
    const { data, error } = await adminClient.storage.from(bucket).download(path)
    if (error || !data) throw databaseError("image download", error?.message)

    const contentType = data.type === "image/jpeg" ? "image/jpeg" : data.type === "image/png"
      ? "image/png"
      : null
    if (!contentType) throw new Error("RICH_MENU_IMAGE_TYPE_INVALID")

    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType,
    }
  },
  completePublication: async (publicationId, resourceMap) => {
    const { data, error } = await adminClient.rpc("complete_line_rich_menu_publication", {
      p_publication_id: publicationId,
      p_line_resource_map: resourceMap,
    })
    if (error) throw databaseError("complete", error.code)
    return data === true
  },
  failPublication: async (publicationId, errorCode, errorMessage) => {
    const { error } = await adminClient.rpc("fail_line_rich_menu_publication", {
      p_publication_id: publicationId,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    })
    if (error) console.error("LINE rich menu failure record failed", error.code)
  },
})

serve(handler)
