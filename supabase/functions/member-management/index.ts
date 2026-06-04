import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface UpdateMemberPayload {
  name?: string
  role?: "member" | "admin"
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 驗證授權
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.slice(7)
    const url = new URL(req.url)
    const memberId = url.searchParams.get("id")

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 驗證 JWT token
    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: authUser, error: authError } = await anonSupabase.auth.getUser(token)

    if (authError || !authUser.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 獲取當前用戶信息
    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("id, store_id, role")
      .eq("id", authUser.user.id)
      .single()

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ===== GET: 列出所有成員 =====
    if (req.method === "GET") {
      const { data: members, error: listError } = await supabase
        .from("users")
        .select("id, email, name, role, created_at, updated_at")
        .eq("store_id", currentUser.store_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })

      if (listError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch members", details: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          members: members || [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ===== PUT: 編輯成員 =====
    if (req.method === "PUT") {
      if (!memberId) {
        return new Response(
          JSON.stringify({ error: "Member ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 只有管理員才能編輯成員
      if (currentUser.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Only admins can edit members" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 管理員不能編輯自己的角色
      if (memberId === currentUser.id) {
        return new Response(
          JSON.stringify({ error: "Cannot edit your own role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const payload: UpdateMemberPayload = await req.json()

      // 驗證角色
      if (payload.role && !["member", "admin"].includes(payload.role)) {
        return new Response(
          JSON.stringify({ error: "Invalid role. Must be 'member' or 'admin'" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 準備更新數據
      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (payload.name) {
        updateData.name = payload.name
      }

      if (payload.role) {
        updateData.role = payload.role
      }

      const { data: updatedMember, error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", memberId)
        .eq("store_id", currentUser.store_id)
        .select()
        .single()

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update member", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      if (!updatedMember) {
        return new Response(
          JSON.stringify({ error: "Member not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 記錄審計日誌
      const { error: auditError } = await supabase
        .from("audit_logs")
        .insert({
          user_id: currentUser.id,
          action: "MEMBER_UPDATED",
          table_name: "users",
          record_id: memberId,
          new_values: updateData,
          store_id: currentUser.store_id,
        })

      if (auditError) {
        console.warn("Failed to create audit log:", auditError)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: "Member updated successfully",
          member: updatedMember,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ===== DELETE: 刪除成員（軟刪除）=====
    if (req.method === "DELETE") {
      if (!memberId) {
        return new Response(
          JSON.stringify({ error: "Member ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 只有管理員才能刪除成員
      if (currentUser.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Only admins can delete members" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 管理員不能刪除自己
      if (memberId === currentUser.id) {
        return new Response(
          JSON.stringify({ error: "Cannot delete yourself" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 軟刪除：設定 deleted_at
      const { data: deletedMember, error: deleteError } = await supabase
        .from("users")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", memberId)
        .eq("store_id", currentUser.store_id)
        .select()
        .single()

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to delete member", details: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      if (!deletedMember) {
        return new Response(
          JSON.stringify({ error: "Member not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // 記錄審計日誌（刪除敏感操作）
      const { error: auditError } = await supabase
        .from("audit_logs")
        .insert({
          user_id: currentUser.id,
          action: "MEMBER_DELETED",
          table_name: "users",
          record_id: memberId,
          old_values: {
            email: deletedMember.email,
            name: deletedMember.name,
            role: deletedMember.role,
          },
          store_id: currentUser.store_id,
        })

      if (auditError) {
        console.warn("Failed to create audit log:", auditError)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: "Member deleted successfully",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
