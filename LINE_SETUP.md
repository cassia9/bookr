# LINE 串接設定與施工指南

本文件說明 LINE 預約第一階段的設定邊界、開發位置、秘密管理與部署順序。任何 ID token、Channel Secret、Channel Access Token 都不得寫入本文件、Git、前端程式或應用程式日誌。

## 開發位置

```text
分支：codex/line-integration
Worktree：/Users/CL/Documents/booking-system-ai-workspace/line-integration
基準：origin/main
```

受保護的正式工作目錄 `/Users/CL/Documents/預約系統` 不直接修改。

## LINE Developers Console 前置條件

1. 確認店家的 LINE Official Account 已啟用 Messaging API。
2. 在與 Messaging API Channel **相同的 Provider** 下建立或確認 LINE Login Channel。
3. 建立 LIFF App，Scopes 至少包含 `openid`、`profile`。
4. Endpoint URL 設為正式預約頁，例如：

   ```text
   https://bookr-5ph.pages.dev/book/{storeCode}
   ```

5. 店家給客人的 LINE 預約入口使用：

   ```text
   https://liff.line.me/{LIFF_ID}
   ```

6. Rich Menu 應連到 LIFF URL，不直接連 Endpoint URL。

## 身分驗證邊界

```text
LIFF 前端
  └─ 取得 liff.getIDToken()
      └─ 傳送至 line-booking Edge Function
          └─ LINE POST /oauth2/v2.1/verify
              └─ 驗證 aud 與設定的 Channel ID
                  └─ 取得可信任 sub、name、picture
                      └─ 呼叫服務端限定的資料庫 RPC
```

禁止做法：

- 不把 `liff.getProfile()` 的 user ID、姓名、頭像當成後端可信資料。
- 不讓一般公開 RPC 接收或寫入可信 LINE 身分。
- 不在錯誤訊息或日誌輸出 ID token。
- 不在 URL query string 傳送 ID token。

## Secrets

### 本地環境

本地秘密檔案放在 worktree 內、但必須由 `.gitignore` 排除：

```text
supabase/functions/.env.local
```

第一階段不需要 LINE Secret。本機店家資料會設定 LIFF ID 與公開的 LINE Login Channel ID，Edge Function 依店家設定向 LINE 驗證 ID token。

### 正式環境

第一階段的 LIFF ID 與 LINE Login Channel ID 是公開識別值，由店家後台設定，不放入 Secrets。若第二階段加入訊息通知，再使用 Supabase Edge Function Secrets 新增：

```text
LINE_MESSAGING_CHANNEL_SECRET
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
```

若系統開放多間店家各自串接 Messaging API，必須改成每店加密憑證模型，不得共用一組全域 Channel Secret 或 Access Token。

如需限制 Edge Function 的瀏覽器來源，可設定：

```text
LINE_BOOKING_ALLOWED_ORIGINS=https://bookr-5ph.pages.dev
```

## 預計程式位置

```text
src/lib/line/liff.ts
src/pages/booking/BookingPage.tsx
src/components/settings/LineChannelCard.tsx
src/pages/admin/SettingsPage.tsx
src/components/clients/CustomerChannelIdentities.tsx
src/pages/admin/ClientsPage.tsx

supabase/migrations/<timestamp>_line_channel_identity.sql
supabase/functions/_shared/line.ts
supabase/functions/line-booking/index.ts
supabase/tests/line_channel_identity.sql
```

第二階段才加入：

```text
supabase/functions/line-webhook/index.ts
supabase/functions/line-notify/index.ts
```

## Migration 原則

- 使用 `supabase migration new line_channel_identity` 建立檔名。
- 第一階段以新增表、索引、函式與權限調整為主，不刪除既有 LINE 欄位。
- 新表明確啟用 RLS。
- `anon` 無權直接讀寫渠道身分。
- `authenticated` 只能讀取自己店家的資料。
- 服務端預約函式只授權給後端角色，並設定安全 `search_path`。
- 對 store、channel、Provider user ID 的查詢條件建立對應複合索引。

## 本地啟動與 QA 順序

1. 啟動 Docker Desktop。
2. 在隔離 worktree 執行 `npx supabase start`。
3. 執行本地 migration reset，確認所有 migration 可從零套用。
4. 執行 SQL 測試：
   - anon 無法讀取渠道身分。
   - A 店登入者無法讀取 B 店資料。
   - 同一 LINE 身分不能綁定兩位有效客戶。
   - 一般公開 RPC 無法偽造 LINE 身分。
5. 使用 mock LINE 驗證回應測試 Edge Function 成功、過期、Channel 不符及 LINE 無法連線。
6. 啟動 Vite，測試一般網址預約。
7. 測試手機尺寸、後台設定頁與客戶詳情。
8. 使用真實 LIFF 測試帳號完成一次 LINE 內建瀏覽器驗證。
9. 執行 build、修改範圍 lint、SQL 測試及安全檢查。
10. 產出 QA 報告，等待使用者確認後才建立部署批次。

## 部署順序

本地 QA 與 PR 審查通過後才執行：

1. 備份並確認正式資料庫狀態。
2. 套用 additive migration。
3. 設定 Supabase Secrets。
4. 部署 `line-booking` Edge Function。
5. 部署 Cloudflare Pages 前端。
6. 在正式環境執行不改動既有資料的 QA。
7. 最後才把 LINE Rich Menu 切換至 LIFF URL。

Rich Menu 切換是上線開關；若正式 QA 失敗，可先切回舊預約系統網址，不需要刪除既有資料。
