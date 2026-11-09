import {
  createLineRichMenuHandler,
  LineRichMenuPublishError,
} from "./line-rich-menu-handler.ts"
import type {
  LineRichMenuHandlerDependencies,
  LineRichMenuPayload,
  LineRichMenuPublicationJob,
} from "./line-rich-menu-handler.ts"

const publicationId = "d3000000-0000-4000-8000-000000000001"
const storeId = "d0000000-0000-4000-8000-000000000001"

function job(): LineRichMenuPublicationJob {
  return {
    publicationId,
    storeId,
    setId: "d4000000-0000-4000-8000-000000000001",
    versionNumber: 1,
    channelAccessToken: "line-access-token",
    storeCode: "cassia",
    liffId: "1234567890-bookr",
    imageBucket: "line-rich-menu-images",
    config: {
      chatBarText: "開啟選單",
      pages: [
        {
          pageKey: "home",
          name: "首頁",
          layoutKey: "layout_2",
          imagePath: `${storeId}/home.png`,
          areas: [
            {
              areaKey: "booking",
              x: 0,
              y: 0,
              width: 1250,
              height: 1686,
              action: { type: "booking", value: "" },
            },
            {
              areaKey: "next",
              x: 1250,
              y: 0,
              width: 1250,
              height: 1686,
              action: { type: "page_switch", value: "account" },
            },
          ],
        },
        {
          pageKey: "account",
          name: "我的服務",
          layoutKey: "layout_1",
          imagePath: `${storeId}/account.jpg`,
          areas: [
            {
              areaKey: "center",
              x: 0,
              y: 0,
              width: 2500,
              height: 1686,
              action: { type: "customer_center", value: "" },
            },
          ],
        },
      ],
    },
  }
}

function request(body: Record<string, unknown>, overrides: RequestInit = {}) {
  return new Request("http://localhost/line-rich-menu", {
    method: "POST",
    headers: {
      authorization: "Bearer valid-token",
      "content-type": "application/json",
      origin: "http://localhost:5173",
      ...(overrides.headers || {}),
    },
    body: JSON.stringify(body),
    ...overrides,
  })
}

function dependencies() {
  const createdPayloads: LineRichMenuPayload[] = []
  const aliases: Array<{ aliasId: string; richMenuId: string }> = []
  const removed: string[] = []
  const completed: Array<Record<string, Record<string, string>>> = []
  const failed: Array<{ code: string; message: string }> = []
  let createCount = 0

  const value: LineRichMenuHandlerDependencies = {
    authenticate: async () => ({ id: "admin", storeId, role: "admin" }),
    authorizePublication: async (candidate, candidateStoreId) => (
      candidate === publicationId && candidateStoreId === storeId
    ),
    claimPublication: async candidate => candidate === publicationId ? job() : null,
    downloadImage: async (_bucket, path) => ({
      bytes: new Uint8Array(path.endsWith(".png") ? [1, 2, 3] : [4, 5, 6]),
      contentType: path.endsWith(".png") ? "image/png" : "image/jpeg",
    }),
    completePublication: async (_candidate, resourceMap) => {
      completed.push(resourceMap)
      return true
    },
    failPublication: async (_candidate, code, message) => {
      failed.push({ code, message })
    },
    lineApi: {
      create: async (_token, payload) => {
        createdPayloads.push(payload)
        createCount += 1
        return `rich-menu-${createCount}`
      },
      uploadImage: async () => undefined,
      upsertAlias: async (_token, aliasId, richMenuId) => {
        aliases.push({ aliasId, richMenuId })
      },
      setDefault: async () => undefined,
      remove: async (_token, richMenuId) => {
        removed.push(richMenuId)
      },
    },
    bookingOrigin: "https://bookr.example",
    allowedOrigins: new Set(["http://localhost:5173"]),
  }

  return { value, createdPayloads, aliases, removed, completed, failed }
}

Deno.test("發布兩頁圖文選單並解析預約、客戶中心與切頁動作", async () => {
  const test = dependencies()
  const response = await createLineRichMenuHandler(test.value)(
    request({ publicationId }),
  )
  const body = await response.json()

  if (response.status !== 200 || body.status !== "published") {
    throw new Error(`expected published response, got ${response.status}`)
  }
  if (test.createdPayloads.length !== 2 || test.aliases.length !== 2) {
    throw new Error("expected two menus and two aliases")
  }
  const bookingAction = test.createdPayloads[0].areas[0].action
  if (bookingAction.uri !== "https://bookr.example/book/cassia") {
    throw new Error("booking URI was not resolved")
  }
  const switchAction = test.createdPayloads[0].areas[1].action
  if (switchAction.type !== "richmenuswitch" || !switchAction.richMenuAliasId) {
    throw new Error("page switch action was not resolved")
  }
  const centerAction = test.createdPayloads[1].areas[0].action
  if (centerAction.uri !== "https://bookr.example/book/cassia/me") {
    throw new Error("customer center URI was not resolved")
  }
  if (test.completed.length !== 1 || test.failed.length !== 0) {
    throw new Error("publication completion state is incorrect")
  }
})

Deno.test("非管理員無法發布", async () => {
  const test = dependencies()
  test.value.authenticate = async () => ({ id: "member", storeId, role: "member" })
  const response = await createLineRichMenuHandler(test.value)(request({ publicationId }))
  if (response.status !== 403 || test.createdPayloads.length !== 0) {
    throw new Error("member should not publish rich menus")
  }
})

Deno.test("跨店發布版本以 404 隱藏", async () => {
  const test = dependencies()
  test.value.authorizePublication = async () => false
  const response = await createLineRichMenuHandler(test.value)(request({ publicationId }))
  if (response.status !== 404 || test.createdPayloads.length !== 0) {
    throw new Error("cross-store publication should be hidden")
  }
})

Deno.test("無效 publication id 在驗證前被拒絕", async () => {
  const test = dependencies()
  let authenticated = false
  test.value.authenticate = async () => {
    authenticated = true
    return null
  }
  const response = await createLineRichMenuHandler(test.value)(
    request({ publicationId: "not-a-uuid" }),
  )
  if (response.status !== 400 || authenticated) {
    throw new Error("invalid input should be rejected before authentication")
  }
})

Deno.test("圖片上傳失敗會標記失敗並清理已建立選單", async () => {
  const test = dependencies()
  test.value.lineApi.uploadImage = async () => {
    throw new LineRichMenuPublishError("LINE_API_503", "LINE unavailable", true)
  }
  const response = await createLineRichMenuHandler(test.value)(request({ publicationId }))
  const body = await response.json()

  if (response.status !== 503 || body.code !== "LINE_API_503") {
    throw new Error("retryable LINE error should return 503")
  }
  if (test.failed[0]?.code !== "LINE_API_503" || test.removed[0] !== "rich-menu-1") {
    throw new Error("failed publication should be recorded and cleaned up")
  }
})

Deno.test("過大的圖片不會送往 LINE", async () => {
  const test = dependencies()
  let uploaded = false
  test.value.downloadImage = async () => ({
    bytes: new Uint8Array(1_048_577),
    contentType: "image/png",
  })
  test.value.lineApi.uploadImage = async () => {
    uploaded = true
  }
  const response = await createLineRichMenuHandler(test.value)(request({ publicationId }))
  const body = await response.json()

  if (response.status !== 422 || body.code !== "IMAGE_INVALID" || uploaded) {
    throw new Error("oversized image should be rejected before upload")
  }
})

Deno.test("未知來源網域被拒絕", async () => {
  const test = dependencies()
  const response = await createLineRichMenuHandler(test.value)(
    request(
      { publicationId },
      { headers: { origin: "https://evil.example", authorization: "Bearer valid-token" } },
    ),
  )
  if (response.status !== 403) throw new Error("unknown origin should be rejected")
})
