// Supabase Edge Function: 課程管理 CRUD
// 部署位置：supabase/functions/services-crud
// 調用：POST/PUT/DELETE /functions/v1/services-crud?action=create|update|delete
// 2026-06-08

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

interface CreateServiceRequest {
  name: string
  description?: string
  duration_minutes: number
  price: number
  active?: boolean
}

interface UpdateServiceRequest {
  name?: string
  description?: string
  duration_minutes?: number
  price?: number
  active?: boolean
}

// 驗證請求資料
function validateCreateRequest(data: any): CreateServiceRequest {
  // 驗證課程名稱
  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    throw new Error("Course name is required and must be non-empty")
  }

  if (data.name.trim().length > 100) {
    throw new Error("Course name must be less than 100 characters")
  }

  // 驗證時長
  if (!Number.isInteger(data.duration_minutes) || data.duration_minutes < 15 || data.duration_minutes > 480) {
    throw new Error("Duration must be an integer between 15 and 480 minutes")
  }

  // 驗證定價
  if (typeof data.price !== "number" || data.price < 0 || data.price > 999999) {
    throw new Error("Price must be a number between 0 and 999,999")
  }

  return {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    duration_minutes: data.duration_minutes,
    price: Math.floor(data.price),
    active: data.active !== false,
  }
}

// 主處理函數
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

    // 驗證用戶身份和權限（檢查 members 表中的 is_admin）
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("store_id, is_admin")
      .eq("user_id", userData.user.id)
      .single()

    if (memberError || !memberData) {
      return new Response(
        JSON.stringify({ error: "User not found in members table" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!memberData.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 新增課程
    // ============================================================
    if (req.method === "POST" && action === "create") {
      const body = await req.json()
      const validatedData = validateCreateRequest(body)

      // 檢查課程名稱是否已存在
      const { data: existing } = await supabase
        .from("services")
        .select("id")
        .eq("store_id", memberData.store_id)
        .eq("name", validatedData.name)
        .is("deleted_at", null)

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ error: "A service with this name already exists" }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }

      // 建立課程
      const { data: service, error: createError } = await supabase
        .from("services")
        .insert({
          store_id: memberData.store_id,
          name: validatedData.name,
          description: validatedData.description,
          duration_minutes: validatedData.duration_minutes,
          price: validatedData.price,
          active: validatedData.active,
        })
        .select()
        .single()

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          data: service,
          message: "Service created successfully",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 編輯課程
    // ============================================================
    if (req.method === "PUT" && action === "update") {
      const body = await req.json()
      const { service_id, ...updateData } = body

      if (!service_id) {
        return new Response(
          JSON.stringify({ error: "Service ID is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      // 驗證課程屬於該店家
      const { data: service, error: fetchError } = await supabase
        .from("services")
        .select("id, store_id, duration_minutes")
        .eq("id", service_id)
        .single()

      if (fetchError || !service) {
        return new Response(
          JSON.stringify({ error: "Service not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (service.store_id !== memberData.store_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Access denied" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      // 準備更新資料
      const updatePayload: any = {}

      if (updateData.name !== undefined) {
        if (!updateData.name || updateData.name.trim() === "") {
          return new Response(
            JSON.stringify({ error: "Service name cannot be empty" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
        updatePayload.name = updateData.name.trim()
      }

      if (updateData.description !== undefined) {
        updatePayload.description = updateData.description?.trim() || null
      }

      if (updateData.duration_minutes !== undefined) {
        if (!Number.isInteger(updateData.duration_minutes) || updateData.duration_minutes < 15 || updateData.duration_minutes > 480) {
          return new Response(
            JSON.stringify({ error: "Duration must be between 15 and 480 minutes" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }

        // 警告：若修改時長且有進行中的預約，記錄警告但繼續
        if (updateData.duration_minutes !== service.duration_minutes) {
          const { data: bookings } = await supabase
            .from("bookings")
            .select("id")
            .eq("service_id", service_id)
            .in("status", ["pending", "confirmed"])
            .limit(1)

          if (bookings && bookings.length > 0) {
            console.warn(`Warning: Modifying duration of service with active bookings (service_id: ${service_id})`)
          }
        }
        updatePayload.duration_minutes = updateData.duration_minutes
      }

      if (updateData.price !== undefined) {
        if (typeof updateData.price !== "number" || updateData.price < 0 || updateData.price > 999999) {
          return new Response(
            JSON.stringify({ error: "Price must be between 0 and 999,999" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
        updatePayload.price = Math.floor(updateData.price)
      }

      if (updateData.active !== undefined) {
        updatePayload.active = Boolean(updateData.active)
      }

      // 執行更新
      const { data: updated, error: updateError } = await supabase
        .from("services")
        .update(updatePayload)
        .eq("id", service_id)
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
          data: updated,
          message: "Service updated successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 刪除課程（軟刪除）
    // ============================================================
    if (req.method === "DELETE" && action === "delete") {
      const body = await req.json()
      const { service_id } = body

      if (!service_id) {
        return new Response(
          JSON.stringify({ error: "Service ID is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      // 驗證課程屬於該店家
      const { data: service, error: fetchError } = await supabase
        .from("services")
        .select("id, store_id, name")
        .eq("id", service_id)
        .single()

      if (fetchError || !service) {
        return new Response(
          JSON.stringify({ error: "Service not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (service.store_id !== memberData.store_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Access denied" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      // 檢查該課程相關的預約和從業人員指派
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("service_id", service_id)

      const { data: practitioners } = await supabase
        .from("practitioner_services")
        .select("practitioner_id")
        .eq("service_id", service_id)

      // 執行軟刪除
      const { error: deleteError } = await supabase
        .from("services")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", service_id)

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          message: "Service deleted successfully",
          service_id,
          affected_bookings: bookings?.length || 0,
          affected_practitioners: practitioners?.length || 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
