import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import { createLineMessagingSettingsHandler } from "../_shared/line-messaging-settings-handler.ts"

const defaultAllowedOrigins = new Set([
  "https://bookr-5ph.pages.dev",
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

if (!supabaseUrl || !supabaseAnonKey || !supabaseSecretKey) {
  console.error("LINE Messaging settings server configuration is incomplete")
  throw new Error("SERVER_CONFIG_ERROR")
}

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createLineMessagingSettingsHandler({
  allowedOrigins: allowedOrigins(),
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
  configure: async configuration => {
    const { data, error } = await adminClient.rpc("configure_store_line_messaging", {
      p_actor_id: configuration.actorId,
      p_store_id: configuration.storeId,
      p_connection_id: configuration.connectionId,
      p_provider_id: configuration.providerId,
      p_messaging_channel_id: configuration.messagingChannelId,
      p_bot_user_id: configuration.botInfo.botUserId,
      p_bot_basic_id: configuration.botInfo.basicId,
      p_bot_display_name: configuration.botInfo.displayName,
      p_channel_access_token: configuration.channelAccessToken,
      p_channel_secret: configuration.channelSecret,
    })

    if (error || !data) {
      console.error(
        "LINE Messaging configuration RPC failed",
        error?.code || "UNKNOWN_DATABASE_ERROR",
      )
      throw new Error("CONFIGURATION_SAVE_FAILED")
    }

    return data as Record<string, unknown>
  },
})

serve(handler)
