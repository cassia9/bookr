# LINE 串接本機 QA 報告

**日期**：2026-08-21  
**分支**：`codex/line-integration`  
**範圍**：LINE 身分驗證、公開預約隔離、後台渠道設定、客戶 LINE 資訊、手機版預約

## 結論

本次 LINE 串接修改已通過本機資料庫、安全、Edge Function、前端建置與瀏覽器情境測試。一般網頁預約不會信任或建立 LINE 身分；只有經後端向 LINE 驗證的 ID token 才能進入 LINE 專用預約流程。

目前尚未部署正式環境。真正的 LINE App 內端到端驗證需要正式 LIFF ID 與 LINE Login Channel ID，應於部署後使用測試 LINE 帳號完成一次驗證，再開放 Rich Menu 入口。

## 自動化檢查

| 項目 | 結果 | 證據 |
|---|---|---|
| 從零重建本機資料庫 | 通過 | 所有 migration 成功套用至 `20260821080336_line_channel_identity.sql` |
| pgTAP 資料庫安全測試 | 通過 | 2 個檔案、49 項測試，全部成功 |
| LINE token 驗證單元測試 | 通過 | 6 項測試、0 失敗 |
| TypeScript | 通過 | `tsc --noEmit` 結束碼 0 |
| 本次修改檔案 ESLint | 通過 | 9 個前端與 Edge Function 檔案，0 錯誤 |
| 正式前端建置 | 通過 | Vite 完成 2,827 個模組轉換與產物輸出 |
| Edge Runtime | 通過 | Supabase Edge Runtime 成功載入 `line-booking` |
| Function CORS／輸入防護 | 通過 | 合法來源預檢 200；未知來源 403；空白 payload 400 |
| 資料庫 lint | 通過（有預期警告） | 只警告公開 RPC 為相容舊簽名而保留、但刻意忽略 3 個不可信 LINE 參數 |

## 瀏覽器情境測試

### 後台渠道設定

- 管理員可看到 LIFF ID 與 LINE Login Channel ID。
- 顯示 LINE Developers Endpoint URL 與 Rich Menu／LIFF 預約網址。
- 儲存後顯示「渠道設定已儲存」。
- Channel Secret 與 Access Token 不會出現在頁面或資料表欄位。

### 後台客戶資料

- 客戶列表可顯示 LINE 標籤與 LINE 顯示名稱。
- 客戶詳情可顯示驗證狀態、最近驗證時間與遮罩後的 Provider User ID。
- 電話與渠道身分分開保存；修改電話不會解除 LINE 連結。

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

1. 合併前再次確認正式 LIFF ID 與 LINE Login Channel ID 屬於同一個 LINE Provider。
2. 先部署 migration，再部署 `line-booking` Edge Function，最後部署前端。
3. 在後台渠道設定填入 LIFF ID 與 Channel ID，不填入 Channel Secret 或 Access Token。
4. 使用 LINE App 開啟 LIFF 網址，完成一筆測試預約。
5. 確認正式資料庫只新增該測試客戶的已驗證 LINE 身分與預約，並確認其他店家不可讀取。
6. 完成正式環境唯讀回歸後，再開放 Rich Menu 給一般客戶。
