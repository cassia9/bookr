// Supabase Edge Function: 課程管理 CRUD
// 部署位置：supabase/functions/services-crud
// 調用：POST/PUT/DELETE /functions/v1/services-crud?action=create|update|delete
// 2026-06-08

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

interface CreateServiceRequest {
  name: string
  description?: string
  duration_minutes: number
  price: number
  active?: boolean
  category_id?: string | null
}

interface UpdateServiceRequest {
  name?: string
  description?: string
  duration_minutes?: number
  price?: number
  active?: boolean
  category_id?: string | null
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  if (
    data.category_id !== undefined
    && data.category_id !== null
    && (typeof data.category_id !== "string" || !uuidPattern.test(data.category_id))
  ) {
    throw new Error("Category ID must be a valid UUID or null")
  }

  return {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    duration_minutes: data.duration_minutes,
    price: Math.floor(data.price),
    active: data.active !== false,
    category_id: data.category_id || null,
  }
}

// 主處理函數
serve(async (req: Request) => {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const url = new URL(req.url)
    const action = url.searchParams.get("action")

    // 取得授權 token
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401)
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    )
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401)
    }

    // 驗證用戶身份和權限（使用現行 users 表的角色模型）
    const { data: memberData, error: memberError } = await supabase
      .from("users")
      .select("store_id, role")
      .eq("id", userData.user.id)
      .single()

    if (memberError || !memberData) {
      return jsonResponse({ error: "User profile not found" }, 403)
    }

    if (memberData.role !== "admin") {
      return jsonResponse({ error: "Forbidden: Admin access required" }, 403)
    }

    const memberStoreId = memberData.store_id

    async function categoryBelongsToStore(categoryId: string) {
      const { data: category, error } = await supabase
        .from("service_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("store_id", memberStoreId)
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle()

      return !error && Boolean(category)
    }

    // ============================================================
    // 新增課程
    // ============================================================
    if (req.method === "POST" && action === "create") {
      const body = await req.json()
      const validatedData = validateCreateRequest(body)

      if (
        validatedData.category_id
        && !(await categoryBelongsToStore(validatedData.category_id))
      ) {
        return jsonResponse({ error: "Service category not found" }, 400)
      }

      // 檢查課程名稱是否已存在
      const { data: existing } = await supabase
        .from("services")
        .select("id")
        .eq("store_id", memberData.store_id)
        .eq("name", validatedData.name)
        .is("deleted_at", null)

      if (existing && existing.length > 0) {
        return jsonResponse({ error: "A service with this name already exists" }, 409)
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
          category_id: validatedData.category_id,
        })
        .select()
        .single()

      if (createError) {
        return jsonResponse({ error: createError.message }, 400)
      }

      return jsonResponse({
        data: service,
        message: "Service created successfully",
      }, 201)
    }

    // ============================================================
    // 編輯課程
    // ============================================================
    if (req.method === "PUT" && action === "update") {
      const body = await req.json()
      const { service_id, ...updateData } = body

      if (!service_id) {
        return jsonResponse({ error: "Service ID is required" }, 400)
      }

      // 驗證課程屬於該店家
      const { data: service, error: fetchError } = await supabase
        .from("services")
        .select("id, store_id, duration_minutes")
        .eq("id", service_id)
        .single()

      if (fetchError || !service) {
        return jsonResponse({ error: "Service not found" }, 404)
      }

      if (service.store_id !== memberData.store_id) {
        return jsonResponse({ error: "Forbidden: Access denied" }, 403)
      }

      // 準備更新資料
      const updatePayload: any = {}

      if (updateData.name !== undefined) {
        if (!updateData.name || updateData.name.trim() === "") {
          return jsonResponse({ error: "Service name cannot be empty" }, 400)
        }
        updatePayload.name = updateData.name.trim()
      }

      if (updateData.description !== undefined) {
        updatePayload.description = updateData.description?.trim() || null
      }

      if (updateData.duration_minutes !== undefined) {
        if (!Number.isInteger(updateData.duration_minutes) || updateData.duration_minutes < 15 || updateData.duration_minutes > 480) {
          return jsonResponse({ error: "Duration must be between 15 and 480 minutes" }, 400)
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
          return jsonResponse({ error: "Price must be between 0 and 999,999" }, 400)
        }
        updatePayload.price = Math.floor(updateData.price)
      }

      if (updateData.active !== undefined) {
        updatePayload.active = Boolean(updateData.active)
      }

      if (updateData.category_id !== undefined) {
        if (updateData.category_id === null || updateData.category_id === "") {
          updatePayload.category_id = null
        } else if (
          typeof updateData.category_id !== "string"
          || !uuidPattern.test(updateData.category_id)
          || !(await categoryBelongsToStore(updateData.category_id))
        ) {
          return jsonResponse({ error: "Service category not found" }, 400)
        } else {
          updatePayload.category_id = updateData.category_id
        }
      }

      // 執行更新
      const { data: updated, error: updateError } = await supabase
        .from("services")
        .update(updatePayload)
        .eq("id", service_id)
        .select()
        .single()

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400)
      }

      return jsonResponse({
        data: updated,
        message: "Service updated successfully",
      }, 200)
    }

    // ============================================================
    // 刪除課程（軟刪除）
    // ============================================================
    if (req.method === "DELETE" && action === "delete") {
      const body = await req.json()
      const { service_id } = body

      if (!service_id) {
        return jsonResponse({ error: "Service ID is required" }, 400)
      }

      // 驗證課程屬於該店家
      const { data: service, error: fetchError } = await supabase
        .from("services")
        .select("id, store_id, name")
        .eq("id", service_id)
        .single()

      if (fetchError || !service) {
        return jsonResponse({ error: "Service not found" }, 404)
      }

      if (service.store_id !== memberData.store_id) {
        return jsonResponse({ error: "Forbidden: Access denied" }, 403)
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
        return jsonResponse({ error: deleteError.message }, 400)
      }

      return jsonResponse({
        message: "Service deleted successfully",
        service_id,
        affected_bookings: bookings?.length || 0,
        affected_practitioners: practitioners?.length || 0,
      }, 200)
    }

    return jsonResponse({ error: "Unknown action" }, 400)
  } catch (error) {
    console.error("Error:", error)
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500)
  }
})
