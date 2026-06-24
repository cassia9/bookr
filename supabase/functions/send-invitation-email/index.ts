import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface InvitationPayload {
  email: string
  storeName: string
  invitationLink: string
  invitedByName: string
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
          name: `${storeName} 預約系統`,
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
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            background: white;
            padding: 30px 20px;
            border-radius: 0 0 8px 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .greeting {
            font-size: 16px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .button:hover {
            opacity: 0.9;
          }
          .footer {
            color: #666;
            font-size: 12px;
            text-align: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
          .info-box {
            background-color: #f0f7ff;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ 歡迎加入</h1>
            <p>${storeName}</p>
          </div>

          <div class="content">
            <div class="greeting">
              <p>親愛的團隊成員，</p>
            </div>

            <p><strong>${storeName}</strong> 的管理員 ${invitedByName} 邀請你加入預約管理系統。</p>

            <p>通過這個平台，你可以：</p>
            <ul>
              <li>✅ 管理客戶預約</li>
              <li>✅ 查看個人工作行程</li>
              <li>✅ 標記課程完成</li>
              <li>✅ 協作管理客戶資訊</li>
            </ul>

            <p style="text-align: center;">
              <a href="${invitationLink}" class="button">完成註冊</a>
            </p>

            <div class="info-box">
              <strong>⏰ 重要提醒：</strong><br>
              此邀請連結將在 <strong>${expirationDate}</strong> 過期。<br>
              請在此日期前完成註冊。
            </div>

            <p>
              <strong>連結無效或過期？</strong><br>
              請聯絡你的店家管理員 ${invitedByName} 重新發送邀請。
            </p>

            <p>
              有任何問題，歡迎回覆此郵件或聯絡支援團隊。
            </p>

            <p>祝營運順利！</p>
            <p><strong>預約系統團隊</strong></p>

            <div class="footer">
              <p>此邀請由 <strong>${storeName}</strong> 透過預約管理系統發送。</p>
              <p>這是一封自動郵件，請勿直接回覆。</p>
              <p>&copy; 2026 預約管理系統。保留所有權利。</p>
            </div>
          </div>
        </div>
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

    // 驗證授權
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const payload: InvitationPayload = await req.json()

    // 驗證必要字段
    if (!payload.email || !payload.storeName || !payload.invitationLink || !payload.invitedByName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
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

    // 生成 HTML 內容
    const htmlContent = generateInvitationEmailHtml(
      payload.storeName,
      payload.invitationLink,
      payload.invitedByName
    )

    // 發送郵件
    const result = await sendEmailViaSendGrid(
      payload.email,
      `[${payload.storeName}] 邀請你加入預約管理系統`,
      htmlContent
    )

    if (!result.success) {
      console.error("Email send failed:", result.error)
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Invitation email sent successfully",
        email: payload.email,
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
