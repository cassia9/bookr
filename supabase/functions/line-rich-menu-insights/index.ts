import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import {
  createLineRichMenuInsightsApi,
  createLineRichMenuInsightsHandler,
} from "../_shared/line-rich-menu-insights-handler.ts";
import type { LineRichMenuInsightJob } from "../_shared/line-rich-menu-insights-handler.ts";

const defaultAllowedOrigins = new Set([
  "https://bookr-5ph.pages.dev",
  "https://bookr-staging.pages.dev",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
]);

function allowedOrigins() {
  const configured = Deno.env.get("LINE_MESSAGING_ALLOWED_ORIGINS");
  if (!configured) return defaultAllowedOrigins;
  return new Set(
    configured.split(",").map((origin) => origin.trim()).filter(Boolean),
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
      // 繼續嘗試本地及舊版相容環境變數。
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseSecretKey = parseSecretKey();

if (!supabaseUrl || !supabaseAnonKey || !supabaseSecretKey) {
  console.error("LINE rich menu insights server configuration is incomplete");
  throw new Error("SERVER_CONFIG_ERROR");
}

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function databaseError(operation: string, code?: string) {
  console.error(
    `LINE rich menu insights ${operation} failed`,
    code || "UNKNOWN_DATABASE_ERROR",
  );
  return new Error("RICH_MENU_INSIGHTS_DATABASE_ERROR");
}

const handler = createLineRichMenuInsightsHandler({
  allowedOrigins: allowedOrigins(),
  lineApi: createLineRichMenuInsightsApi(),
  authenticate: async (token) => {
    const { data: authData, error: authError } = await authClient.auth.getUser(
      token,
    );
    if (authError || !authData.user) return null;

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id, store_id, role")
      .eq("id", authData.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      profileError || !profile || !["admin", "member"].includes(profile.role)
    ) return null;

    return {
      id: profile.id,
      storeId: profile.store_id,
      role: profile.role as "admin" | "member",
    };
  },
  authorizePublication: async (publicationId, storeId) => {
    const { data, error } = await adminClient
      .from("line_rich_menu_publications")
      .select("id")
      .eq("id", publicationId)
      .eq("store_id", storeId)
      .in("status", ["published", "superseded"])
      .maybeSingle();
    if (error) throw databaseError("authorization", error.code);
    return Boolean(data);
  },
  getJob: async (publicationId) => {
    const { data, error } = await adminClient.rpc(
      "get_line_rich_menu_insight_job",
      {
        p_publication_id: publicationId,
      },
    );
    if (error) throw databaseError("job", error.code);
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    return {
      publicationId: row.publication_id,
      storeId: row.store_id,
      config: row.config_snapshot,
      resourceMap: row.line_resource_map,
      channelAccessToken: row.channel_access_token,
      publishedAt: row.published_at,
      finishedAt: row.finished_at,
    } as LineRichMenuInsightJob;
  },
  upsertMetric: async (metric) => {
    const { data, error } = await adminClient.rpc(
      "upsert_line_rich_menu_daily_metric",
      {
        p_publication_id: metric.publicationId,
        p_metric_date: metric.metricDate,
        p_page_key: metric.pageKey,
        p_area_key: metric.areaKey,
        p_impressions: metric.impressions,
        p_clicks: metric.clicks,
        p_unique_users: metric.uniqueUsers,
      },
    );
    if (error) throw databaseError("metric upsert", error.code);
    return data === true;
  },
});

serve(handler);
