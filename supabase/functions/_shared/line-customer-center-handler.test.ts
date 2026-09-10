import {
  createLineCustomerCenterHandler,
  type LineCustomerCenterDependencies,
} from "./line-customer-center-handler.ts";
import { LineIdentityError } from "./line.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const storeId = "00000000-0000-4000-8000-000000000001";
const identity = {
  providerAccountId: "2000000001",
  providerUserId: "U11111111111111111111111111111111",
  displayName: "客戶中心測試者",
  pictureUrl: null,
};

function dependencies(
  overrides: Partial<LineCustomerCenterDependencies> = {},
): LineCustomerCenterDependencies {
  return {
    allowedOrigins: new Set(["http://127.0.0.1:5173"]),
    getLineChannelId: async () => "2000000001",
    verifyIdentity: async () => identity,
    loadCustomerCenter: async () => ({
      ok: true,
      store: { id: storeId, name: "測試店家" },
      client: { id: "10000000-0000-4000-8000-000000000001", name: "測試客戶" },
      bookings: [],
      vouchers: [],
    }),
    ...overrides,
  };
}

function request(
  body: string | Record<string, unknown> = {
    storeId,
    idToken: "valid-id-token",
  },
  options: { method?: string; origin?: string } = {},
) {
  return new Request("http://localhost/line-customer-center", {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": options.origin ?? "http://127.0.0.1:5173",
    },
    body: options.method === "GET"
      ? undefined
      : typeof body === "string"
      ? body
      : JSON.stringify(body),
  });
}

Deno.test("客戶中心以已驗證 LINE 身分查詢本人資料", async () => {
  let capturedUserId = "";
  const handler = createLineCustomerCenterHandler(dependencies({
    loadCustomerCenter: async (requestedStoreId, verified) => {
      assert(requestedStoreId === storeId, "應傳遞已驗證店家");
      capturedUserId = verified.providerUserId;
      return { ok: true, bookings: [], vouchers: [] };
    },
  }));
  const response = await handler(request());
  const body = await response.json();

  assert(response.status === 200, "有效身分應成功");
  assert(body.ok === true, "回應應為成功");
  assert(
    capturedUserId === identity.providerUserId,
    "資料查詢只能使用驗證後 user ID",
  );
});

Deno.test("客戶中心拒絕非白名單 Origin", async () => {
  let verifyCalled = false;
  const handler = createLineCustomerCenterHandler(dependencies({
    verifyIdentity: async () => {
      verifyCalled = true;
      return identity;
    },
  }));
  const response = await handler(
    request({}, { origin: "https://attacker.example" }),
  );

  assert(response.status === 403, "非白名單 Origin 應拒絕");
  assert(!verifyCalled, "拒絕前不應接觸 LINE token");
});

Deno.test("客戶中心拒絕錯誤 method 與無效輸入", async () => {
  const handler = createLineCustomerCenterHandler(dependencies());
  const methodResponse = await handler(request({}, { method: "GET" }));
  const inputResponse = await handler(request({ storeId: "bad", idToken: "" }));

  assert(methodResponse.status === 405, "只允許 POST");
  assert(inputResponse.status === 400, "無效輸入應拒絕");
});

Deno.test("客戶中心在店家未設定 LINE Login 時停止", async () => {
  let verifyCalled = false;
  const handler = createLineCustomerCenterHandler(dependencies({
    getLineChannelId: async () => null,
    verifyIdentity: async () => {
      verifyCalled = true;
      return identity;
    },
  }));
  const response = await handler(request());

  assert(response.status === 404, "未設定 LINE 應回 404");
  assert(!verifyCalled, "沒有 Channel ID 不得驗證 token");
});

Deno.test("客戶中心拒絕 LINE 平台判定無效的 token", async () => {
  const handler = createLineCustomerCenterHandler(dependencies({
    verifyIdentity: async () => {
      throw new LineIdentityError("LINE_TOKEN_REJECTED", "invalid");
    },
  }));
  const response = await handler(request());
  const body = await response.json();

  assert(response.status === 401, "無效 token 應回 401");
  assert(body.code === "LINE_TOKEN_REJECTED", "不得洩露 LINE 驗證細節");
});

Deno.test("客戶中心將 LINE 暫時失敗轉為可重試狀態", async () => {
  const handler = createLineCustomerCenterHandler(dependencies({
    verifyIdentity: async () => {
      throw new LineIdentityError("LINE_VERIFY_UNAVAILABLE", "temporary");
    },
  }));
  const response = await handler(request());

  assert(response.status === 503, "LINE 暫時失敗應回 503");
});

Deno.test("客戶中心找不到綁定客戶時不回傳其他資料", async () => {
  const handler = createLineCustomerCenterHandler(dependencies({
    loadCustomerCenter: async () => ({
      ok: false,
      error: "IDENTITY_NOT_FOUND",
    }),
  }));
  const response = await handler(request());
  const body = await response.json();

  assert(response.status === 404, "未綁定客戶應回 404");
  assert(body.code === "IDENTITY_NOT_FOUND", "回應應可供前端顯示綁定提示");
});

Deno.test("客戶中心正確處理 CORS 預檢", async () => {
  const handler = createLineCustomerCenterHandler(dependencies());
  const response = await handler(
    new Request("http://localhost/line-customer-center", {
      method: "OPTIONS",
      headers: { "Origin": "http://127.0.0.1:5173" },
    }),
  );

  assert(response.status === 200, "預檢應成功");
  assert(
    response.headers.get("Access-Control-Allow-Origin") ===
      "http://127.0.0.1:5173",
    "預檢應回傳原始白名單 Origin",
  );
});
