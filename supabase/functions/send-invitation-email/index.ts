import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" }
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface InvitationPayload {
  invitationId?: unknown
}

interface ClaimedInvitationEmail {
  invitation_id: string
  email: string
  token: string
  expires_at: string
  created_by: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function sanitizeHeader(value: string): string {
  return value.replaceAll(/[\r\n]/g, " ").trim().slice(0, 120)
}

async function sendEmailViaSendGrid(
  to: string,
  subject: string,
  htmlContent: string,
): Promise<{ success: boolean; error?: string }> {
  const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY")
  if (!sendGridApiKey) {
    return { success: false, error: "SENDGRID_NOT_CONFIGURED" }
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sendGridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], subject }],
        from: {
          email: Deno.env.get("SENDGRID_FROM_EMAIL") || "noreply@booking-system.com",
          name: Deno.env.get("SENDGRID_FROM_NAME") || "預約管理系統",
        },
        content: [{ type: "text/html", value: htmlContent }],
        reply_to: {
          email: Deno.env.get("SENDGRID_REPLY_EMAIL") || "support@booking-system.com",
        },
      }),
    })

    if (!response.ok) {
      console.error("SendGrid rejected invitation email:", response.status)
      return { success: false, error: `SENDGRID_${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error("SendGrid request failed:", errorMessage(error))
    return { success: false, error: "SENDGRID_REQUEST_FAILED" }
  }
}

function generateInvitationEmailHtml(
  storeName: string,
  invitationLink: string,
  invitedByName: string,
  expiresAt: string,
): string {
  const expirationDate = new Date(expiresAt).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

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
                <tr>
                  <td style="padding-bottom:28px;text-align:center;">
                    <span style="font-size:13px;font-weight:600;letter-spacing:0.08em;color:#6366f1;text-transform:uppercase;">預約管理系統</span>
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
                    <div style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6);"></div>
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
                          <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">
                          <div style="padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;">
                            <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
                              此邀請連結將於 <strong style="color:#18181b;">${expirationDate}</strong> 到期。
                              若連結失效，請聯絡管理員 ${invitedByName} 重新發送。
                            </p>
                          </div>
                          <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">
                            無法點擊按鈕？複製以下連結到瀏覽器：<br>
                            <a href="${invitationLink}" style="color:#6366f1;text-decoration:none;">${invitationLink}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405)
  }

  let adminClient: SupabaseClient | null = null
  let claimedInvitationId: string | null = null

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
    }

    let payload: InvitationPayload
    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400)
    }

    if (typeof payload.invitationId !== "string" || !uuidRegex.test(payload.invitationId)) {
      return jsonResponse({ error: "Valid invitation ID is required", code: "INVALID_INVITATION_ID" }, 400)
    }

    const userToken = authHeader.slice(7)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const appUrl = Deno.env.get("APP_URL") || "https://bookr-5ph.pages.dev"

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Invitation email configuration is incomplete")
      return jsonResponse({ error: "Server configuration missing", code: "SERVER_CONFIG_ERROR" }, 500)
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: authData, error: authError } = await authClient.auth.getUser(userToken)

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401)
    }

    adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: currentUser, error: userError } = await adminClient
      .from("users")
      .select("id, store_id, role, full_name")
      .eq("id", authData.user.id)
      .is("deleted_at", null)
      .single()

    if (userError || !currentUser || currentUser.role !== "admin") {
      return jsonResponse({ error: "Admin access required", code: "ADMIN_REQUIRED" }, 403)
    }

    const { data: invitationState, error: stateError } = await adminClient
      .from("pending_invitations")
      .select("id, expires_at, email_sent_at")
      .eq("id", payload.invitationId)
      .eq("store_id", currentUser.store_id)
      .is("accepted_at", null)
      .maybeSingle()

    if (stateError) {
      console.error("Invitation state lookup failed:", stateError)
      return jsonResponse({ error: "Unable to load invitation", code: "INVITATION_LOOKUP_FAILED" }, 500)
    }

    if (!invitationState) {
      return jsonResponse({ error: "Invitation not found", code: "INVITATION_NOT_FOUND" }, 404)
    }

    if (new Date(invitationState.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "Invitation expired", code: "INVITATION_EXPIRED" }, 410)
    }

    if (invitationState.email_sent_at) {
      const lastSentAt = new Date(invitationState.email_sent_at).getTime()
      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < 60_000) {
        return jsonResponse(
          { error: "Please wait before sending this invitation again", code: "INVITATION_RATE_LIMITED" },
          429,
        )
      }
    }

    const { data: claimedData, error: claimError } = await adminClient
      .rpc("claim_invitation_email_send", {
        p_invitation_id: payload.invitationId,
        p_store_id: currentUser.store_id,
      })
      .single()

    if (claimError || !claimedData) {
      console.error("Invitation email claim failed:", claimError)
      return jsonResponse(
        { error: "Invitation email is already being sent", code: "INVITATION_SEND_IN_PROGRESS" },
        409,
      )
    }

    const invitation = claimedData as ClaimedInvitationEmail
    claimedInvitationId = invitation.invitation_id

    const { data: store, error: storeError } = await adminClient
      .from("stores")
      .select("name")
      .eq("id", currentUser.store_id)
      .single()

    if (storeError || !store) {
      throw new Error("STORE_NOT_FOUND")
    }

    const trustedBaseUrl = new URL(appUrl)
    if (!['https:', 'http:'].includes(trustedBaseUrl.protocol)) {
      throw new Error("INVALID_APP_URL")
    }

    const invitationUrl = new URL("/auth/accept-invitation", trustedBaseUrl)
    invitationUrl.searchParams.set("token", invitation.token)

    const storeName = escapeHtml(store.name)
    const invitedByName = escapeHtml(currentUser.full_name || "管理員")
    const invitationLink = escapeHtml(invitationUrl.toString())
    const htmlContent = generateInvitationEmailHtml(
      storeName,
      invitationLink,
      invitedByName,
      invitation.expires_at,
    )

    const result = await sendEmailViaSendGrid(
      invitation.email,
      `[${sanitizeHeader(store.name)}] 邀請你加入預約管理系統`,
      htmlContent,
    )

    const { data: stateSaved, error: finishError } = await adminClient.rpc(
      "finish_invitation_email_send",
      {
        p_invitation_id: claimedInvitationId,
        p_success: result.success,
        p_error: result.error || null,
      },
    )

    claimedInvitationId = null

    if (finishError || !stateSaved) {
      console.error("Invitation email state update failed:", finishError)
      return jsonResponse({ error: "Failed to save email status", code: "EMAIL_STATE_SAVE_FAILED" }, 500)
    }

    if (!result.success) {
      return jsonResponse({ error: "Failed to send email", code: "EMAIL_DELIVERY_FAILED" }, 502)
    }

    return jsonResponse({
      ok: true,
      message: "Invitation email sent successfully",
      invitationId: invitation.invitation_id,
    })
  } catch (error) {
    console.error("Unexpected send-invitation-email error:", errorMessage(error))

    if (adminClient && claimedInvitationId) {
      const { error: releaseError } = await adminClient.rpc("finish_invitation_email_send", {
        p_invitation_id: claimedInvitationId,
        p_success: false,
        p_error: "INTERNAL_ERROR",
      })
      if (releaseError) {
        console.error("Failed to release invitation email claim:", releaseError)
      }
    }

    return jsonResponse({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500)
  }
})
