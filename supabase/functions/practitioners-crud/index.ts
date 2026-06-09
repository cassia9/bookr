// Supabase Edge Function: 從業人員管理 CRUD
// 部署位置：supabase/functions/practitioners-crud
// 調用：POST/PUT /api/functions/v1/practitioners-crud
// 2026-06-05

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

interface CreatePractitionerRequest {
  name: string
  color_hex: string
  bio?: string
  photo_url?: string
  service_ids: string[]
}

interface UpdatePractitionerRequest {
  name?: string
  color_hex?: string
  bio?: string
  photo_url?: string
}

interface UpdateServicesRequest {
  service_ids: string[]
}

// 驗證 HEX 色值格式
function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex)
}

// 驗證請求
function validateCreateRequest(data: any): CreatePractitionerRequest {
  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    throw new Error("Name is required and must be non-empty")
  }

  if (!data.color_hex || !isValidHexColor(data.color_hex)) {
    throw new Error("Color must be a valid HEX value (#RRGGBB)")
  }

  if (!Array.isArray(data.service_ids) || data.service_ids.length === 0) {
    throw new Error("At least one service must be assigned")
  }

  return {
    name: data.name.trim(),
    color_hex: data.color_hex,
    bio: data.bio?.trim(),
    photo_url: data.photo_url,
    service_ids: data.service_ids,
  }
}

// CORS 頭
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

// 主處理函數
serve(async (req: Request) => {
  try {
    // 處理 CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const url = new URL(req.url)
    const action = url.searchParams.get("action")

    // 取得授權 token
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    )
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }

    // ============================================================
    // 新增老師
    // ============================================================
    if (req.method === "POST" && action === "create") {
      const body = await req.json()
      const validatedData = validateCreateRequest(body)

      // 檢查當前用戶是否為管理員
      const { data: adminUserData, error: adminCheckError } = await supabase
        .from("users")
        .select("store_id, role")
        .eq("id", userData.user.id)
        .single()

      if (adminCheckError || !adminUserData || adminUserData.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      const memberData = adminUserData

      // 建立老師
      const { data: practitioner, error: practError } = await supabase
        .from("practitioners")
        .insert({
          store_id: memberData.store_id,
          name: validatedData.name,
          color_hex: validatedData.color_hex,
          bio: validatedData.bio,
          photo_url: validatedData.photo_url,
          is_active: true,
        })
        .select()
        .single()

      if (practError) {
        return new Response(JSON.stringify({ error: practError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      // 指派課程
      const serviceAssignments = validatedData.service_ids.map((serviceId) => ({
        practitioner_id: practitioner.id,
        service_id: serviceId,
      }))

      const { error: servicesError } = await supabase
        .from("practitioner_services")
        .insert(serviceAssignments)

      if (servicesError) {
        // 回滾：刪除已建立的老師
        await supabase.from("practitioners").delete().eq("id", practitioner.id)
        return new Response(
          JSON.stringify({ error: servicesError.message }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          data: practitioner,
          message: "Practitioner created successfully",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 更新課程指派
    // ============================================================
    if (req.method === "PUT" && action === "update_services") {
      const body = await req.json()
      const { practitioner_id, service_ids } = body

      if (!practitioner_id || !Array.isArray(service_ids)) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (service_ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "At least one service must be assigned" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      // 檢查管理員權限
      const { data: adminUserData, error: userError } = await supabase
        .from("users")
        .select("store_id, role")
        .eq("id", userData.user.id)
        .single()

      if (userError || !adminUserData || adminUserData.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      const memberData = adminUserData

      // 驗證老師屬於同一店家
      const { data: practitioner } = await supabase
        .from("practitioners")
        .select("store_id")
        .eq("id", practitioner_id)
        .single()

      if (!practitioner || practitioner.store_id !== memberData.store_id) {
        return new Response(JSON.stringify({ error: "Practitioner not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      // 刪除舊的課程指派
      await supabase
        .from("practitioner_services")
        .delete()
        .eq("practitioner_id", practitioner_id)

      // 新增新的課程指派
      const newAssignments = service_ids.map((serviceId) => ({
        practitioner_id,
        service_id: serviceId,
      }))

      const { error: insertError } = await supabase
        .from("practitioner_services")
        .insert(newAssignments)

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      return new Response(
        JSON.stringify({
          message: "Services updated successfully",
          practitioner_id,
          service_ids,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    // ============================================================
    // 刪除老師（軟刪除）
    // ============================================================
    if (req.method === "DELETE" && action === "delete") {
      const { practitioner_id } = await req.json()

      // 檢查管理員權限
      const { data: adminUserData, error: userError } = await supabase
        .from("users")
        .select("store_id, role")
        .eq("id", userData.user.id)
        .single()

      if (userError || !adminUserData || adminUserData.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        })
      }

      const memberData = adminUserData

      // 檢查是否有未完成的預約
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("practitioner_id", practitioner_id)
        .in("status", ["pending", "confirmed"])

      if (bookings && bookings.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Cannot delete practitioner with pending bookings",
            pending_bookings: bookings.length,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }

      // 軟刪除
      const { error: deleteError } = await supabase
        .from("practitioners")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", practitioner_id)

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
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
