import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface AcceptInvitationPayload {
  token: string
  email: string
  password: string
  name: string
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

    const payload: AcceptInvitationPayload = await req.json()

    // 驗證必要字段
    if (!payload.token || !payload.email || !payload.password || !payload.name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: token, email, password, name" }),
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

    // 驗證密碼複雜度：至少 8 字符，包含大寫、小寫、數字
    if (payload.password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const hasUppercase = /[A-Z]/.test(payload.password)
    const hasLowercase = /[a-z]/.test(payload.password)
    const hasNumber = /\d/.test(payload.password)

    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return new Response(
        JSON.stringify({
          error: "Password must contain uppercase, lowercase, and numbers",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 驗證邀請 token
    const { data: tokenData, error: tokenError } = await supabase
      .rpc("validate_invitation_token", { p_token: payload.token })
      .single()

    if (tokenError || !tokenData || !tokenData.valid) {
      const message = tokenData?.message || "Invalid or expired invitation token"
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 驗證郵件是否匹配邀請中的郵件
    if (tokenData.email !== payload.email) {
      return new Response(
        JSON.stringify({ error: "Email does not match invitation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 建立 Auth 用戶
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true, // 自動確認郵件
    })

    if (authError || !authData.user) {
      console.error("Auth creation error:", authError)
      return new Response(
        JSON.stringify({ error: "Failed to create user account", details: authError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 在 users 表中建立用戶記錄
    const { data: userData, error: userInsertError } = await supabase
      .from("users")
      .insert({
        id: authData.user.id,
        email: payload.email,
        name: payload.name,
        store_id: tokenData.store_id,
        role: tokenData.role,
        invited_by: null, // 將在下一步設定
        invited_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (userInsertError) {
      console.error("User insert error:", userInsertError)
      // 清除已建立的 Auth 用戶
      await supabase.auth.admin.deleteUser(authData.user.id)
      return new Response(
        JSON.stringify({ error: "Failed to create user profile", details: userInsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 更新邀請記錄為已接受
    const { error: updateError } = await supabase
      .from("pending_invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: authData.user.id,
      })
      .eq("token", payload.token)

    if (updateError) {
      console.error("Invitation update error:", updateError)
      // 即使更新失敗，用戶已建立，返回成功
    }

    // 記錄審計日誌
    const { error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        user_id: authData.user.id,
        action: "USER_REGISTERED",
        table_name: "users",
        record_id: userData.id,
        new_values: {
          email: userData.email,
          name: userData.name,
          role: userData.role,
        },
        store_id: userData.store_id,
      })

    if (auditError) {
      console.warn("Failed to create audit log:", auditError)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Invitation accepted and user account created successfully",
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          store_id: userData.store_id,
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
