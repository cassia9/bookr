import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface InvitePayload {
  email: string
  role: "member" | "admin"
  storeName: string
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 驗證授權
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.slice(7)
    const payload: InvitePayload = await req.json()

    // 驗證必要字段
    if (!payload.email || !payload.role || !payload.storeName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, role, storeName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 驗證郵件格式
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(payload.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 驗證角色
    if (!["member", "admin"].includes(payload.role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role. Must be 'member' or 'admin'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 建立 Supabase 客戶端
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 使用 anon key 建立客戶端驗證 JWT token
    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: authUser, error: authError } = await anonSupabase.auth.getUser(token)

    if (authError || !authUser.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 建立 service 客戶端執行操作
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 驗證當前用戶是否為管理員
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

    if (currentUser.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can invite members" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 檢查郵件是否已註冊為正式成員
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("store_id", currentUser.store_id)
      .eq("email", payload.email)
      .is("deleted_at", null)
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "User with this email already exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 刪除同一 email 的舊邀請（不論狀態），避免 UNIQUE(store_id, email) 衝突
    await supabase
      .from("pending_invitations")
      .delete()
      .eq("store_id", currentUser.store_id)
      .eq("email", payload.email)
      .is("accepted_at", null)

    // 創建邀請記錄
    const { data: invitation, error: insertError } = await supabase
      .from("pending_invitations")
      .insert({
        store_id: currentUser.store_id,
        email: payload.email,
        role: payload.role,
        created_by: currentUser.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error("Failed to create invitation:", insertError)
      return new Response(
        JSON.stringify({ error: "Failed to create invitation", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 生成邀請鏈接
    const appUrl = Deno.env.get("APP_URL") || req.headers.get("Origin") || "https://bookr-5ph.pages.dev"
    const invitationLink = `${appUrl}/auth/accept-invitation?token=${invitation.token}`

    // 呼叫郵件發送函數
    const mailResponse = await fetch(`${supabaseUrl}/functions/v1/send-invitation-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.email,
        storeName: payload.storeName,
        invitationLink: invitationLink,
        invitedByName: currentUser.id, // 應該是用戶名，簡化版使用 ID
      }),
    })

    if (!mailResponse.ok) {
      const mailError = await mailResponse.text()
      console.error("Mail service error:", mailError)
      // 即使郵件失敗，邀請記錄已建立，返回成功但提示郵件可能失敗
      return new Response(
        JSON.stringify({
          ok: true,
          warning: "Invitation created but email delivery may have failed",
          invitation: {
            id: invitation.id,
            token: invitation.token,
            email: invitation.email,
            expires_at: invitation.expires_at,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 記錄審計日誌
    const { error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        user_id: currentUser.id,
        action: "MEMBER_INVITED",
        table_name: "pending_invitations",
        record_id: invitation.id,
        new_values: {
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
        },
        store_id: currentUser.store_id,
      })

    if (auditError) {
      console.warn("Failed to create audit log:", auditError)
      // 不中斷流程，只警告
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Invitation created and email sent successfully",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          expires_at: invitation.expires_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
