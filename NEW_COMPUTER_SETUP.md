# 預約系統新電腦接手清單

本文件用於將預約系統開發環境搬到另一台電腦。任何密鑰、Access Token、密碼或正式環境資料都不得提交到 Git。

## 舊電腦離開前

1. 確認 GitHub 上的 `main` 是最新版本，且所有必要分支都已推送。
2. 檢查每個 worktree 的 `git status`，不要遺留未提交的程式碼。
3. 透過密碼管理器或其他加密方式保存 `.env.local` 的值；不要把檔案加入 Git。
4. 確認可以登入下列管理平台：
   - GitHub
   - Supabase Dashboard
   - Cloudflare Dashboard
   - LINE Developers Console
5. 新電腦完整通過本機驗證前，先不要清除舊電腦。

## 必須另外搬移的本機設定

`.env.local` 由 `.gitignore` 排除，GitHub 不會保存它。新電腦須依 `.env.local.example` 重新建立，至少包含：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
ALLOWED_ORIGIN
```

只可在前端使用 Supabase publishable／anon key。`service_role`、secret key、LINE Channel Secret、LINE Channel Access Token、SendGrid API Key 與 Worker Secret 不得放入 `.env.local` 或 Repo。

Supabase Edge Function 的遠端 Secrets 應保留在 Supabase，不需要下載到新電腦；搬家後只需確認帳號有權限管理它們。

## 新電腦安裝

建議先安裝：

- Git 與 GitHub CLI
- Bun（本專案使用 `bun.lock`）
- Docker Desktop（本機 Supabase 與完整資料庫 QA 使用）
- Supabase CLI
- Codex；如仍使用 Claude Code，再安裝 Claude Code

登入必要工具：

```bash
gh auth login
supabase login
```

Cloudflare Pages 目前由 GitHub 部署；只有需要手動操作 Cloudflare 時才需另外登入對應 CLI。

## 取得專案

```bash
cd ~/Documents
git clone https://github.com/cassia9/bookr.git 預約系統
cd 預約系統
git switch main
bun install --frozen-lockfile
cp .env.local.example .env.local
```

接著使用安全保存的值填入 `.env.local`。不要在聊天、截圖、終端輸出或 Git commit 中顯示密鑰。

如需使用 Supabase CLI 操作正式專案，先從 Dashboard 確認正確的 Project Ref，再執行連結；禁止只依記憶選擇專案。

## 本機驗證

```bash
bun run build
bun run lint
bun run dev
```

瀏覽器至少檢查：

- 後台登入與預約管理頁可開啟
- 老師、課程、客戶與設定頁可讀取
- 手機寬度下公開預約流程可完成到送出前
- 不會在 Console 或 Network 回應中出現敏感金鑰

需要驗證 Migration、RLS 或 Edge Functions 時，再啟動 Docker Desktop 與本機 Supabase；不得拿正式資料進行破壞性測試。

## 搬家完成條件

- `git status` 乾淨
- `main` 與 `origin/main` 同步
- Build 與 Lint 通過
- 本機前端可以啟動
- Supabase、GitHub、Cloudflare 與 LINE 管理權限均可使用
- `.env.local` 存在但仍被 Git 忽略
- 舊電腦未遺留只有本機才有的重要 commit 或文件
