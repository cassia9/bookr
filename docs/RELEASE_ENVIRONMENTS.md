# Bookr 發佈環境

## 分支與目標

| 環境 | Git 分支 | Cloudflare Pages | Supabase project ref |
|---|---|---|---|
| 本地 | 功能分支 | 不部署 | 本地 Supabase |
| Staging | `staging` | `bookr-staging` | `zklxeipqxnagcxihpzrp` |
| Production | `main` | `bookr` | `xfdpcjpjpczqyuqzdqmr` |

## 發佈原則

1. 功能分支先合併到 `staging`，只更新 staging 前端與後端。
2. staging 驗收完成後，只有使用者明確確認「部署正式站」才可建立 `staging` 到 `main` 的 PR。
3. staging 發佈不得合併到 `main`，也不得使用 production Supabase project ref。
4. Migration、Edge Function 與前端必須部署到同一個環境，完成後再驗證該環境網址。
5. 不依賴 `supabase/.temp` 判斷目標；該目錄是本機 CLI 狀態，不納入版本控制。

## 發佈前目標檢查

Staging：

```bash
BOOKR_SUPABASE_PROJECT_REF=zklxeipqxnagcxihpzrp \
BOOKR_CLOUDFLARE_PAGES_PROJECT=bookr-staging \
bun run release:check:staging
```

Production 必須另外提供明確確認：

```bash
BOOKR_SUPABASE_PROJECT_REF=xfdpcjpjpczqyuqzdqmr \
BOOKR_CLOUDFLARE_PAGES_PROJECT=bookr \
BOOKR_PRODUCTION_RELEASE=CONFIRMED \
bun run release:check:production
```

檢查通過只代表目標一致，不代表已獲得部署授權。每次正式部署仍需當次明確確認。

## Migration 順序

1. 在本地套用並執行 pgTAP。
2. 套用到 staging，驗證資料庫版本及使用者流程。
3. staging 驗收通過後，才可在 production 執行相同 Migration。
4. production Migration 成功後再更新依賴該欄位或 RPC 的前端與 Edge Function。

這個順序避免新版前端先讀取尚未存在的 production 欄位，將資料庫錯誤誤顯示為空白畫面。
