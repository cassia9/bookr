---
artifact: prd
version: "1.0"
created: 2026-08-21
status: approved-for-local-development
---

# PRD：LINE Messaging API 預約通知

## Overview

### Problem Statement

目前系統已能透過 LIFF／LINE Login 驗證客戶身分，也能管理店家的官方 LINE 串接生命週期，但尚未真正串接 LINE Messaging API。既有 `notification_settings` 與 `notification_templates` 只有設定資料，沒有可靠的通知佇列、發送 Worker、失敗重試、Webhook 簽章驗證、好友狀態或發送稽核。

若直接在建立或更新預約的請求中同步呼叫 LINE API，LINE 暫時失敗會連帶影響預約，且無法安全重試。若將 Channel Access Token 放在前端或公開資料表，也會造成跨店濫發訊息與憑證外洩風險。

### Solution Summary

建立多店家隔離的 LINE 通知管線：預約交易只產生不可重複的通知工作，背景 Worker 再從 outbox 領取、組版並呼叫 LINE Messaging API。店家可在後台安全設定 Messaging API、通知開關與文字範本；系統接收並驗證 follow／unfollow Webhook，以好友狀態判斷訊息可送達性。

第一版通知包含：

1. 預約申請已收到（人工確認模式）。
2. 預約已確認。
3. 預約已取消。
4. 預約時間已異動。
5. 預約前 24 小時提醒。

### Target Users

- 從店家 LINE 官方帳號進入預約的客人。
- 管理 LINE 串接、通知開關與範本的店家管理員。
- 查看通知結果、處理預約的店家成員。

## Goals & Success Metrics

### Goals

1. LINE API 故障不得阻擋預約建立、確認、取消或改期。
2. 每個通知事件最多建立一筆有效工作，重試不得重複產生多筆通知。
3. 每筆通知都具備店家、預約、客戶、事件與發送結果的稽核軌跡。
4. LINE 憑證不得出現在前端、公開資料表、Git、日誌或 API 回應。
5. 所有管理操作必須同時通過店家隔離、管理員角色與 RLS／伺服器授權。

### Success Metrics

| Metric | Current Baseline | Target | Verification |
|--------|------------------|--------|--------------|
| 預約流程受 LINE API 失敗影響 | 尚未串接 | 0 次 | 模擬 LINE 5xx／逾時 |
| 同事件重複通知工作 | 尚未串接 | 0 筆 | 並發與重放測試 |
| 跨店讀取／操作通知 | 尚未串接 | 0 筆 | RLS 測試 |
| 憑證出現在前端或 Git | 尚未串接 | 0 筆 | Secret scan／網路回應檢查 |
| 支援通知事件 | 0 種 | 5 種 | 本地整合測試 |
| 失敗工作可追蹤率 | 0% | 100% | outbox 狀態與錯誤碼 |

### Non-Goals

- 本階段不提供行銷群發、分眾廣播或優惠活動訊息。
- 本階段不提供客戶自由輸入訊息的客服聊天後台。
- 本階段不發送 Messenger 或 Instagram 訊息。
- 本階段不自動遷移舊第三方系統的 LINE 客戶資料。
- 本階段不保證客人封鎖官方帳號後仍可收到訊息。
- 本地 QA 通過並取得使用者確認前不部署正式環境。

## User Stories

| ID | User Story | Priority |
|----|-----------|----------|
| US-1 | 身為人工確認模式的客人，我希望送出預約後收到「申請已收到」 | P0 |
| US-2 | 身為客人，我希望預約確認後收到正確的課程、老師與時間 | P0 |
| US-3 | 身為客人，我希望取消或改期時收到通知，避免依照舊時間到店 | P0 |
| US-4 | 身為客人，我希望預約前 24 小時收到提醒 | P0 |
| US-5 | 身為店家管理員，我希望能開關每種通知並編輯文字範本 | P0 |
| US-6 | 身為店家管理員，我希望安全驗證 Messaging API 串接並測試發送 | P1 |
| US-7 | 身為店家成員，我希望看到通知是否成功，但不能看到憑證 | P1 |

## Scope

### In Scope

- 店家級 Messaging API 串接狀態與安全憑證參照。
- Channel Access Token／Channel Secret 的伺服器端驗證與安全保存。
- LINE follow／unfollow Webhook 簽章驗證、事件去重與好友狀態更新。
- 可稽核的通知 outbox、原子領取、重試、退避與永久失敗狀態。
- 預約申請、確認、取消、改期與 24 小時提醒事件。
- 現有通知設定／範本的相容擴充。
- LINE 文字訊息變數替換、長度限制與安全預覽。
- 後台 Messaging API 狀態、通知開關、範本與測試發送。
- LIFF 好友狀態檢查與加入官方帳號提示。
- 本地資料庫、Edge Function、後台及手機版 QA。

### Out of Scope

- 正式環境 Secrets 寫入與正式部署。
- LINE Flex Message 視覺卡片編輯器。
- 行銷訊息、標籤分眾、群發排程與成效分析。
- 雙向客服聊天、圖片／檔案／位置訊息。
- 自動申請 LINE Provider、Messaging API Channel 或 LIFF App。

## Functional Requirements

### Messaging API 串接

- FR-1：每個店家可設定一組有效的 LINE Messaging API Channel，且須與目前 LINE Login Channel 位於同一 Provider。
- FR-2：設定時後端須使用 LINE Bot Info API 驗證 Token，並保存 bot user ID、Basic ID、顯示名稱與驗證時間。
- FR-3：Channel Access Token 與 Channel Secret 只能進入伺服器端安全儲存；公開資料表只保存秘密參照與非敏感 metadata。
- FR-4：後端不得將憑證、完整秘密參照或 LINE API 授權標頭寫入日誌、稽核內容或回應。
- FR-5：解除官方 LINE 串接時停止建立與發送新通知，但保留歷史預約、客戶身分與通知結果。
- FR-6：跨 Provider 重綁沿用既有封存身分規則，不以電話自動合併客戶。

### 通知事件

- FR-7：人工確認模式建立 `pending` 預約時，建立 `booking_received` 工作。
- FR-8：自動確認模式建立預約，或人工預約首次轉為 `confirmed` 時，建立 `booking_confirmed` 工作。
- FR-9：預約從非取消狀態轉為 `cancelled` 時，建立 `booking_cancelled` 工作。
- FR-10：已存在的有效預約，其開始時間、課程或老師變更時，建立 `booking_rescheduled` 工作。
- FR-11：已確認且未取消的預約，在開始前 24 小時的允許視窗內建立一次 `reminder` 工作。
- FR-12：沒有有效 LINE 渠道身分、非好友、已解除店家串接或通知關閉時，不呼叫 LINE API，並記錄可辨識的略過原因。

### Outbox 與 Worker

- FR-13：預約交易只能寫入 outbox，不得在資料庫交易內呼叫 LINE API。
- FR-14：工作以不可變的 `idempotency_key` 防止同事件重複建立。
- FR-15：Worker 以 `FOR UPDATE SKIP LOCKED` 原子領取到期工作，縮短持鎖時間後再呼叫外部 API。
- FR-16：Worker 呼叫 LINE Push API 時以工作 ID 作為 `X-Line-Retry-Key`。
- FR-17：網路錯誤、LINE 429 與可重試 5xx 使用指數退避；不可重試 4xx 直接標記永久失敗。
- FR-18：超過最大嘗試次數的工作進入 `dead` 狀態，不自動無限重送。
- FR-19：Worker 回寫 LINE request ID、HTTP 狀態、錯誤分類與嘗試次數，但不得保存授權標頭或完整敏感回應。
- FR-20：多個 Worker 同時執行時，同一工作只能被一個 Worker 領取。

### Webhook 與可送達性

- FR-21：Webhook 必須使用原始 request body 與 Channel Secret 驗證 HMAC-SHA256 簽章，驗證成功後才解析事件。
- FR-22：每個 webhook event ID 只能處理一次；重送事件需安全忽略。
- FR-23：follow 事件將對應 LINE 身分標記為可送達；unfollow 事件標記為不可送達，但不得刪除身分或歷史。
- FR-24：無法對應店家／Provider 的 webhook 不得跨店更新資料，並只記錄去識別化錯誤。
- FR-25：LIFF 預約頁可檢查好友狀態；非好友時明確提示加入店家官方帳號才能接收通知，但不阻止完成預約。

### 後台管理

- FR-26：只有店家管理員能新增、驗證、替換或解除 Messaging API 憑證。
- FR-27：後台顯示官方帳號名稱、Basic ID、串接狀態、最近驗證時間及 webhook URL，不顯示 Token 或 Secret。
- FR-28：店家可分別開關 5 種通知並編輯範本。
- FR-29：範本只允許白名單變數，例如 `{{customer_name}}`、`{{service_name}}`、`{{practitioner_name}}`、`{{start_time}}`、`{{store_name}}`。
- FR-30：測試發送只允許管理員對自己店家已驗證的 LINE 身分執行，並寫入稽核與 outbox。
- FR-31：一般成員可查看自己店家的通知狀態與去敏錯誤，但不可編輯設定或重新發送。

## Event Matrix

| Event | Trigger | Default | Idempotency Scope |
|------|---------|---------|-------------------|
| `booking_received` | 建立人工確認預約 | 開啟 | booking + event + created version |
| `booking_confirmed` | 建立自動確認／首次確認 | 開啟 | booking + event + confirmation version |
| `booking_cancelled` | 首次取消 | 開啟 | booking + event + cancellation version |
| `booking_rescheduled` | 時間／課程／老師異動 | 開啟 | booking + event + updated timestamp |
| `reminder` | 開始前 24 小時視窗 | 開啟 | booking + event + start time |

## User Experience

- 後台設定沿用既有元件庫的 Input、Button、Toggle、FormField 與 ConfirmModal。
- Messaging API 憑證欄位只在設定或替換時顯示；儲存後永不回填明文。
- 「測試發送」需二次確認，結果顯示為已排入、已送出、已略過或失敗。
- 預約頁不因好友狀態查詢失敗而白屏或阻擋預約。
- 非好友提示聚焦於「接收通知需要加好友」，不得暗示預約尚未成立。

## Technical Design

### Components and Locations

| Layer | Location | Responsibility |
|------|----------|----------------|
| PRD | `PRD_LINE_MESSAGING_NOTIFICATIONS.md` | 範圍、事件與部署門檻 |
| Database | `supabase/migrations/*_line_messaging_notifications.sql` | outbox、設定擴充、RLS、事件函式與索引 |
| Shared LINE code | `supabase/functions/_shared/line-messaging.ts` | API client、簽章、錯誤分類與內容限制 |
| Admin API | `supabase/functions/line-messaging-settings/index.ts` | 驗證／替換憑證、測試發送 |
| Webhook | `supabase/functions/line-webhook/index.ts` | 原始 body 簽章驗證與 follow／unfollow |
| Worker | `supabase/functions/line-notification-worker/index.ts` | 領取、組版、發送、重試與結果回寫 |
| Admin UI | `src/pages/admin/SettingsPage.tsx` | 串接狀態、通知開關、範本與測試 |
| LIFF UI | `src/pages/booking/BookingPage.tsx` | 好友狀態提示與加入好友引導 |
| Types | `src/types/database.ts` | 新資料表與設定欄位型別 |

### Data Model

#### `store_line_messaging_credentials`

伺服器專用、不得透過 Data API 直接存取：

- `store_id`、`connection_id`。
- 安全儲存中的 `channel_access_token`／`channel_secret` 參照。
- `messaging_channel_id`、`bot_user_id`、驗證狀態與時間。
- Token 不保存於 `store_channel_connections`、`stores` 或 audit JSON。

#### `line_notification_outbox`

- `store_id`、`booking_id`、`client_id`、`identity_id`。
- `event_type`、`idempotency_key`、`payload_snapshot`。
- `status`：`pending`、`processing`、`sent`、`skipped`、`retry`、`dead`。
- `available_at`、`attempt_count`、`locked_at`、`sent_at`。
- 去敏 `error_code`、`http_status`、`line_request_id`。

#### `line_webhook_events`

- 店家／連線、LINE webhook event ID、事件類型、接收與處理時間。
- 唯一鍵防止 webhook 重放。
- 不保存原始完整 webhook body。

#### Existing Tables

- 擴充 `notification_settings`：收到申請、取消、改期開關與提醒提前分鐘數。
- 擴充 `notification_templates` 可用事件類型，保留既有範本。
- 擴充 `customer_channel_identities`：`friend_status`、`friend_status_updated_at`、`notifications_reachable`。
- 擴充 `stores`：IANA `timezone`，預設 `Asia/Taipei`，用於提醒時間與訊息顯示。

### Security Model

- 新表一律啟用 RLS，並先 `REVOKE ALL` 再明確 `GRANT`。
- 管理員讀寫必須同時驗證 `(SELECT current_store_id())` 與 `(SELECT is_admin())`。
- Worker 領取／完成／失敗 RPC 僅允許 `service_role`，函式使用 `SECURITY DEFINER SET search_path = ''`。
- 前端只可查詢去敏 view／RPC，不得查詢憑證表或秘密參照。
- Webhook 以 URL 中不可當作秘密的 connection ID 選擇 Channel Secret，安全性仍完全依賴簽章驗證。
- 所有可由前端提交的店家、預約、客戶與 identity ID 都須在伺服器重新驗證同店歸屬。

### Queue and Scheduling

- 採用專案自有 outbox 表，而非依賴未確認版本的 queue extension，方便 migration、RLS、稽核與本地測試。
- 每分鐘由 Supabase Cron 呼叫 Worker；Worker 每批領取少量工作並限制執行時間。
- Reminder 掃描只建立符合視窗且尚未存在的工作，索引以 `(status, available_at)` 與 partial pending/retry 範圍支援。
- 正式 Cron 建立與 Secrets 設定屬部署步驟，本地先以函式／命令手動觸發驗證。

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| 客人未加好友／封鎖 OA | 預約成立；通知標記 `skipped:not_reachable` |
| LINE API 429／5xx／逾時 | 依退避規則重試，不影響預約 |
| LINE API 回 200 但客人已封鎖 | 記錄 API 成功；後續 unfollow 更新可送達性 |
| 同一狀態更新重放 | 唯一 idempotency key 阻止重複工作 |
| 改期後舊提醒仍在佇列 | 舊工作送出前重新驗證 start time；不符即略過 |
| 已取消預約有待送提醒 | Worker 重新驗證狀態後略過 |
| 店家通知關閉後已有待送工作 | Worker 發送前再次檢查設定並略過 |
| 串接解除後已有待送工作 | Worker 不取用失效連線並略過 |
| Worker 送出後回寫前中斷 | 使用 `X-Line-Retry-Key` 降低重送風險，保留可追蹤重試狀態 |
| Webhook 簽章無效 | 回 401，不解析、不更新任何資料 |
| Webhook 重送 | 唯一事件 ID 安全忽略並回 200 |

## Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| Messaging API Channel 與 Login Channel 同 Provider | 店家 | 待確認 | 無法完整對應同一 LINE user ID |
| Channel Access Token 與 Channel Secret | 店家 | 部署／真機 QA 前提供 | 本地只能 mock LINE API |
| Messaging API Webhook URL 設定 | 店家／開發 | 部署後設定 | 無法即時更新 follow／unfollow |
| LINE OA 加好友入口與 LIFF 連結 | 店家 | 待確認 | 非好友客戶無法穩定收通知 |
| Supabase Cron／Edge Function Secrets | 開發 | 部署前設定 | 無法自動背景發送 |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token 或 Secret 外洩 | L | Critical | 伺服器安全儲存、永不回傳、secret scan、稽核去敏 |
| 跨店誤發訊息 | L | Critical | store_id 全鏈路驗證、RLS、service-only RPC、整合測試 |
| 重複提醒／取消通知 | M | H | deterministic idempotency key、唯一索引、LINE retry key |
| LINE 月訊息額度耗盡 | M | M | 只發交易通知、開關控制、失敗分類與用量監看 |
| 客人封鎖後 API 行為不明顯 | M | M | Webhook 好友狀態、LIFF 加好友提示、略過原因 |
| 範本變數或長度錯誤 | M | M | 白名單、儲存前驗證、發送前安全 fallback |
| 排程掃描造成資料庫負載 | L | M | partial/composite index、小批次與短交易 |

## Implementation Plan

| Phase | Deliverable | Checkpoint |
|------|-------------|------------|
| 1 | 本 PRD、事件矩陣與安全邊界 | 文件 commit |
| 2 | outbox／webhook／設定資料模型、RLS、RPC、SQL 測試 | DB commit |
| 3 | 共用 LINE client、憑證設定 API、Webhook、Worker 與單元測試 | 每 1–3 檔一個 commit |
| 4 | 後台設定、範本、測試發送與 LIFF 好友提示 | 前端分批 commit |
| 5 | 本地 reset、RLS、mock LINE、後台與手機 E2E、安全回歸 | QA report commit |
| Deploy Gate | 使用者審閱 QA 後才推送、合併、migration、Secrets、Functions、Cron、Pages | 明確確認 |

## Deployment and Rollback

### Deployment Order

1. 備份與套用資料庫 migration。
2. 設定 Edge Function 所需的系統 secrets，不包含店家 Channel Token 明文。
3. 部署設定 API、Webhook 與 Worker。
4. 在 LINE Developers Console 設定並驗證 webhook。
5. 建立 Supabase Cron。
6. 部署前端，先關閉所有新通知開關。
7. 對測試 LINE 身分執行真實測試發送後逐項開啟。

### Rollback

- 第一時間關閉店家通知開關與 Cron，停止新工作與發送。
- Edge Functions 可回滾上一版本；outbox 與歷史資料保留供調查。
- Migration 第一版以新增欄位／資料表為主，不刪除既有通知或預約欄位。
- 不以刪除歷史通知作為回滾方式。

## QA Acceptance Criteria

- [ ] 人工／自動確認模式各建立正確且唯一的通知工作。
- [ ] 確認、取消、改期與 24 小時提醒事件正確。
- [ ] LINE 429、5xx、逾時、4xx 與無好友狀態分類正確。
- [ ] 並發 Worker 不重複領取同一工作。
- [ ] 跨店管理員與一般成員無法操作他店通知或憑證。
- [ ] anon 無法讀取 outbox、webhook 或憑證資料。
- [ ] Webhook 無效簽章、有效簽章與重放情境通過。
- [ ] Token／Secret 不出現在 Git、build、瀏覽器 response 或日誌。
- [ ] 一般網頁預約、LINE 預約、後台預約與手機版流程無回歸。
- [ ] 本地完整 build 與針對性測試通過。

## Open Questions Before Production

- [ ] 店家的 Messaging API Channel 與 LINE Login Channel 是否確認為同一 Provider？
- [ ] 正式通知要使用長期 Channel Access Token，或由店家先建立 Messaging API Channel Access Token v2.1？
- [ ] 提醒固定 24 小時，或第一版開放店家調整（建議預設 1440 分鐘並限制範圍）？
- [ ] LINE 月訊息額度與用量告警由誰監看？
- [ ] 真機 QA 使用哪一個測試官方帳號與測試 LINE 使用者？

## Official References

- [LINE Messaging API：Push message](https://developers.line.biz/en/reference/messaging-api/#send-push-message)
- [LINE：Channel access token](https://developers.line.biz/en/docs/basics/channel-access-token/)
- [LINE：Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [LINE：Receiving messages and follow events](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE LIFF：Friendship API](https://developers.line.biz/en/reference/liff/#get-friendship)
- [LINE：Link a bot to a LINE Login channel](https://developers.line.biz/en/docs/line-login/link-a-bot/)
- [Supabase：Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase：Cron](https://supabase.com/docs/guides/cron)
- [Supabase：Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-21 | Codex | LINE 預約交易通知、可靠 outbox、Webhook、後台設定與本地 QA 規格 |
