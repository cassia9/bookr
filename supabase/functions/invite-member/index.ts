import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" }
const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const roleValues = new Set(["member", "admin"])
const resendCooldownMs = 60_000

interface InvitePayload {
  email?: unknown
  role?: unknown
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405)
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || "0")
    if (contentLength > 16_384) {
      return jsonResponse({ error: "Request body is too large", code: "PAYLOAD_TOO_LARGE" }, 413)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
    }

    let payload: InvitePayload
    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400)
    }

    if (typeof payload.email !== "string" || typeof payload.role !== "string") {
      return jsonResponse({ error: "Email and role are required", code: "INVALID_INPUT" }, 400)
    }

    const email = payload.email.trim().toLowerCase()
    if (email.length > 320 || !emailRegex.test(email)) {
      return jsonResponse({ error: "Invalid email format", code: "INVALID_EMAIL" }, 400)
    }

    if (!roleValues.has(payload.role)) {
      return jsonResponse({ error: "Invalid role", code: "INVALID_ROLE" }, 400)
    }

    const role = payload.role as "member" | "admin"
    const userToken = authHeader.slice(7)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Invite member configuration is incomplete")
      return jsonResponse({ error: "Server configuration missing", code: "SERVER_CONFIG_ERROR" }, 500)
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: authData, error: authError } = await authClient.auth.getUser(userToken)

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401)
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: currentUser, error: userError } = await adminClient
      .from("users")
      .select("id, store_id, role")
      .eq("id", authData.user.id)
      .is("deleted_at", null)
      .single()

    if (userError || !currentUser) {
      return jsonResponse({ error: "User profile not found", code: "USER_NOT_FOUND" }, 401)
    }

    if (currentUser.role !== "admin") {
      return jsonResponse({ error: "Only admins can invite members", code: "ADMIN_REQUIRED" }, 403)
    }

    const { data: existingUser, error: existingUserError } = await adminClient
      .from("users")
      .select("id")
      .eq("store_id", currentUser.store_id)
      .ilike("email", email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()

    if (existingUserError) {
      console.error("Existing member lookup failed:", existingUserError)
      return jsonResponse({ error: "Unable to check existing members", code: "MEMBER_LOOKUP_FAILED" }, 500)
    }

    if (existingUser) {
      return jsonResponse({ error: "User with this email already exists", code: "MEMBER_ALREADY_EXISTS" }, 409)
    }

    const { data: existingInvitation, error: invitationLookupError } = await adminClient
      .from("pending_invitations")
      .select("id, email_sent_at")
      .eq("store_id", currentUser.store_id)
      .ilike("email", email)
      .is("accepted_at", null)
      .limit(1)
      .maybeSingle()

    if (invitationLookupError) {
      console.error("Pending invitation lookup failed:", invitationLookupError)
      return jsonResponse({ error: "Unable to check pending invitations", code: "INVITATION_LOOKUP_FAILED" }, 500)
    }

    if (existingInvitation?.email_sent_at) {
      const lastSentAt = new Date(existingInvitation.email_sent_at).getTime()
      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < resendCooldownMs) {
        return jsonResponse(
          { error: "Please wait before sending this invitation again", code: "INVITATION_RATE_LIMITED" },
          429,
        )
      }
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    const invitationValues = {
      email,
      role,
      token: crypto.randomUUID(),
      created_by: currentUser.id,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      processing_at: null,
      email_sending_at: null,
      email_sent_at: null,
      email_last_error: null,
    }

    const invitationQuery = existingInvitation
      ? adminClient
        .from("pending_invitations")
        .update(invitationValues)
        .eq("id", existingInvitation.id)
        .eq("store_id", currentUser.store_id)
      : adminClient
        .from("pending_invitations")
        .insert({ ...invitationValues, store_id: currentUser.store_id })

    const { data: invitation, error: saveError } = await invitationQuery
      .select("id, email, role, expires_at")
      .single()

    if (saveError || !invitation) {
      console.error("Invitation save failed:", saveError)
      const status = saveError?.code === "23505" ? 409 : 500
      const code = status === 409 ? "INVITATION_ALREADY_PENDING" : "INVITATION_SAVE_FAILED"
      return jsonResponse({ error: "Failed to save invitation", code }, status)
    }

    const mailResponse = await fetch(`${supabaseUrl}/functions/v1/send-invitation-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${userToken}`,
        "apikey": supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invitationId: invitation.id }),
    })

    if (!mailResponse.ok) {
      console.error("Invitation email request failed:", mailResponse.status)
      return jsonResponse({
        ok: true,
        warning: "Invitation created but email delivery may have failed",
        deliveryStatus: "failed",
        invitation,
      })
    }

    return jsonResponse({
      ok: true,
      message: "Invitation created and email sent successfully",
      deliveryStatus: "sent",
      invitation,
    })
  } catch (error) {
    console.error("Unexpected invite-member error:", errorMessage(error))
    return jsonResponse({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500)
  }
})
