---
artifact: prd
version: "1.1"
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
| 1.1 | 2026-08-21 | Codex | 新增店家官方 LINE 串接、解除、同／跨 Provider 重綁與審計規格 |

## 第二階段：店家官方 LINE 串接生命週期

### Problem Statement

第一階段只在 `stores` 保存目前的 LIFF ID 與 LINE Login Channel ID，無法顯示 LINE Provider、官方帳號或歷次串接，也沒有安全的解除與重綁流程。若店家直接改填另一組 Channel ID，舊客戶渠道身分仍會保留為有效資料；跨 Provider 時，同一 LINE 使用者會取得不同 user ID，並可能因相同電話觸發身分衝突。

### Goals & Success Metrics

1. 店家管理員可辨識目前串接的 Provider、LINE Login Channel、LIFF 與官方帳號。
2. 解除串接立即停止 LINE 身分預約，但一般網頁預約不受影響。
3. 同 Provider 重綁可延續既有客戶 LINE 身分。
4. 不同 Provider 重綁會軟封存舊身分，讓新 Provider 可重新建立可信身分。
5. 串接、資料補齊、解除與重綁都留下操作人及前後值。

| Metric | Baseline | Target |
|---|---|---|
| 官方 LINE 串接歷史可追溯率 | 0% | 100% |
| 解除後 LINE token 可建立預約 | 可繼續依舊設定嘗試 | 0 筆 |
| 同 Provider 重綁身分延續率 | 未支援 | 100% |
| 跨 Provider 舊身分封存率 | 未支援 | 100% |
| 管理操作審計覆蓋率 | 0% | 100% |

### User Stories

| ID | User Story | Priority |
|---|---|---|
| US-6 | 身為店家管理員，我希望看到目前串接的是哪個 Provider 與官方帳號，避免改錯 LINE 設定 | P0 |
| US-7 | 身為店家管理員，我希望能安全解除官方 LINE 串接，同時保留客戶與預約歷史 | P0 |
| US-8 | 身為店家管理員，我希望改綁同 Provider 的官方帳號時延續既有 LINE 客戶身分 | P0 |
| US-9 | 身為店家管理員，我希望跨 Provider 重綁時封存舊身分，避免相同電話被錯誤阻擋 | P0 |
| US-10 | 身為系統維護者，我希望每次串接變更都有審計紀錄 | P0 |

### Functional Requirements

- FR-20：每家店、每個渠道同時只能存在一筆有效串接。
- FR-21：LINE 串接需保存 Provider ID／名稱、官方帳號名稱／Basic ID、LINE Login Channel ID、LIFF ID、版本與連線時間。
- FR-22：既有 `stores.liff_id` 與 `stores.line_login_channel_id` 作為公開預約所需的有效設定快取，不作歷史來源。
- FR-23：只有目前店家的管理員可建立、補齊或解除串接；一般成員只能看到必要狀態或被拒絕操作。
- FR-24：解除時必須原子性地封存有效串接並清空店家的 LIFF／Channel ID；不得停用一般網頁預約。
- FR-25：解除不得刪除客戶、預約、預約內的 LINE 快照或渠道身分歷史。
- FR-26：重綁時必須與最近一筆已解除串接比較 Provider ID。
- FR-27：同 Provider 重綁時，將有效客戶 LINE 身分遷移至新的 Login Channel ID，保留 client 關聯與驗證歷史。
- FR-28：不同 Provider 重綁時，將舊的有效 LINE 身分設定 `deleted_at`，新 Provider 後續可用相同電話建立新身分。
- FR-29：不同 Provider 的 LINE user ID 不得自動視為同一人，也不得自動搬移完整 provider user ID。
- FR-30：串接、補齊、解除與重綁必須寫入 `audit_logs`，記錄操作人、店家、連線紀錄、前後公開設定及遷移／封存筆數。
- FR-31：Provider、Channel 與 LIFF 僅保存公開識別值；Channel Secret、Access Token 與 ID token 不得存入資料表或審計紀錄。
- FR-32：解除與跨 Provider 重綁需在後台顯示二次確認，並說明一般網頁預約與歷史資料不受影響。
- FR-33：既有只保存 LIFF／Channel ID 的店家需自動建立相容的歷史紀錄，並標示「資料待補」而非遺失設定。

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| 未串接時解除 | 回傳可辨識的 `NOT_CONNECTED`，不修改資料 |
| 有有效串接時直接輸入另一組 Channel／LIFF | 阻擋並要求先解除，避免無歷史覆蓋 |
| 沿用相同 Login Channel，只更換同 Provider 官方帳號 | 更新官方帳號資料，不重建客戶身分 |
| 同 Provider、不同 Login Channel | 遷移有效身分至新 Channel，user ID 保持不變 |
| 不同 Provider | 封存舊身分；客戶下次以新 Provider 驗證後重新連結 |
| 舊資料沒有 Provider ID | 視為無法證明同 Provider，採跨 Provider 的安全封存策略 |
| 一般成員呼叫管理操作 | 資料庫拒絕，且不得產生部分更新 |
| 兩位管理員同時操作 | 店家／渠道交易鎖確保只有一個操作成功 |

### Scope Boundaries

**本階段包含**：串接歷史資料表、RLS／權限、管理 RPC、審計、既有設定回填、後台顯示／解除／重綁、SQL 與瀏覽器 QA。

**本階段不包含**：自動登入 LINE Developers Console、以 OAuth 代替店家輸入公開 ID、管理 Channel Secret／Access Token、Messaging API 推播、Rich Menu 自動建立或移除。

### Deployment Gate

1. 本機從零 migration 與 pgTAP 全部通過。
2. 管理員／一般成員／跨店家權限測試通過。
3. 同 Provider 遷移、跨 Provider 封存、解除後一般網頁預約等情境通過。
4. 後台二次確認、狀態顯示、重新整理後持久化與手機版版面通過。
5. 使用者確認 QA 報告後，才依序部署 migration、Edge Function（如有）、前端與正式環境回歸。
