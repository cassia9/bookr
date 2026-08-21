import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import { createLineWebhookHandler } from "../_shared/line-webhook-handler.ts"

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

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("LINE Webhook server configuration is incomplete")
  throw new Error("SERVER_CONFIG_ERROR")
}

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createLineWebhookHandler({
  getConfig: async connectionId => {
    const { data, error } = await adminClient.rpc("get_line_webhook_config", {
      p_connection_id: connectionId,
    })

    if (error) {
      console.error("LINE Webhook config lookup failed", error.code || "UNKNOWN_DATABASE_ERROR")
      return null
    }

    const config = Array.isArray(data) ? data[0] : null
    if (!config) return null

    return {
      storeId: config.store_id,
      connectionId: config.connection_id,
      channelSecret: config.channel_secret,
      loginChannelId: config.login_channel_id,
    }
  },
  recordEvent: async event => {
    const { error } = await adminClient.rpc("record_line_webhook_event", {
      p_connection_id: event.connectionId,
      p_webhook_event_id: event.webhookEventId,
      p_event_type: event.eventType,
      p_provider_user_id: event.providerUserId,
    })

    if (error) {
      console.error(
        "LINE Webhook event persistence failed",
        error.code || "UNKNOWN_DATABASE_ERROR",
      )
      throw new Error("WEBHOOK_PROCESSING_FAILED")
    }
  },
})

serve(handler)
