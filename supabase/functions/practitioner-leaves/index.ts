// Supabase Edge Function: 老師休假管理
// 部署位置：supabase/functions/practitioner-leaves
// 2026-06-05

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

interface CreateLeaveRequest {
  practitioner_id: string
  start_date: string
  end_date: string
  reason?: string
}

// 驗證日期格式（YYYY-MM-DD）
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date.getTime())
}

// 驗證請求
function validateLeaveRequest(data: any): CreateLeaveRequest {
  if (!data.practitioner_id) {
    throw new Error("Practitioner ID is required")
  }

  if (!isValidDate(data.start_date)) {
    throw new Error("Start date must be in YYYY-MM-DD format")
  }

  if (!isValidDate(data.end_date)) {
    throw new Error("End date must be in YYYY-MM-DD format")
  }

  const startDate = new Date(data.start_date)
  const endDate = new Date(data.end_date)

  if (endDate < startDate) {
    throw new Error("End date must be greater than or equal to start date")
  }

  return {
    practitioner_id: data.practitioner_id,
    start_date: data.start_date,
    end_date: data.end_date,
    reason: data.reason?.trim(),
  }
}

serve(async (req: Request) => {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const url = new URL(req.url)
    const action = url.searchParams.get("action")

    // 取得授權 token
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    )
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // 新增休假
    // ============================================================
    if (req.method === "POST" && action === "create") {
      const body = await req.json()
      const validatedData = validateLeaveRequest(body)

      // 檢查管理員權限
      const { data: memberData } = await supabase
        .from("members")
        .select("store_id, is_admin")
        .eq("user_id", userData.user.id)
        .single()

      if (!memberData?.is_admin) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 驗證老師屬於同一店家
      const { data: practitioner } = await supabase
        .from("practitioners")
        .select("store_id")
        .eq("id", validatedData.practitioner_id)
        .single()

      if (!practitioner || practitioner.store_id !== memberData.store_id) {
        return new Response(JSON.stringify({ error: "Practitioner not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 檢查休假是否重疊（警告但允許）
      const { data: overlappingLeaves } = await supabase
        .from("practitioner_leaves")
        .select("id")
        .eq("practitioner_id", validatedData.practitioner_id)
        .lte("start_date", validatedData.end_date)
        .gte("end_date", validatedData.start_date)

      // 建立休假記錄
      const { data: leave, error: leaveError } = await supabase
        .from("practitioner_leaves")
        .insert({
          practitioner_id: validatedData.practitioner_id,
          start_date: validatedData.start_date,
          end_date: validatedData.end_date,
          reason: validatedData.reason,
        })
        .select()
        .single()

      if (leaveError) {
        return new Response(JSON.stringify({ error: leaveError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          data: leave,
          message: "Leave created successfully",
          warning:
            overlappingLeaves && overlappingLeaves.length > 0
              ? "Warning: This leave overlaps with existing leave"
              : undefined,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 編輯休假
    // ============================================================
    if (req.method === "PUT" && action === "update") {
      const body = await req.json()
      const { leave_id, ...updateData } = body

      if (!leave_id) {
        return new Response(JSON.stringify({ error: "Leave ID is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 檢查管理員權限
      const { data: memberData } = await supabase
        .from("members")
        .select("store_id, is_admin")
        .eq("user_id", userData.user.id)
        .single()

      if (!memberData?.is_admin) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 驗證新的日期格式（如果提供）
      if (updateData.start_date && !isValidDate(updateData.start_date)) {
        return new Response(
          JSON.stringify({ error: "Start date must be in YYYY-MM-DD format" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (updateData.end_date && !isValidDate(updateData.end_date)) {
        return new Response(
          JSON.stringify({ error: "End date must be in YYYY-MM-DD format" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      // 編輯休假
      const { data: leave, error: updateError } = await supabase
        .from("practitioner_leaves")
        .update(updateData)
        .eq("id", leave_id)
        .select()
        .single()

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          data: leave,
          message: "Leave updated successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 刪除休假
    // ============================================================
    if (req.method === "DELETE" && action === "delete") {
      const { leave_id } = await req.json()

      if (!leave_id) {
        return new Response(JSON.stringify({ error: "Leave ID is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 檢查管理員權限
      const { data: memberData } = await supabase
        .from("members")
        .select("is_admin")
        .eq("user_id", userData.user.id)
        .single()

      if (!memberData?.is_admin) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 刪除休假
      const { error: deleteError } = await supabase
        .from("practitioner_leaves")
        .delete()
        .eq("id", leave_id)

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(null, { status: 204 })
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
