const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const aliasSafePattern = /[^a-z0-9_-]/g

export interface LineRichMenuAdmin {
  id: string
  storeId: string
  role: "admin" | "member"
}

export interface LineRichMenuAction {
  type: "booking" | "customer_center" | "uri" | "message" | "page_switch" | "none"
  value: string
}

export interface LineRichMenuArea {
  areaKey: string
  x: number
  y: number
  width: number
  height: number
  action: LineRichMenuAction
}

export interface LineRichMenuPage {
  pageKey: string
  name: string
  layoutKey: string
  imagePath: string
  areas: LineRichMenuArea[]
}

export interface LineRichMenuConfig {
  chatBarText?: string
  pages: LineRichMenuPage[]
}

export interface LineRichMenuPublicationJob {
  publicationId: string
  storeId: string
  setId: string
  versionNumber: number
  config: LineRichMenuConfig
  channelAccessToken: string
  storeCode: string
  liffId: string
  imageBucket: string
}

export interface LineRichMenuImage {
  bytes: Uint8Array
  contentType: "image/png" | "image/jpeg"
}

export interface LineRichMenuPayload {
  size: { width: 2500; height: 1686 }
  selected: boolean
  name: string
  chatBarText: string
  areas: Array<{
    bounds: { x: number; y: number; width: number; height: number }
    action: Record<string, string>
  }>
}

export interface LineRichMenuApi {
  create: (accessToken: string, payload: LineRichMenuPayload) => Promise<string>
  uploadImage: (
    accessToken: string,
    richMenuId: string,
    image: LineRichMenuImage,
  ) => Promise<void>
  upsertAlias: (
    accessToken: string,
    aliasId: string,
    richMenuId: string,
  ) => Promise<void>
  setDefault: (accessToken: string, richMenuId: string) => Promise<void>
  remove: (accessToken: string, richMenuId: string) => Promise<void>
}

export interface LineRichMenuHandlerDependencies {
  authenticate: (token: string) => Promise<LineRichMenuAdmin | null>
  authorizePublication: (
    publicationId: string,
    storeId: string,
  ) => Promise<boolean>
  claimPublication: (publicationId: string) => Promise<LineRichMenuPublicationJob | null>
  downloadImage: (bucket: string, path: string) => Promise<LineRichMenuImage>
  completePublication: (
    publicationId: string,
    resourceMap: Record<string, Record<string, string>>,
  ) => Promise<boolean>
  failPublication: (
    publicationId: string,
    errorCode: string,
    errorMessage: string,
  ) => Promise<void>
  lineApi: LineRichMenuApi
  bookingOrigin: string
  allowedOrigins: Set<string>
}

export class LineRichMenuPublishError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = "LineRichMenuPublishError"
    this.code = code
    this.retryable = retryable
  }
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : ""
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, allowedOrigins),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function richMenuAliasId(storeId: string, pageKey: string) {
  const storePart = storeId.replaceAll("-", "").slice(0, 8).toLowerCase()
  const pagePart = pageKey.toLowerCase().replace(aliasSafePattern, "-").slice(0, 16)
  return `bookr-${storePart}-${pagePart}`.slice(0, 32)
}

function validConfig(config: LineRichMenuConfig) {
  if (!config || !Array.isArray(config.pages) || config.pages.length < 1 || config.pages.length > 3) {
    return false
  }

  const pageKeys = new Set(config.pages.map(page => page.pageKey))
  if (pageKeys.size !== config.pages.length) return false

  return config.pages.every(page => (
    typeof page.pageKey === "string"
    && page.pageKey.length > 0
    && typeof page.name === "string"
    && page.name.length > 0
    && typeof page.imagePath === "string"
    && page.imagePath.length > 0
    && Array.isArray(page.areas)
    && page.areas.length >= 1
    && page.areas.length <= 6
    && page.areas.every(area => (
      Number.isInteger(area.x)
      && Number.isInteger(area.y)
      && Number.isInteger(area.width)
      && Number.isInteger(area.height)
      && area.x >= 0
      && area.y >= 0
      && area.width > 0
      && area.height > 0
      && area.x + area.width <= 2500
      && area.y + area.height <= 1686
      && ["booking", "customer_center", "uri", "message", "page_switch", "none"]
        .includes(area.action?.type)
      && (area.action.type !== "page_switch" || pageKeys.has(area.action.value))
    ))
  ))
}

function resolvedAction(
  action: LineRichMenuAction,
  aliasMap: Record<string, string>,
  bookingOrigin: string,
  storeCode: string,
): Record<string, string> {
  if (action.type === "booking") {
    return { type: "uri", uri: `${bookingOrigin}/book/${encodeURIComponent(storeCode)}` }
  }

  if (action.type === "customer_center") {
    return { type: "uri", uri: `${bookingOrigin}/book/${encodeURIComponent(storeCode)}/me` }
  }

  if (action.type === "uri") return { type: "uri", uri: action.value }
  if (action.type === "message") return { type: "message", text: action.value }
  if (action.type === "page_switch") {
    return {
      type: "richmenuswitch",
      richMenuAliasId: aliasMap[action.value],
      data: `bookr-page=${action.value}`,
    }
  }

  return { type: "postback", data: "bookr-action=none", displayText: "此功能尚未設定" }
}

function publishError(error: unknown) {
  if (error instanceof LineRichMenuPublishError) return error
  return new LineRichMenuPublishError(
    "UNEXPECTED_PUBLISH_ERROR",
    error instanceof Error ? error.message : "Unexpected LINE rich menu publish error",
  )
}

async function publishJob(
  job: LineRichMenuPublicationJob,
  dependencies: LineRichMenuHandlerDependencies,
) {
  if (!validConfig(job.config)) {
    throw new LineRichMenuPublishError("INVALID_CONFIG", "Rich menu config is invalid")
  }

  const chatBarText = normalizedString(job.config.chatBarText) || "開啟選單"
  if (chatBarText.length > 14) {
    throw new LineRichMenuPublishError("CHAT_BAR_TEXT_TOO_LONG", "Chat bar text is too long")
  }

  const aliasMap = Object.fromEntries(
    job.config.pages.map(page => [page.pageKey, richMenuAliasId(job.storeId, page.pageKey)]),
  )
  const createdMenuIds: string[] = []
  const resourceMap: Record<string, Record<string, string>> = {}

  try {
    for (const [index, page] of job.config.pages.entries()) {
      const payload: LineRichMenuPayload = {
        size: { width: 2500, height: 1686 },
        selected: index === 0,
        name: `Bookr ${page.name}`.slice(0, 300),
        chatBarText,
        areas: page.areas.map(area => ({
          bounds: {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
          },
          action: resolvedAction(
            area.action,
            aliasMap,
            dependencies.bookingOrigin,
            job.storeCode,
          ),
        })),
      }

      const richMenuId = await dependencies.lineApi.create(job.channelAccessToken, payload)
      createdMenuIds.push(richMenuId)

      const image = await dependencies.downloadImage(job.imageBucket, page.imagePath)
      if (
        image.bytes.byteLength < 1
        || image.bytes.byteLength > 1_048_576
        || !["image/png", "image/jpeg"].includes(image.contentType)
      ) {
        throw new LineRichMenuPublishError("IMAGE_INVALID", "Rich menu image is invalid")
      }

      await dependencies.lineApi.uploadImage(job.channelAccessToken, richMenuId, image)
      resourceMap[page.pageKey] = {
        richMenuId,
        aliasId: aliasMap[page.pageKey],
      }
    }

    for (const page of job.config.pages) {
      const resource = resourceMap[page.pageKey]
      await dependencies.lineApi.upsertAlias(
        job.channelAccessToken,
        resource.aliasId,
        resource.richMenuId,
      )
    }

    await dependencies.lineApi.setDefault(
      job.channelAccessToken,
      resourceMap[job.config.pages[0].pageKey].richMenuId,
    )

    const completed = await dependencies.completePublication(job.publicationId, resourceMap)
    if (!completed) {
      throw new LineRichMenuPublishError(
        "PUBLICATION_COMPLETE_FAILED",
        "Unable to complete rich menu publication",
      )
    }

    return resourceMap
  } catch (error) {
    await Promise.allSettled(
      createdMenuIds.map(richMenuId => (
        dependencies.lineApi.remove(job.channelAccessToken, richMenuId)
      )),
    )
    throw error
  }
}

export function createLineRichMenuHandler(dependencies: LineRichMenuHandlerDependencies) {
  return async (request: Request) => {
    const origin = request.headers.get("origin")
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      return jsonResponse(
        { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" },
        403,
        null,
        dependencies.allowedOrigins,
      )
    }

    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(origin, dependencies.allowedOrigins) })
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" },
        405,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ") || authHeader.length > 8_192) {
      return jsonResponse(
        { ok: false, code: "UNAUTHORIZED", error: "Unauthorized" },
        401,
        origin,
        dependencies.allowedOrigins,
      )
    }

    let payload: { publicationId?: unknown }
    try {
      payload = await request.json() as { publicationId?: unknown }
    } catch {
      return jsonResponse(
        { ok: false, code: "INVALID_JSON", error: "Invalid JSON body" },
        400,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const publicationId = normalizedString(payload.publicationId)
    if (!uuidPattern.test(publicationId)) {
      return jsonResponse(
        { ok: false, code: "INVALID_INPUT", error: "Invalid publication ID" },
        400,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const admin = await dependencies.authenticate(authHeader.slice(7))
    if (!admin) {
      return jsonResponse(
        { ok: false, code: "UNAUTHORIZED", error: "Invalid or expired session" },
        401,
        origin,
        dependencies.allowedOrigins,
      )
    }

    if (admin.role !== "admin") {
      return jsonResponse(
        { ok: false, code: "ADMIN_REQUIRED", error: "Admin permission required" },
        403,
        origin,
        dependencies.allowedOrigins,
      )
    }

    if (!await dependencies.authorizePublication(publicationId, admin.storeId)) {
      return jsonResponse(
        { ok: false, code: "PUBLICATION_NOT_FOUND", error: "Publication not found" },
        404,
        origin,
        dependencies.allowedOrigins,
      )
    }

    const job = await dependencies.claimPublication(publicationId)
    if (!job || job.storeId !== admin.storeId) {
      return jsonResponse(
        { ok: false, code: "PUBLICATION_NOT_READY", error: "Publication is not ready" },
        409,
        origin,
        dependencies.allowedOrigins,
      )
    }

    try {
      const resources = await publishJob(job, dependencies)
      return jsonResponse(
        { ok: true, status: "published", publicationId, resources },
        200,
        origin,
        dependencies.allowedOrigins,
      )
    } catch (error) {
      const normalized = publishError(error)
      await dependencies.failPublication(publicationId, normalized.code, normalized.message)
      return jsonResponse(
        {
          ok: false,
          code: normalized.code,
          error: "Unable to publish LINE rich menu",
        },
        normalized.retryable ? 503 : 422,
        origin,
        dependencies.allowedOrigins,
      )
    }
  }
}

interface LineApiErrorBody {
  message?: unknown
}

async function lineRequest(
  url: string,
  accessToken: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
) {
  let response: Response
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new LineRichMenuPublishError(
      "LINE_API_UNAVAILABLE",
      "LINE rich menu API is unavailable",
      true,
    )
  }

  if (!response.ok) {
    let message = `LINE API rejected request (${response.status})`
    try {
      const body = await response.json() as LineApiErrorBody
      if (typeof body.message === "string" && body.message) message = body.message
    } catch {
      // 保留安全的通用錯誤，不將可能含敏感資訊的回應原文向前端傳遞。
    }
    throw new LineRichMenuPublishError(
      `LINE_API_${response.status}`,
      message,
      response.status === 429 || response.status >= 500,
    )
  }

  return response
}

export function createLineRichMenuApi(fetchImpl: typeof fetch = fetch): LineRichMenuApi {
  return {
    create: async (accessToken, payload) => {
      const response = await lineRequest(
        "https://api.line.me/v2/bot/richmenu",
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        fetchImpl,
      )
      const body = await response.json() as { richMenuId?: unknown }
      if (typeof body.richMenuId !== "string" || !body.richMenuId) {
        throw new LineRichMenuPublishError("LINE_RESPONSE_INVALID", "LINE returned no richMenuId")
      }
      return body.richMenuId
    },
    uploadImage: async (accessToken, richMenuId, image) => {
      await lineRequest(
        `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": image.contentType },
          body: image.bytes,
        },
        fetchImpl,
      )
    },
    upsertAlias: async (accessToken, aliasId, richMenuId) => {
      try {
        await lineRequest(
          "https://api.line.me/v2/bot/richmenu/alias",
          accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }),
          },
          fetchImpl,
        )
      } catch (error) {
        if (!(error instanceof LineRichMenuPublishError) || error.code !== "LINE_API_409") {
          throw error
        }
        await lineRequest(
          `https://api.line.me/v2/bot/richmenu/alias/${encodeURIComponent(aliasId)}`,
          accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ richMenuId }),
          },
          fetchImpl,
        )
      }
    },
    setDefault: async (accessToken, richMenuId) => {
      await lineRequest(
        `https://api.line.me/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`,
        accessToken,
        { method: "POST" },
        fetchImpl,
      )
    },
    remove: async (accessToken, richMenuId) => {
      await lineRequest(
        `https://api.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`,
        accessToken,
        { method: "DELETE" },
        fetchImpl,
      )
    },
  }
}
