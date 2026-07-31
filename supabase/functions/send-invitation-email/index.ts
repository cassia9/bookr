import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface InvitationPayload {
  invitationId: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

// SendGrid 郵件發送函數
async function sendEmailViaSendGrid(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY")
  if (!sendGridApiKey) {
    return { success: false, error: "SENDGRID_API_KEY not configured" }
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sendGridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
            subject: subject,
          },
        ],
        from: {
          email: Deno.env.get("SENDGRID_FROM_EMAIL") || "noreply@booking-system.com",
          name: Deno.env.get("SENDGRID_FROM_NAME") || "預約管理系統",
        },
        content: [
          {
            type: "text/html",
            value: htmlContent,
          },
        ],
        reply_to: {
          email: Deno.env.get("SENDGRID_REPLY_EMAIL") || "support@booking-system.com",
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("SendGrid error:", error)
      return { success: false, error: `SendGrid returned ${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error("Error sending email:", error)
    return { success: false, error: error.message }
  }
}

// 郵件範本
function generateInvitationEmailHtml(
  storeName: string,
  invitationLink: string,
  invitedByName: string
): string {
  const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("zh-TW")

  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>你受到邀請加入 ${storeName}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

                <!-- Wordmark -->
                <tr>
                  <td style="padding-bottom:28px;text-align:center;">
                    <span style="font-size:13px;font-weight:600;letter-spacing:0.08em;color:#6366f1;text-transform:uppercase;">預約管理系統</span>
                  </td>
                </tr>

                <!-- Card -->
                <tr>
                  <td style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">

                    <!-- Accent bar -->
                    <div style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6);"></div>

                    <!-- Body -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:40px 40px 32px;">

                          <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#a1a1aa;">邀請</p>
                          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#09090b;letter-spacing:-0.02em;line-height:1.3;">
                            加入 ${storeName}
                          </h1>

                          <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.7;">
                            管理員 <strong style="color:#18181b;">${invitedByName}</strong> 邀請你加入預約管理系統，開始協作管理客戶預約與工作行程。
                          </p>

                          <!-- CTA Button -->
                          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
                            <tr>
                              <td>
                                <a href="${invitationLink}"
                                   style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;letter-spacing:-0.01em;">
                                  完成註冊 →
                                </a>
                              </td>
                            </tr>
                          </table>

                          <!-- Divider -->
                          <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">

                          <!-- Features -->
                          <p style="margin:0 0 14px;font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">加入後你可以</p>
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td style="padding:6px 0;font-size:14px;color:#52525b;">
                                <span style="color:#6366f1;font-weight:700;margin-right:10px;">—</span>管理客戶預約與行程
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:14px;color:#52525b;">
                                <span style="color:#6366f1;font-weight:700;margin-right:10px;">—</span>查看個人工作時程表
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:14px;color:#52525b;">
                                <span style="color:#6366f1;font-weight:700;margin-right:10px;">—</span>標記課程完成狀態
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:14px;color:#52525b;">
                                <span style="color:#6366f1;font-weight:700;margin-right:10px;">—</span>協作管理客戶資訊
                              </td>
                            </tr>
                          </table>

                          <!-- Expiry notice -->
                          <div style="margin-top:28px;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;">
                            <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
                              此邀請連結將於 <strong style="color:#18181b;">${expirationDate}</strong> 到期。
                              若連結失效，請聯絡管理員 ${invitedByName} 重新發送。
                            </p>
                          </div>

                          <!-- Link fallback -->
                          <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">
                            無法點擊按鈕？複製以下連結到瀏覽器：<br>
                            <a href="${invitationLink}" style="color:#6366f1;text-decoration:none;">${invitationLink}</a>
                          </p>

                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:24px 0;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.8;">
                      由 <strong style="color:#71717a;">${storeName}</strong> 透過預約管理系統發送<br>
                      這是一封自動郵件，請勿直接回覆<br>
                      &copy; 2026 預約管理系統
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

serve(async (req) => {
  // 處理 CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 驗證是否為 POST 請求
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Edge Function Gateway 會先驗證 JWT；這裡再次驗證使用者與管理員權限。
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.slice(7)
    const payload: InvitationPayload = await req.json()

    if (!payload.invitationId) {
      return new Response(
        JSON.stringify({ error: "Invitation ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const appUrl = Deno.env.get("APP_URL") || "https://bookr-5ph.pages.dev"

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: authData, error: authError } = await anonSupabase.auth.getUser(token)

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("id, store_id, role, full_name")
      .eq("id", authData.user.id)
      .is("deleted_at", null)
      .single()

    if (userError || !currentUser || currentUser.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: invitation, error: invitationError } = await supabase
      .from("pending_invitations")
      .select("id, email, token, store_id, expires_at")
      .eq("id", payload.invitationId)
      .eq("store_id", currentUser.store_id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (invitationError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found or expired" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("name")
      .eq("id", currentUser.store_id)
      .single()

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ error: "Store not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const trustedBaseUrl = new URL(appUrl)
    const invitationUrl = new URL("/auth/accept-invitation", trustedBaseUrl)
    invitationUrl.searchParams.set("token", invitation.token)

    const storeName = escapeHtml(store.name)
    const invitedByName = escapeHtml(currentUser.full_name || "管理員")
    const invitationLink = escapeHtml(invitationUrl.toString())

    // 生成 HTML 內容
    const htmlContent = generateInvitationEmailHtml(
      storeName,
      invitationLink,
      invitedByName
    )

    // 發送郵件
    const result = await sendEmailViaSendGrid(
      invitation.email,
      `[${store.name.replaceAll(/[\r\n]/g, " ")}] 邀請你加入預約管理系統`,
      htmlContent
    )

    if (!result.success) {
      console.error("Email send failed:", result.error)
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Invitation email sent successfully",
        invitationId: invitation.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
