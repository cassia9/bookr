import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { createLineCustomerCenterHandler } from "../_shared/line-customer-center-handler.ts";
import { verifyLineIdToken } from "../_shared/line.ts";

const defaultAllowedOrigins = new Set([
  "https://bookr-5ph.pages.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function allowedOrigins() {
  const configured = Deno.env.get("LINE_BOOKING_ALLOWED_ORIGINS");
  if (!configured) return defaultAllowedOrigins;
  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function parseSecretKey() {
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // 繼續嘗試本地與舊版相容環境變數。
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    null;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseSecretKey = parseSecretKey();

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("LINE customer center server configuration is incomplete");
}

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createLineCustomerCenterHandler({
  allowedOrigins: allowedOrigins(),
  getLineChannelId: async (storeId) => {
    const { data, error } = await adminClient
      .from("stores")
      .select("line_login_channel_id, booking_enabled")
      .eq("id", storeId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.booking_enabled) return null;
    return data.line_login_channel_id;
  },
  verifyIdentity: verifyLineIdToken,
  loadCustomerCenter: async (storeId, identity) => {
    const { data, error } = await adminClient.rpc("get_line_customer_center", {
      p_store_id: storeId,
      p_provider_account_id: identity.providerAccountId,
      p_provider_user_id: identity.providerUserId,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  },
});

serve(handler);
