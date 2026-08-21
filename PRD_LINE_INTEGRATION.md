---
artifact: prd
version: "1.0"
created: 2026-08-21
status: approved-for-local-development
---

# PRD：LINE 預約串接第一階段

## Overview

### Problem Statement

目前公開預約頁已能初始化 LIFF 並取得客人的 LINE 顯示名稱、頭像與 user ID，但後端會直接相信瀏覽器送來的 LINE 資料。攻擊者可偽造 `client_line_id`，且 LINE 身分散落在每筆預約，店家無法在客戶資料中清楚查看已驗證的渠道身分。

店家需要一個能從 LINE 官方帳號無痛導向的預約入口，同時保留一般網頁預約，並為未來 Messenger、Instagram 渠道預留一致的資料結構。

### Solution Summary

建立安全的 LINE 預約流程：前端只傳送 LIFF ID token，Supabase Edge Function 向 LINE 驗證後取得可信任身分，再透過僅後端可執行的資料庫函式建立預約及綁定客戶渠道身分。後台設定頁提供 LIFF 網址與狀態，客戶詳情顯示已驗證的 LINE 資訊。

### Target Users

- 從 LINE 官方帳號預約服務的客人
- 管理預約與客戶資料的店家管理員及成員

## Goals & Success Metrics

### Goals

1. LINE 預約不得信任前端自行提交的 user ID、姓名或頭像。
2. 保留既有一般網頁預約功能與操作流程。
3. 店家能在設定頁取得正確的 LIFF 預約網址。
4. 店家能在客戶詳情辨識已驗證的 LINE 身分。
5. 資料模型可延伸至 Messenger 與 Instagram，不需重建客戶主表。

### Success Metrics

| Metric | Current Baseline | Target | Timeline |
|--------|-----------------|--------|----------|
| 可偽造 LINE 身分的公開入口 | 1 個 | 0 個 | 本階段完成時 |
| LINE ID token 後端驗證率 | 0% | 100% | 本階段完成時 |
| 一般網頁預約回歸情境通過率 | 未建立 | 100% | 本地 QA |
| 客戶渠道店家隔離測試 | 未建立 | 全部通過 | 本地 QA |
| LINE 客戶資訊後台可見性 | 無 | 客戶詳情可辨識 | 本階段完成時 |

### Non-Goals

- 本階段不發送 LINE 預約確認、取消或提醒訊息。
- 本階段不接收 LINE Messaging API Webhook。
- 本階段不搬移舊第三方預約系統資料。
- 本階段不實作客戶合併功能。
- 本階段不實作 Messenger 或 Instagram 登入。
- 本地 QA 通過前不部署正式環境。

## User Stories

| ID | User Story | Priority |
|----|-----------|----------|
| US-1 | 身為 LINE 客人，我希望從店家 LINE 直接開啟預約並帶入 LINE 資訊 | P0 |
| US-2 | 身為一般網頁客人，我希望沒有 LINE 也能照常預約 | P0 |
| US-3 | 身為店家，我希望複製正確的 LINE 預約網址放進 Rich Menu | P0 |
| US-4 | 身為店家，我希望在客戶詳情看到已驗證的 LINE 名稱與頭像 | P1 |
| US-5 | 身為店家，我希望客人換電話後仍保留原本的 LINE 綁定 | P1 |

## Scope

### In Scope

- LIFF 初始化、登入狀態、ID token 取得與錯誤降級。
- LINE ID token 伺服器驗證。
- 安全 LINE 預約 Edge Function。
- 一般網頁公開 RPC 禁止接收可信 LINE 身分。
- 通用 `customer_channel_identities` 資料表、索引、RLS 與權限。
- 客戶詳情的 LINE 渠道資訊。
- 設定頁的 LIFF ID、Endpoint URL、LINE 預約網址與設定狀態。
- SQL、安全、桌面及手機版本地 QA。

### Out of Scope

- LINE Messaging API 主動推播。
- Webhook、加好友狀態與訊息事件。
- 渠道解除綁定或客戶合併操作。
- 正式環境部署。

### Future Considerations

- LINE 預約成功、取消及提醒通知。
- Messaging API Webhook 簽章驗證及事件去重。
- 多店家各自管理 LINE Channel 憑證。
- Messenger、Instagram 渠道身分。
- 舊系統資料匯入、雙軌運行與 Rich Menu 切換。

## Solution Design

### Functional Requirements

#### LINE 身分驗證

- FR-1：前端只可將 `liff.getIDToken()` 取得的 ID token 傳至後端。
- FR-2：後端必須使用店家設定的 LINE Login Channel ID 向 LINE 驗證 token。
- FR-3：後端不得信任前端傳入的 LINE user ID、顯示名稱或頭像。
- FR-4：伺服器日誌不得記錄 ID token、Channel Secret 或 Access Token。
- FR-5：驗證失敗不得以 `line` 來源建立預約。

#### 建立預約

- FR-6：一般網頁預約繼續呼叫公開預約 RPC，來源固定為 `web`。
- FR-7：LINE 預約必須經 Edge Function 驗證後呼叫僅服務端可執行的內部 RPC。
- FR-8：兩種入口共用原有的課程、老師、緩衝時間、衝突檢查與確認模式。
- FR-9：相同老師的並發預約必須維持交易鎖，避免重複預約。

#### 客戶與渠道身分

- FR-10：同一店家、渠道、Provider 帳號及 Provider user ID 只能對應一筆有效身分。
- FR-11：已驗證渠道身分優先用於尋找既有客戶；電話只能作為次要候選。
- FR-12：不得因公開預約提交相同電話而自動覆蓋既有客戶姓名。
- FR-13：客戶修改電話不應解除 LINE 身分。
- FR-14：`anon` 不得直接查詢或修改客戶渠道身分。
- FR-15：後台登入者只能查看自己店家的渠道身分。

#### 店家後台

- FR-16：設定頁顯示一般預約網址與 `https://liff.line.me/{LIFF_ID}`。
- FR-17：未設定 LIFF ID 時顯示未連線狀態及設定清單。
- FR-18：客戶詳情顯示 LINE 頭像、顯示名稱、已驗證狀態及最近使用時間。
- FR-19：LINE user ID 僅顯示遮蔽值，不顯示完整值。

### User Experience

- 預約頁沿用現有手機優先流程，不重新設計主要步驟。
- LINE 初始化期間顯示輕量狀態；失敗時仍允許一般網頁預約，但明確標示未帶入 LINE 身分。
- 客戶詳情新增「已連結渠道」區塊，不改變既有電話、預約歷史與編輯流程。
- 設定頁沿用現有元件與視覺語言，避免引入新的設計系統。

### Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| LIFF ID 未設定 | 一般網頁預約照常使用，設定頁提示未連線 |
| 從外部瀏覽器打開 LIFF URL | 依 LINE 流程登入；失敗可退回一般網頁來源 |
| ID token 無效、過期或 Channel 不符 | 拒絕 LINE 預約，不建立渠道身分 |
| 同一 LINE 身分再次預約 | 沿用已綁定客戶並更新最近使用時間 |
| 相同電話已有不同客戶／LINE 身分 | 不自動合併，回傳可辨識衝突供後續處理 |
| 預約時段同時被搶走 | 維持既有 `CONFLICT` 回應與重新選擇流程 |
| LINE 驗證服務暫時無法連線 | 不降級成偽 LINE 預約；提示稍後再試或改用一般網頁預約 |

## Technical Considerations

### Constraints

- 現有 `BookingPage.tsx` 與 migration 為受保護檔案，修改前需先確認方案並分批提交。
- Supabase Edge Function 為公開預約入口，需自行執行輸入驗證、速率限制基礎防護與 CORS 限制。
- 現有全專案 TypeScript／ESLint 有既存錯誤；本功能要求新增及修改範圍通過針對性檢查，並以正式 build 作整體門檻。
- 既有 `bookings.client_line_id` 暫時保留相容性，不在本階段刪除欄位或舊資料。

### Integration Points

- LINE Login／LIFF：取得 ID token。
- LINE OAuth 2.1 Verify API：伺服器驗證 ID token。
- Supabase Edge Functions：可信任邊界與預約編排。
- Supabase PostgreSQL：預約、客戶、渠道身分、RLS 與稽核。
- Cloudflare Pages：既有預約及後台前端。

### Data Requirements

- 新增 `customer_channel_identities`，包含 `store_id`、`client_id`、`channel`、`provider_account_id`、`provider_user_id`、顯示資料、驗證時間及軟刪除欄位。
- 對有效資料建立 `(store_id, channel, provider_account_id, provider_user_id)` partial unique index。
- Provider user ID 視為個人識別資料；前端後台只顯示遮蔽值。
- LINE Channel Secret／Access Token 不存入公開資料表，也不提交 Git。

## Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| LINE Developers Provider 與 Login Channel | 店家 | 待確認 | 無法用真實 LINE 帳號完成 QA |
| LIFF ID 與正式 Endpoint 設定 | 店家／開發 | 待設定 | 只能以 mock 驗證本地流程 |
| Docker Desktop 與 Supabase CLI | 本機 | 已具備 | 無法進行完整本地資料庫 QA |
| Supabase 專案 Secrets 權限 | 店家／開發 | 部署前確認 | 無法部署 Edge Function |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LINE Login 與 Messaging API 不在同一 Provider | M | H | 開工清單要求先核對 Provider；通知功能前再驗證 |
| 公開 Edge Function 被大量呼叫 | M | M | 限制 payload、驗證輸入、加入最小速率限制與可觀測錯誤碼 |
| 同電話客戶誤合併 | M | H | LINE 身分優先；電話衝突不自動合併 |
| Migration 影響既有資料 | L | H | 僅新增表／函式與相容修改；本地 reset、RLS 測試及回滾腳本 |
| LIFF 外部瀏覽器行為差異 | M | M | 測試 LINE 內建瀏覽器、Safari／Chrome 及一般網址降級 |

## Timeline & Milestones

| Milestone | Description | Target |
|-----------|-------------|--------|
| M1 | PRD、技術邊界與隔離分支 | 開工日 |
| M2 | 渠道身分資料庫、RLS 與 SQL 測試 | M1 後 1 個工作天 |
| M3 | LINE token 驗證與安全預約 Edge Function | M2 後 1～1.5 個工作天 |
| M4 | 預約、設定與客戶後台 UI | M3 後 1～2 個工作天 |
| M5 | 本地後台、手機版、安全與回歸 QA | M4 後 1 個工作天 |
| Deploy Gate | 使用者確認 QA 報告後才部署 | 不預先部署 |

## Open Questions

- [ ] LINE Login Channel 與店家 Messaging API Channel 是否位於同一 Provider？Owner：店家
- [ ] 正式 LIFF ID 與 Channel ID 為何？Owner：店家
- [ ] 第一版是否只服務單一店家憑證，或需要多店家自行串接？Owner：產品
- [ ] LINE 主動通知要在第二期一次完成哪些事件？Owner：產品

## Appendix

### Related Documents

- `LINE_SETUP.md`
- `AGENTS.md`
- `SECURITY_REVIEW.md`
- `SECURITY_IMPROVEMENT_PLAN.md`

### Official References

- [LINE：在 LIFF 與伺服器安全使用使用者資料](https://developers.line.biz/en/docs/liff/using-user-profile/)
- [LINE：LIFF URL 與開啟流程](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [LINE：不同 Provider 的 user ID 規則](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
- [Supabase：Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase：Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-21 | Codex | 第一版安全 LINE 預約、本地 QA 與部署門檻 |
