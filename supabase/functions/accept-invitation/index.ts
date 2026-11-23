import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.3"
import { decideExistingInvitationMember, type ExistingInvitationMember } from "../_shared/member-invitation.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" }
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface AcceptInvitationPayload {
  token?: unknown
  password?: unknown
  name?: unknown
  // 舊版前端仍可能傳 email；伺服器一律忽略並以邀請內容為準。
  email?: unknown
}

interface ClaimedMemberInvitation {
  invitation_id: string
  email: string
  store_id: string
  role: "member" | "admin"
  created_by: string
}

interface InvitationTokenState {
  message: string
}

interface AcceptedMember {
  id: string
  email: string
  full_name: string
  role: "member" | "admin"
  store_id?: string
}

interface ReactivatedMemberRow {
  user_id: string
  email: string
  full_name: string
  role: "member" | "admin"
  store_id: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function invitationErrorStatus(message?: string) {
  if (message === "Invitation already accepted") return 409
  if (message === "Invitation expired") return 410
  if (message === "Invitation is being processed") return 409
  return 400
}

function containsControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    }, 405)
  }

  let adminClient: SupabaseClient | null = null
  let claimedInvitationId: string | null = null
  let createdAuthUserId: string | null = null

  try {
    const contentLength = Number(req.headers.get("content-length") || "0")
    if (contentLength > 32_768) {
      return jsonResponse({
        error: "Request body is too large",
        code: "PAYLOAD_TOO_LARGE",
      }, 413)
    }

    let payload: AcceptInvitationPayload
    try {
      payload = await req.json()
    } catch {
      return jsonResponse(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        400,
      )
    }

    if (
      typeof payload.token !== "string" ||
      typeof payload.password !== "string" ||
      typeof payload.name !== "string"
    ) {
      return jsonResponse({
        error: "Token, password and name are required",
        code: "INVALID_INPUT",
      }, 400)
    }

    if (!uuidRegex.test(payload.token)) {
      return jsonResponse({
        error: "Invalid invitation token",
        code: "INVALID_INVITATION",
      }, 400)
    }

    const name = payload.name.trim()
    if (!name || name.length > 100 || containsControlCharacter(name)) {
      return jsonResponse({ error: "Invalid name", code: "INVALID_NAME" }, 400)
    }

    if (payload.password.length < 8 || payload.password.length > 128) {
      return jsonResponse({
        error: "Password must be 8 to 128 characters",
        code: "INVALID_PASSWORD",
      }, 400)
    }

    const hasUppercase = /[A-Z]/.test(payload.password)
    const hasLowercase = /[a-z]/.test(payload.password)
    const hasNumber = /\d/.test(payload.password)
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return jsonResponse({
        error: "Password must contain uppercase, lowercase, and numbers",
        code: "INVALID_PASSWORD",
      }, 400)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Accept invitation configuration is incomplete")
      return jsonResponse({
        error: "Server configuration missing",
        code: "SERVER_CONFIG_ERROR",
      }, 500)
    }

    adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // 單一 UPDATE ... RETURNING 原子領取邀請；同一 Token 同時只能有一個請求成功。
    const { data: claimedData, error: claimError } = await adminClient
      .rpc("claim_member_invitation", { p_token: payload.token })
      .single()

    if (claimError || !claimedData) {
      const { data: tokenState } = await adminClient
        .rpc("validate_invitation_token", { p_token: payload.token })
        .maybeSingle()
      const message = (tokenState as InvitationTokenState | null)?.message ||
        "Invalid invitation token"
      return jsonResponse(
        { error: message, code: "INVITATION_UNAVAILABLE" },
        invitationErrorStatus(message),
      )
    }

    const invitation = claimedData as ClaimedMemberInvitation
    claimedInvitationId = invitation.invitation_id

    const { data: existingMembers, error: existingMemberError } = await adminClient
      .from("users")
      .select("id, email, store_id, deleted_at")
      .eq("email", invitation.email)
      .limit(2)

    if (existingMemberError) {
      throw new Error("EXISTING_MEMBER_LOOKUP_FAILED")
    }

    const existingMemberDecision = decideExistingInvitationMember(
      (existingMembers || []) as ExistingInvitationMember[],
      invitation.store_id,
    )

    if (existingMemberDecision.kind === "ambiguous") {
      await adminClient.rpc("release_member_invitation_claim", {
        p_invitation_id: claimedInvitationId,
      })
      claimedInvitationId = null
      return jsonResponse({
        error: "Multiple member profiles use this email",
        code: "MEMBER_PROFILE_AMBIGUOUS",
      }, 409)
    }

    if (existingMemberDecision.kind === "store_conflict") {
      await adminClient.rpc("release_member_invitation_claim", {
        p_invitation_id: claimedInvitationId,
      })
      claimedInvitationId = null
      return jsonResponse({
        error: "This account belongs to another store",
        code: "ACCOUNT_STORE_CONFLICT",
      }, 409)
    }

    if (existingMemberDecision.kind === "already_active") {
      await adminClient.rpc("release_member_invitation_claim", {
        p_invitation_id: claimedInvitationId,
      })
      claimedInvitationId = null
      return jsonResponse({
        error: "This member account is already active",
        code: "ACCOUNT_ALREADY_ACTIVE",
      }, 409)
    }

    let userData: AcceptedMember | null = null
    let auditAction = "USER_REGISTERED"

    if (existingMemberDecision.kind === "reactivate") {
      const member = existingMemberDecision.member
      const { error: authUpdateError } = await adminClient.auth.admin
        .updateUserById(member.id, {
          password: payload.password,
          email_confirm: true,
          user_metadata: { full_name: name },
        })

      if (authUpdateError) {
        console.error("Existing auth user update failed:", authUpdateError)
        await adminClient.rpc("release_member_invitation_claim", {
          p_invitation_id: claimedInvitationId,
        })
        claimedInvitationId = null
        return jsonResponse({
          error: "Failed to update existing user account",
          code: "AUTH_USER_UPDATE_FAILED",
        }, 500)
      }

      const { data: reactivatedUser, error: reactivateError } = await adminClient
        .rpc("reactivate_member_invitation", {
          p_invitation_id: claimedInvitationId,
          p_user_id: member.id,
          p_full_name: name,
        })
        .single()

      if (reactivateError || !reactivatedUser) {
        console.error("Member reactivation failed:", reactivateError)
        await adminClient.rpc("release_member_invitation_claim", {
          p_invitation_id: claimedInvitationId,
        })
        claimedInvitationId = null
        return jsonResponse({
          error: "Failed to reactivate member profile",
          code: "MEMBER_REACTIVATION_FAILED",
        }, 500)
      }

      const reactivatedMember = reactivatedUser as ReactivatedMemberRow
      userData = {
        id: reactivatedMember.user_id,
        email: reactivatedMember.email,
        full_name: reactivatedMember.full_name,
        role: reactivatedMember.role,
        store_id: reactivatedMember.store_id,
      }
      claimedInvitationId = null
      auditAction = "USER_REACTIVATED"
    }

    if (existingMemberDecision.kind === "create") {
      const { data: authData, error: authError } = await adminClient.auth.admin
        .createUser({
          email: invitation.email,
          password: payload.password,
          email_confirm: true,
        })

      if (authError || !authData.user) {
        console.error("Auth user creation failed:", authError)
        await adminClient.rpc("release_member_invitation_claim", {
          p_invitation_id: claimedInvitationId,
        })
        claimedInvitationId = null

        const duplicateEmail = authError?.code === "email_exists" ||
          authError?.message?.toLowerCase().includes("already")
        return jsonResponse(
          {
            error: duplicateEmail ? "An account with this email already exists" : "Failed to create user account",
            code: duplicateEmail ? "ACCOUNT_ALREADY_EXISTS" : "AUTH_USER_CREATE_FAILED",
          },
          duplicateEmail ? 409 : 500,
        )
      }

      createdAuthUserId = authData.user.id

      const { data: createdUser, error: userUpdateError } = await adminClient
        .from("users")
        .update({
          email: invitation.email,
          full_name: name,
          store_id: invitation.store_id,
          role: invitation.role,
          invited_by: invitation.created_by,
          invited_at: new Date().toISOString(),
        })
        .eq("id", createdAuthUserId)
        .select("id, email, full_name, role")
        .single()

      if (userUpdateError || !createdUser) {
        console.error("User profile update failed:", userUpdateError)
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(
          createdAuthUserId,
        )
        if (deleteError) {
          console.error("Auth user compensation failed:", deleteError)
        }
        await adminClient.rpc("release_member_invitation_claim", {
          p_invitation_id: claimedInvitationId,
        })
        createdAuthUserId = null
        claimedInvitationId = null
        return jsonResponse({
          error: "Failed to create user profile",
          code: "USER_PROFILE_CREATE_FAILED",
        }, 500)
      }

      userData = createdUser

      const { data: completed, error: completeError } = await adminClient.rpc(
        "complete_member_invitation",
        {
          p_invitation_id: claimedInvitationId,
          p_user_id: createdAuthUserId,
        },
      )

      if (completeError || !completed) {
        console.error("Invitation completion failed:", completeError)
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(
          createdAuthUserId,
        )
        if (deleteError) {
          console.error("Auth user compensation failed:", deleteError)
        }
        await adminClient.rpc("release_member_invitation_claim", {
          p_invitation_id: claimedInvitationId,
        })
        createdAuthUserId = null
        claimedInvitationId = null
        return jsonResponse({
          error: "Failed to complete invitation",
          code: "INVITATION_COMPLETE_FAILED",
        }, 500)
      }

      // 關鍵狀態已完成，後續審計失敗不回滾使用者帳號。
      createdAuthUserId = null
      claimedInvitationId = null
    }

    if (!userData) {
      throw new Error("ACCEPTED_USER_MISSING")
    }

    const { error: auditError } = await adminClient
      .from("audit_logs")
      .insert({
        user_id: userData.id,
        action: auditAction,
        table_name: "users",
        record_id: userData.id,
        new_values: {
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role,
        },
        store_id: invitation.store_id,
      })

    if (auditError) {
      console.warn("User registration audit failed:", auditError)
    }

    return jsonResponse({
      ok: true,
      message: "Invitation accepted and user account created successfully",
      user: userData,
    })
  } catch (error) {
    console.error("Unexpected accept-invitation error:", errorMessage(error))

    if (adminClient && createdAuthUserId) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(
        createdAuthUserId,
      )
      if (deleteError) console.error("Auth user cleanup failed:", deleteError)
    }

    if (adminClient && claimedInvitationId) {
      const { error: releaseError } = await adminClient.rpc(
        "release_member_invitation_claim",
        {
          p_invitation_id: claimedInvitationId,
        },
      )
      if (releaseError) {
        console.error("Invitation claim release failed:", releaseError)
      }
    }

    return jsonResponse({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    }, 500)
  }
})
