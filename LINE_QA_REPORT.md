# LINE 串接本機 QA 報告

**日期**：2026-08-21  
**分支**：`codex/line-messaging-notifications`（疊加於 `codex/line-integration`）
**範圍**：LINE 身分驗證、官方 LINE 串接生命週期、Messaging API 通知、Webhook、outbox／Worker、客戶 LINE 資訊、手機版預約

## 結論

本次 LINE 串接修改已通過本機資料庫、安全、Edge Function、前端建置與瀏覽器情境測試。一般網頁預約不會信任或建立 LINE 身分；只有經後端向 LINE 驗證的 ID token 才能進入 LINE 專用預約流程。店家可安全解除並重綁官方 LINE；解除不會停用一般網頁預約，也不會刪除歷史預約或客戶資料。

目前尚未部署正式環境。Messaging API 已完成每店 Vault 憑證、交易通知 outbox、重試 Worker、follow／unfollow Webhook、五種通知開關／範本、管理員測試推播與 LIFF 好友提示。真正的 LINE App 端到端發送仍需要正式 LIFF、LINE Login Channel 與 Messaging API Channel，應於部署後使用測試 LINE 帳號完成一次驗證，再開放 Rich Menu 入口。

## 自動化檢查

| 項目 | 結果 | 證據 |
|---|---|---|
| 從零重建本機資料庫 | 通過 | 所有 migration 成功套用至 `20260821110500_line_messaging_notifications.sql` |
| pgTAP 資料庫安全測試 | 通過 | 4 個檔案、120 項測試，全部成功 |
| LINE Edge 共用模組單元測試 | 通過 | 40 項 Deno 測試含型別檢查、0 失敗 |
| TypeScript | 通過 | `tsc --noEmit` 結束碼 0 |
| 本次前端 ESLint | 通過 | 設定、客戶渠道、LIFF 與預約頁修改檔案 0 錯誤 |
| 正式前端建置 | 通過 | Vite 完成 2,828 個模組轉換與產物輸出 |
| Edge Function 型別檢查 | 通過 | `line-messaging-settings`、`line-webhook`、`line-notification-worker` 全部通過 |
| Function CORS／輸入防護 | 通過 | 合法來源預檢 200；未知來源 403；空白 payload 400 |
| 資料庫 lint | 通過（有預期警告） | 只警告公開 RPC 為相容舊簽名而保留、但刻意忽略 3 個不可信 LINE 參數 |

## 瀏覽器情境測試

### 後台官方 LINE 串接管理

- 管理員可看到目前 Provider、Provider ID、官方帳號、LINE Login Channel、LIFF ID 與版本紀錄。
- Provider、Channel、LIFF 與官方帳號資料可透過受控 RPC 儲存，前端不再直接修改 LINE 有效設定欄位。
- 更新公開顯示資料後，畫面與 V1 版本紀錄同步顯示新名稱。
- 點擊解除會先顯示二次確認，並明確說明一般預約與歷史資料會保留。
- 解除後狀態變成「未串接」，LINE 測試與 Rich Menu 網址停用，一般網頁預約網址仍可使用。
- Channel Secret 與 Access Token 不會出現在頁面或資料表欄位。

### 解除與重綁生命週期

| 情境 | 畫面結果 | 資料庫驗證 |
|---|---|---|
| 更新現有串接 | 成功提示並保留 V1 | 寫入 `line_connection_updated` 審計事件 |
| 解除 V1 | 顯示未串接、LINE 入口停用 | `stores` 的 LIFF／Channel 快取清空；一般預約仍開啟；客戶身分仍有效 |
| 同 Provider 重綁 | 建立 V2，提示身分延續 | 舊客戶 `provider_account_id` 由 `2000000001` 遷移至 `2000000002`，未封存 |
| 再次解除 V2 | V1、V2 都保留在版本紀錄 | 第二筆 `line_connection_disconnected` 審計事件 |
| 不同 Provider 重綁 | 建立 V3，提示舊身分封存 | 舊 LINE 身分 `deleted_at` 已設定；歷史預約仍存在；一般預約仍開啟 |

最終本機審計結果：`line_connection_updated = 1`、`line_connection_disconnected = 2`、`line_connection_reconnected = 2`。後台與一般預約頁的瀏覽器 console 均為 0 個 error。

### 後台客戶資料

- 客戶列表可顯示 LINE 標籤與 LINE 顯示名稱。
- 客戶詳情可顯示驗證狀態、最近驗證時間與遮罩後的 Provider User ID。
- 電話與渠道身分分開保存；修改電話不會解除 LINE 連結。
- 客戶詳情會區分「可接收推播」、「未加好友或已封鎖」及「狀態待確認」。

### Messaging API 通知

- Channel Access Token 與 Channel Secret 只會送到 Edge Function，驗證後分別進入 Supabase Vault；公開狀態 RPC 不回傳秘密。
- 人工預約申請、確認、取消、時間／服務／老師異動及 24 小時提醒都只建立 outbox 工作，不在預約交易中呼叫 LINE。
- Worker 使用 `FOR UPDATE SKIP LOCKED` 領取工作、工作 UUID 作為 LINE retry key，並將 429／5xx 排入退避重試；不可重試 4xx 與非好友會安全略過。
- Webhook 在解析 JSON 前先以原始 body 驗證 HMAC-SHA256，並以 event ID 去重 follow／unfollow。
- 管理員測試推播只能選同店、已驗證且可送達的 LINE 身分；瀏覽器情境已確認建立本機 `pending` outbox 與 `SEND_TEST` 審計紀錄，沒有執行外部 LINE 發送。
- 設定頁桌機 1280px 與手機 390px 均無水平溢位，通知開關沿用既有 Toggle 元件。
- LIFF 預約頁會讀取好友狀態；非好友可開啟 LINE 官方加好友／解除封鎖提示，但不會阻擋預約。

### 手機版一般網頁預約

- 390 × 844 視窗無水平溢位。
- 可完成服務、老師、日期、時段與聯絡資料五步流程。
- LINE 未連結時會明確說明仍可使用一般網頁完成預約。
- 本機虛構預約成功，狀態為 `pending`。
- 資料庫驗證結果：`source = web`、`client_line_id IS NULL`、沒有新增 `customer_channel_identities`。
- 瀏覽器 console 無 error 或 warning。

## 已知但非本次新增的項目

- 全專案 ESLint 仍有 297 項既有錯誤／警告，主要位於舊預約元件、從業人員元件、舊 Edge Functions，以及建置產物掃描；本次修改檔案的定向 ESLint 已全部通過。
- Vite 提示主 JavaScript chunk 超過 500 kB，屬既有前端效能改善項目，不影響本次功能正確性。

## 上版前／上版後關卡

1. 合併前從 LINE Developers Console 核對正式 Provider ID、LIFF ID 與 LINE Login Channel ID；三者必須屬於同一個 Provider。
2. 先部署 migration，再部署 `line-booking`、`line-messaging-settings`、`line-webhook`、`line-notification-worker`，最後部署前端。
3. migration 會把既有 LIFF／Channel 設定建立為 V1 且標示「資料待補」；部署後由管理員在後台補齊 Provider 與官方帳號公開資料，不填入 Channel Secret 或 Access Token。
4. 使用 LINE App 開啟 LIFF 網址，完成一筆測試預約。
5. 確認正式資料庫只新增該測試客戶的已驗證 LINE 身分與預約，並確認其他店家不可讀取。
6. 完成正式環境唯讀回歸後，再開放 Rich Menu 給一般客戶。
7. 依 `LINE_SETUP.md` 建立 Worker secret、Vault secret 與每分鐘 Cron；先使用測試 LINE 身分完成一筆測試推播，再保留排程。
