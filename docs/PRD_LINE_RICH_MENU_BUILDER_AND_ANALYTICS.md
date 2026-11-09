---
artifact: prd
version: "0.1"
created: 2026-11-06
status: draft
---

# PRD：LINE 圖文選單版型、分頁與點擊分析

## Overview

### Problem Statement

Bookr 已能讓店家串接 LINE Login、LIFF 與 Messaging API，但圖文選單仍需離開 Bookr 到 LINE 官方後台或自行呼叫 API 設定。店家無法在同一個後台完成版型、點擊區域、分頁與發布，也無法將圖文選單成效和預約入口一起管理。

這會造成三個問題：

1. 非技術使用者難以設定圖文選單，且圖片與點擊熱區容易對不準。
2. 多頁圖文選單需要 Rich Menu Alias 與切換動作，人工設定容易遺漏或失效。
3. 店家無法在 Bookr 內知道哪些圖文選單、分頁或按鈕被點擊，無法改善入口設計。

### Solution Summary

在 Bookr 後台新增「LINE 圖文選單」管理功能，讓已完成 Messaging API 串接的店家可以：

- 從 1 至 6 格的預設版型快速建立圖文選單。
- 上傳每個分頁的背景圖片，預覽圖片與可點擊區域。
- 為每個區域設定開啟網址、傳送文字或切換分頁等動作。
- 建立多頁圖文選單並透過 LINE Rich Menu Alias 切換分頁。
- 先儲存草稿、預覽與驗證，再發布為該官方帳號的預設圖文選單。
- 同步 LINE 官方圖文選單 Insights，查看曝光、點擊、獨立點擊人數與各區域成效。

Phase 1 先提供「預設版型 + 基本分頁 + 發布 + 點擊分析」；自由拖拉與調整矩形區域的自訂版型延後至 Phase 2。

### Target Users

- 店家管理員：設計、發布及分析圖文選單。
- 店家一般成員：Phase 1 可查看已發布圖文選單與分析，但不可發布或刪除。
- LINE 官方帳號好友：在 LINE 手機版聊天室中使用圖文選單進入預約、客戶中心或其他店家入口。

### Product Principles

1. **先安全發布，再談自由設計**：預設版型必須保證圖片與熱區合法且一致。
2. **草稿與線上版本分離**：編輯草稿不得立即改動客戶目前看到的選單。
3. **數據要可解讀**：點擊數必須能對應到「選單、分頁、區域名稱」，不能只顯示座標。
4. **以 LINE 官方能力為準**：分頁使用 Rich Menu Alias 與 Rich Menu Switch Action，不模擬網頁分頁。
5. **不蒐集不必要的個資**：Phase 1 優先保存彙總數據，不保存每次點擊者的 LINE User ID。

## Goals & Success Metrics

### Goals

1. 讓沒有 LINE API 技術背景的店家能在 Bookr 內完成圖文選單建立與發布。
2. 支援至少一頁與多頁圖文選單，並確保分頁切換不產生失效連結。
3. 讓店家能比較各分頁與各點擊區域的成效。
4. 維持既有 LINE Messaging、LIFF、預約通知與店家資料隔離的安全性。

### Success Metrics

| Metric | Current Baseline | Phase 1 Target | Measurement Window |
|---|---:|---:|---|
| 管理員成功完成第一個圖文選單發布的比例 | 0%（Bookr 尚無此功能） | ≥ 90% | Staging 驗收及上線後 30 天 |
| 從開始建立到成功發布的中位時間 | 無基準 | ≤ 10 分鐘 | 上線後 30 天 |
| LINE API 發布流程成功率 | 無基準 | ≥ 98%（排除 LINE 平台故障與無效憑證） | 上線後 30 天 |
| 可取得官方 Insights 的圖文選單中，成功同步每日數據的比例 | 0% | ≥ 99% | 上線後 30 天 |
| 跨店家資料或憑證外洩 | 0 | 0 | 持續監控 |
| 已發布選單的區域與預覽座標不一致事件 | 無基準 | 0 | 每次發布 QA |

### Non-Goals

- Phase 1 不提供 Canva 等級的圖片、文字、圖示編輯器。
- Phase 1 不提供自由拖拉、縮放與重疊矩形區域。
- Phase 1 不提供依客戶身分自動套用不同圖文選單。
- Phase 1 不提供定時上下架、活動排程或 A/B Test。
- Phase 1 不取代 LINE Official Account Manager 中既有、非 Bookr 建立的圖文選單。
- 不在 LINE 電腦版提供替代介面；LINE 官方目前不在電腦版顯示 Rich Menu。

## User Stories

| ID | User Story | Priority |
|---|---|---|
| US-1 | 身為店家管理員，我想選擇 1 至 6 格預設版型，快速建立可用的圖文選單 | P0 |
| US-2 | 身為店家管理員，我想上傳圖片並在發布前預覽熱區，避免點錯位置 | P0 |
| US-3 | 身為店家管理員，我想替每個格子設定預約、客戶中心、網址或訊息動作 | P0 |
| US-4 | 身為店家管理員，我想建立多個分頁並設定切換按鈕，讓單一選單容納更多入口 | P0 |
| US-5 | 身為店家管理員，我想先儲存草稿，確認後再發布，不影響目前線上選單 | P0 |
| US-6 | 身為店家管理員，我想看到每個分頁與格子的曝光、點擊與點擊率，判斷哪些入口有效 | P0 |
| US-7 | 身為店家管理員，我想看到同步時間與資料不足提示，避免誤讀尚未完成的數據 | P0 |
| US-8 | 身為店家一般成員，我想唯讀查看目前圖文選單與成效，但不能誤改線上設定 | P1 |
| US-9 | 身為店家管理員，我想回復上一個已發布版本，以便新選單有問題時快速復原 | P1 |
| US-10 | 身為店家管理員，我想自行拖拉格子建立不規則版型 | P2（Phase 2） |

## Scope

### Phase 1 In Scope

- 新增圖文選單列表、建立／編輯頁、預覽與分析頁。
- 1 至 6 格預設版型；同格數可提供水平、垂直或常見不對稱變體。
- 每組選單支援 1 至 3 個分頁。
- 每個分頁上傳一張 JPEG／PNG 背景圖片。
- 圖片適配預覽、格式與大小驗證；不做圖片內容編輯。
- 區域名稱與動作設定：
  - 開啟 Bookr 預約頁。
  - 開啟 LINE LIFF 客戶中心。
  - 開啟自訂 HTTPS 網址。
  - 傳送固定文字訊息。
  - 切換至另一個圖文選單分頁。
- 草稿、發布中、已發布、發布失敗、已停用等狀態。
- 發布前檢查與 LINE Rich Menu Validate API 驗證。
- 建立 Rich Menu、上傳圖片、建立／更新 Alias、設定預設 Rich Menu。
- 以新版本取代既有版本；保留上一個成功版本供回復。
- 同步 LINE Rich Menu Insights 總計與每日資料。
- 分析維度：選單版本、分頁、點擊區域與日期。
- 顯示曝光數、曝光人數、點擊數、獨立點擊人數與點擊率；LINE 未提供資料時顯示明確原因。
- 店家資料隔離、管理員權限、操作紀錄及錯誤稽核。
- Staging 發布與手機 LINE 實機驗證。

### Out of Scope

- 自由拖拉、縮放、重疊或旋轉熱區。
- 內建圖片文字、圖示、品牌素材與自動排版工具。
- 超過 3 個分頁。
- 每位客戶不同選單、會員分眾或商品券狀態個人化選單。
- 定時發布、下架日期與活動檔期排程。
- 即時逐筆 URI 點擊追蹤或跨網站轉換追蹤。
- 對 LINE Official Account Manager 建立的 Rich Menu 進行匯入與編輯。
- A/B Test、漏斗歸因與預約成交歸因。

### Future Considerations

- **Phase 2：自訂版型編輯器**：在畫布上新增、拖拉與縮放矩形，支援吸附、對齊與重疊防止。
- **Phase 2：更多分頁**：依實際使用情況將上限擴大至 6 頁或店家自訂。
- **Phase 2：簡易視覺設計**：文字、顏色、圖示、背景與品牌樣式。
- **Phase 3：分眾選單**：依客戶狀態、商品券餘額或會員身分設定 Per-user Rich Menu。
- **Phase 3：行銷分析**：預約轉換、來源歸因、A/B Test 與活動排程。

## Solution Design

### Information Architecture

建議在後台「設定 → 渠道設定 → LINE 圖文選單」增加入口；只有 LINE Messaging API 已驗證且連線有效時可建立與發布。

主要畫面：

1. **圖文選單列表**：顯示名稱、狀態、分頁數、目前線上版本、最近發布時間與快捷分析。
2. **版型編輯器**：左側／上方為頁籤與畫布，右側／下方為所選區域的名稱與動作設定。
3. **發布確認**：列出圖片、熱區、動作、Alias 與 LINE 驗證結果。
4. **成效分析**：日期範圍、選單版本、分頁與區域排行。

### Phase 1 Primary Flow

1. 管理員進入 LINE 圖文選單，系統確認有效 Messaging API 串接。
2. 建立圖文選單組，輸入內部名稱、聊天室選單列文字及預設展開設定。
3. 新增 1 至 3 個分頁，替每頁命名並選擇 1 至 6 格版型。
4. 上傳背景圖片，系統依畫布比例顯示並覆蓋熱區邊界。
5. 逐一設定區域名稱與動作；分頁選單至少要有可到達其他分頁的切換區域。
6. 儲存草稿並執行發布前檢查。
7. 系統建立所有 LINE Rich Menu、上傳圖片、建立 Alias，最後才切換預設選單。
8. 發布成功後保留 Bookr 版本與 LINE Rich Menu ID 對照；前一版本保留供回復。
9. 系統每日同步 LINE Insights，後台顯示昨日以前的統計與最後同步時間。

### Functional Requirements

#### A. 權限與前置條件

- **FR-1**：只有 LINE Messaging API 狀態為有效且憑證驗證成功的店家可進入建立與發布流程。
- **FR-2**：只有管理員可建立、編輯、發布、停用或回復圖文選單；一般成員僅能查看線上版本與分析。
- **FR-3**：所有圖文選單、圖片、版本與分析資料必須依目前登入帳號的 `store_id` 隔離。

#### B. 圖文選單組與版本

- **FR-4**：管理員可建立圖文選單組，設定內部名稱、聊天室選單列文字及是否預設展開。
- **FR-5**：每次發布必須建立不可變更的版本快照，草稿修改不得改動目前線上版本。
- **FR-6**：系統須保存最近一個成功發布版本，並允許管理員回復；回復本身也要留下新操作紀錄。
- **FR-7**：同一店家同一時間只能有一個發布作業，避免 Rich Menu、圖片與 Alias 互相覆蓋。

#### C. 預設版型與圖片

- **FR-8**：Phase 1 必須提供 1、2、3、4、5、6 格預設版型，版型座標固定且可重複產生相同 LINE bounds。
- **FR-9**：管理員可替每個分頁選擇版型；更換版型前須提示將移除不再存在的區域設定。
- **FR-10**：每個分頁須上傳 JPEG 或 PNG；系統必須在前後端驗證 LINE 支援的尺寸、比例與檔案大小。
- **FR-11**：預覽畫布必須維持圖片原始比例，且熱區座標須與實際送往 LINE 的 bounds 使用同一份標準化資料。
- **FR-12**：圖片或版型變更後，已發布版本不可原地修改；必須發布新版本。

#### D. 分頁與區域動作

- **FR-13**：Phase 1 每個圖文選單組可建立 1 至 3 個分頁，每頁須有唯一名稱與穩定識別碼。
- **FR-14**：多頁選單必須為每頁建立 Rich Menu Alias，並以 Rich Menu Switch Action 切換。
- **FR-15**：系統須檢查分頁切換圖，避免不存在的目標、無法返回主要分頁或所有頁面均不可到達。
- **FR-16**：每個可點擊區域必須設定店家可理解的名稱，供預覽、錯誤訊息與分析報表使用。
- **FR-17**：Phase 1 支援 Bookr 預約頁、LIFF 客戶中心、自訂 HTTPS 網址、固定文字訊息及分頁切換動作。
- **FR-18**：Bookr 內建入口須由目前店家連線資料產生，不可寫死 staging、production 網址或店家代碼。
- **FR-19**：自訂網址僅接受合法 HTTPS；不得接受 `javascript:`、`data:` 或其他不安全協定。

#### E. 發布、更新與失敗復原

- **FR-20**：發布前須完成本地規則驗證及 LINE Validate API 驗證；任一失敗不得切換線上預設選單。
- **FR-21**：發布流程須依序建立 Rich Menu、上傳圖片、建立或更新 Alias，全部成功後才設定預設 Rich Menu。
- **FR-22**：若發布中途失敗，系統須保留舊線上版本、記錄失敗步驟，並清理可安全刪除的未完成遠端資源。
- **FR-23**：發布成功後須保存每個分頁的 LINE Rich Menu ID、Alias ID、圖片版本與區域座標對照。
- **FR-24**：停用目前選單必須二次確認，且不得刪除仍在分析資料保留期間內所需的本地版本對照。
- **FR-25**：所有發布、停用、回復與刪除動作須寫入稽核紀錄，包含操作人、時間、店家、版本與結果。

#### F. 點擊數據與分析

- **FR-26**：系統須使用 LINE Rich Menu Insights API 同步總計及每日曝光／點擊資料，並以 Rich Menu ID 與 bounds 對應至 Bookr 的分頁及區域名稱。
- **FR-27**：分析頁須顯示曝光數、曝光人數、點擊數、獨立點擊人數、點擊率、日期範圍與最後同步時間。
- **FR-28**：當 LINE 因低於隱私門檻、尚未完成隔日彙整或無資料而未回傳數值時，介面須顯示「資料尚未提供」及原因，不得顯示為 0。
- **FR-29**：每日同步必須可重試且可冪等寫入，同一 Rich Menu、日期、區域不得重複累加。
- **FR-30**：Phase 1 只保存彙總數據；不得因分析目的保存單一使用者的 LINE User ID 或逐次瀏覽紀錄。
- **FR-31**：管理員可手動要求重新同步，但系統須限制頻率並遵守 LINE API Rate Limit。
- **FR-32**：選單停用或遠端刪除後，既有分析仍可依本地版本與區域名稱查閱。

#### G. 狀態與可觀測性

- **FR-33**：後台須顯示草稿、發布中、已發布、發布失敗、已停用與回復中等狀態。
- **FR-34**：LINE API 錯誤須轉換成可操作的中文訊息，並保留不含憑證的技術錯誤碼供排查。
- **FR-35**：發布與 Insights 同步須有結構化日誌、重試次數及最後成功時間，便於 staging 與 production 監控。

### User Experience

- 預設先顯示常用版型，並以清楚縮圖呈現格數與分割方向。
- 上傳圖片後直接顯示半透明熱區框與 A、B、C 等暫時標記；設定名稱後改顯示區域名稱。
- 點擊畫布區域即選取對應設定面板；手機後台以「預覽／區域設定」分段顯示，避免雙欄縮窄。
- 分頁以頁籤呈現，並標記未完成設定、驗證錯誤及目前預設頁。
- 「儲存草稿」與「發布到 LINE」須視覺分級，發布前顯示影響範圍與目前線上版本。
- 分析資料預設顯示最近 30 天，且明確標示 LINE 數據通常隔日完成彙整。

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Messaging API 尚未串接或憑證失效 | 禁止發布，導引至 LINE Messaging 設定；既有本地草稿仍可查看 |
| 圖片超過 1 MB、格式錯誤或比例不符 | 上傳即提示並拒絕發布，不建立 LINE 遠端資源 |
| 更換版型導致原區域數減少 | 顯示將被移除的區域與動作，確認後才更換 |
| 分頁切換指向已刪除頁面 | 草稿驗證失敗並標示來源區域 |
| 多頁選單無返回主要頁入口 | 阻止發布並指出不可回復的頁面 |
| 發布第 2 頁圖片失敗 | 舊選單保持上線，新版本標記失敗並清理未完成資源 |
| LINE API 暫時無法使用 | 顯示可重試狀態，不把草稿標成已發布 |
| 兩位管理員同時發布 | 僅第一個取得發布鎖；第二個看到發布進行中 |
| Insights 尚未完成隔日彙整 | 顯示等待 LINE 彙整，不顯示 0 |
| 獨立點擊者低於 LINE 隱私門檻 | 顯示樣本不足／官方未提供，不推算人數 |
| 已停用或刪除遠端選單仍有歷史數據 | 保留本地版本、區域名稱及已同步統計 |
| LINE 電腦版查看官方帳號 | 說明圖文選單僅在支援的 LINE 手機環境顯示 |

## Technical Considerations

### Constraints

- LINE Rich Menu 圖片須為 JPEG／PNG，寬度 800–2500px、高度至少 250px、寬高比至少 1.45、檔案上限 1 MB。
- 每個 Rich Menu 最多 20 個 tappable areas；Phase 1 最多 6 個內容區域加分頁切換區域，仍須由後端檢查總數。
- LINE 已設定圖片的 Rich Menu 無法直接替換圖片；更新必須建立新版本。
- 多頁切換使用 Rich Menu Alias；Alias 與 Rich Menu 建立／更新需處理部分成功及回復。
- LINE Insights 通常隔日完成彙整，並可能因隱私門檻不回傳統計；不是即時分析。
- LINE Official Account Manager 與 Messaging API 建立的 Rich Menu 不能互相編輯或取得完整統計；Bookr 僅管理自己透過 Messaging API 建立的資源。
- LINE 官方目前可建立最多 1,000 個 Rich Menu 與 1,000 個 Alias；版本清理策略不得無限制累積遠端資源。

### Integration Points

- **現有 LINE Messaging 設定**：沿用 `store_channel_connections`、私有 Messaging 憑證與 Vault，不新增前端可讀取的 access token。
- **LINE Messaging API**：Validate、Create、Upload Image、Alias、Set Default、Delete 及 Insights endpoints。
- **現有 LINE Webhook**：Phase 1 若使用 message／rich-menu-switch 動作，須擴充事件白名單與測試；不得破壞既有 follow／unfollow 流程。
- **Bookr LIFF 與公開預約網址**：內建動作需依店家連線與環境產生正確網址。
- **Supabase Storage**：建議使用店家隔離的私有 bucket 保存草稿與版本圖片，發布由受信任後端讀取。
- **排程同步**：每日觸發 Insights 同步；需支援失敗重試、冪等與 Rate Limit。

### Data Requirements

Phase 1 預期需要以下概念資料，實際 schema 在實作前以資料庫設計審查確認：

- 圖文選單組：店家、名稱、目前草稿、目前線上版本。
- 圖文選單版本：狀態、聊天室文字、預設展開、發布時間、操作人、錯誤資訊。
- 分頁：穩定 page key、顯示名稱、順序、版型、圖片版本、LINE Rich Menu ID、Alias ID。
- 點擊區域：穩定 area key、名稱、標準化 bounds、動作類型與安全化設定。
- 每日 Insights：日期、Rich Menu ID、分頁、區域、曝光與點擊彙總、同步狀態。
- 發布工作：步驟、嘗試次數、遠端資源、成功／失敗時間。
- 稽核紀錄：建立、發布、停用、回復與刪除。

所有公開表須啟用 RLS 並以 `current_store_id()` 隔離；憑證與遠端管理細節保留在 private schema／Vault。分析資料不保存單一使用者識別碼。

### Analytics Definitions

| Term | Definition |
|---|---|
| 曝光數 | LINE Insights 回傳的 Rich Menu 顯示次數 |
| 曝光人數 | LINE Insights 回傳的查看 Rich Menu 獨立使用者數 |
| 點擊數 | 特定 bounds 的總點擊次數 |
| 獨立點擊人數 | 特定 bounds 的獨立點擊使用者數；僅顯示 LINE 有提供的值 |
| 點擊率 | 點擊數 ÷ 曝光數；曝光為 0 或未提供時不計算 |
| 分頁點擊 | 該分頁所有非分頁切換區域點擊數加總；切換動作另外列示 |

## Agent Execution Contract

### Authoritative Sources

| Source | Path or link | Definitive for |
|---|---|---|
| 本 PRD | `docs/PRD_LINE_RICH_MENU_BUILDER_AND_ANALYTICS.md` | Phase 1 產品範圍、權限與驗收條件 |
| LINE Rich Menu Overview | https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/ | Rich Menu 行為、優先序、統計與工具限制 |
| LINE Messaging API Reference | https://developers.line.biz/en/reference/messaging-api/ | API 欄位、圖片限制、areas、aliases、Insights 與 Rate Limit |
| 現有 LINE 設定流程 | `src/pages/admin/SettingsPage.tsx`、`src/components/settings/LineMessagingCard.tsx` | 後台串接狀態與權限入口 |
| 現有 LINE Webhook | `supabase/functions/_shared/line-webhook-handler.ts` | Webhook 簽章、店家連線與事件處理基線 |
| 發布環境規範 | `docs/RELEASE_ENVIRONMENTS.md` | staging／production 分離與部署順序 |

當來源衝突時：LINE 官方 API 規格優先於本 PRD 的技術數值；本 PRD 的 Phase 1 範圍優先於自行擴充功能；既有安全與店家隔離規則不可被 UI 便利性覆蓋。

### Do Not Touch

| Path or system | Reason it is off limits |
|---|---|
| `src/pages/booking/BookingPage.tsx` | 圖文選單只建立入口，不應改動 C 端預約主流程 |
| `src/pages/admin/CalendarPage.tsx`、`GanttPage.tsx`、`BookingsPage.tsx` | 與圖文選單無直接關係，且屬業務關鍵敏感頁面 |
| 既有 LINE 預約通知模板與 outbox | 新功能不得改變交易通知內容或發送時機 |
| Production LINE Rich Menu | 未先在 staging 官方帳號實機驗收前不得發布或切換 |
| 現有 LINE Official Account Manager 資源 | Bookr 不得假設可編輯非 Messaging API 建立的選單 |

### Requirement Verification Map

| Requirement | How it is verified | Who verifies |
|---|---|---|
| FR-1–FR-3 | Messaging 未串接、管理員、一般成員及跨店帳號的整合／RLS 測試 | Automated + QA |
| FR-4–FR-7 | 草稿、版本快照、回復與同時發布測試 | Automated + QA |
| FR-8–FR-12 | 1–6 格 fixture 驗證 bounds、圖片限制與預覽座標快照 | Automated + Frontend QA |
| FR-13–FR-19 | 1–3 頁切換圖、Alias payload、動作安全驗證及手機預覽測試 | Automated + QA |
| FR-20–FR-25 | 模擬每個 LINE API 步驟成功／失敗，確認舊版本不受影響與稽核完整 | Automated + Backend QA |
| FR-26–FR-32 | Insights fixture、bounds 對應、低樣本、隔日未完成、冪等與限流測試 | Automated + Product QA |
| FR-33–FR-35 | 狀態顯示、中文錯誤、日誌與重試觀測 | QA + Operations |

### Stop and Escalate

| Condition | Escalate to |
|---|---|
| Phase 1 要改為自由拖拉版型或加入圖片編輯器 | Product Owner |
| 需要保存逐筆點擊者 LINE User ID 或建立個人行為分析 | Product Owner + Privacy/Security Owner |
| 需要接管或刪除 LINE Official Account Manager 建立的選單 | Product Owner + LINE Account Owner |
| LINE API 規格與本 PRD 的圖片、Insights 或 Alias 假設不一致 | Product Owner + Technical Lead |
| 必須修改 C 端預約主流程或交易通知才能完成 | Product Owner |
| Staging 官方帳號無法獨立驗證而需要直接測 production | Product Owner；不得自行部署 |

## Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|---|---|---|---|
| 店家已完成 LINE Messaging API 串接並有有效 Channel Access Token／Secret | 店家管理員 | 已有基礎能力 | 無法建立、驗證或發布 Rich Menu |
| Staging LINE 官方帳號可供實機測試 | Product Owner | 待確認 | 無法驗證分頁切換與手機顯示 |
| LINE Rich Menu 與 Insights API | LINE | 外部依賴 | 發布或數據同步延遲 |
| 私有圖片儲存與後端上傳流程 | Engineering | 待實作 | 無法安全保存草稿圖片 |
| 每日排程與重試機制 | Engineering／Operations | 待實作 | 分析數據無法穩定更新 |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 圖片顯示與點擊 bounds 不一致 | M | H | 同一標準化座標產生預覽與 API payload；版型 fixture 測試 |
| 多頁發布部分成功造成 Alias 指向錯誤 | M | H | 分階段發布、發布鎖、舊版本最後切換、補償清理與回復 |
| 店家誤認 Insights 為即時數據 | H | M | 標示隔日彙整、最後同步時間與未提供原因 |
| 低樣本隱私門檻造成報表空白 | M | M | 顯示「官方未提供／樣本不足」，不以 0 代替 |
| 遠端 Rich Menu 版本累積達上限 | L | H | 保留策略、發布前容量檢查、只刪除確認不再使用的舊資源 |
| 憑證暴露到瀏覽器 | L | H | 所有 LINE 管理 API 僅由 Edge Function 使用 Vault 憑證 |
| 自訂 URL 成為惡意跳轉入口 | M | H | HTTPS allowlist／格式驗證、權限限制與稽核 |
| Webhook 擴充破壞 follow／unfollow | M | H | 事件分派白名單、現有測試保留、postback 獨立測試 |

## Timeline & Milestones

| Milestone | Description | Exit Criteria |
|---|---|---|
| M0：PRD 確認 | 確認 Phase 1 分頁上限、動作類型、數據保存與權限 | Open Questions 已決定 |
| M1：資料與後端基礎 | Migration、RLS、圖片儲存、LINE API client、發布工作狀態 | DB／RLS／API 自動測試通過 |
| M2：預設版型編輯器 | 1–6 格、1–3 頁、圖片上傳、區域動作與預覽 | 所有版型 fixture 與響應式 QA 通過 |
| M3：發布與回復 | Validate、Create、Upload、Alias、Default、失敗復原 | Staging 可發布、切頁、回復且不影響舊版 |
| M4：Insights 分析 | 每日同步、區域對應、分析畫面與資料不足狀態 | Staging 可顯示官方測試數據或正確等待狀態 |
| M5：Staging E2E | 手機 LINE 實機、權限、跨店隔離、錯誤與回復驗證 | `/qc` 通過且 Product Owner 驗收 |
| M6：Production | 依環境規範發布資料庫、Functions、前端並驗證 | Product Owner 明確確認後發布成功 |

## Open Questions

- [ ] Phase 1 分頁上限是否確認為 3 頁，或一開始就需要 6 頁？— Owner: Product Owner
- [ ] 一般成員是否可以查看成效分析，或只有管理員可見？— Owner: Product Owner
- [ ] 自訂 HTTPS 網址是否允許所有網域，還是需由店家維護 allowlist？— Owner: Product Owner + Security Owner
- [ ] 歷史圖文選單圖片與每日 Insights 保留 24 個月是否足夠？— Owner: Product Owner
- [ ] 回復版本時是否保留目前失敗／低成效版本供分析，而不刪除 LINE 遠端資源？— Owner: Product Owner
- [ ] Phase 1 是否需要提供兩種高度（大／小圖文選單），或先固定單一標準高度？— Owner: Product Owner

## Appendix

### Official LINE References

- [Rich menus overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/)
- [Use rich menus](https://developers.line.biz/en/docs/messaging-api/using-rich-menus/)
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/)
- [Actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Play with rich menus](https://developers.line.biz/en/docs/messaging-api/try-rich-menu/)

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-11-06 | Codex | 初版；定義 Phase 1 預設版型、最多 3 頁、發布流程與 Insights 點擊分析 |
