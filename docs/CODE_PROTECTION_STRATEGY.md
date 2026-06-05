# 代碼保護策略 - 防止再次被誤覆蓋

**制定日期**: 2026-06-04  
**目的**: 防止 AI 執行過程中的代碼覆蓋事件再次發生  
**優先級**: 🔴 Critical - 立即實施  

---

## 📌 核心原則

```
三層防護：
  Layer 1: 預防 (Prevent)    - 防止操作發生
  Layer 2: 檢測 (Detect)     - 及時發現問題
  Layer 3: 恢復 (Recover)    - 快速恢復數據
```

---

## Layer 1: 預防層 🛡️

### 1.1 Git 分支與提交策略

```bash
# 立即實施

# Step 1: 當前代碼立即提交
cd /Users/CL/Documents/預約系統
git add -A
git commit -m "snapshot: Current state before protection strategy - June 4 2026

- CalendarPage: restored month/week/day views
- GanttPage: restored practitioner-based gantt chart
- Member management: invite/register/permission system complete
- Other pages: skeleton status

This is a checkpoint to prevent loss of current work."

# Step 2: 建立分支結構
git branch main
git branch develop
git branch -m master main

# Step 3: 設定分支保護規則（寫入 .git/config）
git config branch.main.protected true
git config branch.develop.merge main

# Step 4: 不同功能使用不同分支
git checkout -b feature/clients-page
git checkout -b feature/services-page
git checkout -b feature/dashboard-analytics
git checkout -b feature/settings-page
git checkout -b bugfix/member-management

# 回到 develop
git checkout develop
```

### 1.2 工作目錄隔離

```bash
# 為 AI 執行創建隔離環境

# 方案 A: 使用 Git Worktree（推薦）
cd /Users/CL/Documents/預約系統
git worktree list
git worktree add ../booking-system-ai-workspace develop

# 現在 Claude 在這個隔離目錄中工作：
/Users/CL/Documents/booking-system-ai-workspace/

# 優點：
# ✅ 與主工作目錄完全隔離
# ✅ 可以同時在不同分支上工作
# ✅ 改動不會影響主目錄
```

### 1.3 文件操作規範（AI 执行規則）

```markdown
# Claude Code 嚴格執行規則

## Rule 1: 只在 worktree 中修改代碼

❌ 禁止: 直接修改 /Users/CL/Documents/預約系統/ 中的文件
✅ 允許: 在 /Users/CL/Documents/booking-system-ai-workspace/ 中修改

## Rule 2: 批量操作前必須 commit

❌ 禁止: 同時修改 6 個或以上的文件而不提交
✅ 允許: 修改 1-3 個相關文件，立即提交

提交頻率:
  ├─ 實現一個 User Story → 1 次提交
  ├─ 修復一個 bug → 1 次提交
  ├─ 完成單元測試 → 1 次提交
  └─ 預期: 2-4 小時 1 次提交

## Rule 3: 生成代碼時使用 Preview

❌ 禁止: 直接 Write 大量代碼（超過 500 行）
✅ 允許: 先生成代碼片段，用戶確認後才寫入

## Rule 4: 每次操作前確認

❌ 禁止: 自動替換或覆蓋現有文件
✅ 允許: 
  1. 讀取現有文件
  2. 告訴用戶計劃的改動
  3. 等待用戶確認
  4. 執行操作

## Rule 5: 敏感文件保護

敏感文件（保護列表）:
  - src/pages/admin/CalendarPage.tsx
  - src/pages/admin/GanttPage.tsx
  - src/pages/admin/BookingsPage.tsx
  - src/pages/admin/PractitionersPage.tsx
  - src/pages/booking/BookingPage.tsx
  - supabase/migrations/*
  - .env.local

保護措施:
  ✅ 編輯前必須 Read
  ✅ 改動必須經過 User 確認
  ✅ 備份原始版本在註解中
```

---

## Layer 2: 檢測層 🔍

### 2.1 自動檢查 Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash

echo "🔍 Running pre-commit checks..."

# 檢查 1: 是否有骨架代碼
echo "Checking for skeleton code..."
skeleton_count=$(git diff --cached | grep -c "開發中\|in progress" || true)
if [ $skeleton_count -gt 0 ]; then
    echo "❌ FAILED: Skeleton code detected in staged changes"
    exit 1
fi

# 檢查 2: 是否有敏感信息洩露
echo "Checking for secrets..."
if git diff --cached | grep -E "SUPABASE_KEY|API_KEY|password|secret"; then
    echo "❌ FAILED: Potential secrets detected"
    exit 1
fi

# 檢查 3: 文件大小異常
echo "Checking file sizes..."
git diff --cached --stat | while read line; do
    file=$(echo $line | awk '{print $1}')
    if [[ "$file" == "src/pages/"* ]] && [[ $line == *"| 0"* ]]; then
        echo "⚠️  WARNING: Zero-byte file: $file"
    fi
done

# 檢查 4: TypeScript 類型檢查
echo "Running TypeScript check..."
npx tsc --noEmit 2>/dev/null || echo "⚠️  TypeScript errors (non-blocking)"

echo "✅ Pre-commit checks passed"
exit 0

# 設定執行權限
chmod +x .git/hooks/pre-commit
```

### 2.2 自動化警告系統

```bash
# .claude/auto-checks.sh
#!/bin/bash

# 每次執行後檢查

PROJECT_DIR="/Users/CL/Documents/預約系統"
THRESHOLD_FILES=5  # 一次最多改 5 個文件
THRESHOLD_TIME=30  # 一次最多改 30 分鐘

echo "📊 Automatic Safety Check"
echo "=========================="

# 檢查修改的文件數
CHANGED=$(git status --porcelain | wc -l)
if [ $CHANGED -gt $THRESHOLD_FILES ]; then
    echo "⚠️  WARNING: $CHANGED files changed (threshold: $THRESHOLD_FILES)"
    echo "Please commit before making more changes"
    echo ""
    git status --porcelain
    exit 1
fi

# 檢查是否有大量刪除
DELETED=$(git status --porcelain | grep "^.D" | wc -l)
if [ $DELETED -gt 3 ]; then
    echo "🚨 ALERT: $DELETED files deleted!"
    echo "Please confirm this is intentional"
    git status --porcelain | grep "^.D"
    exit 1
fi

# 檢查頁面文件是否被清空
for page in "CalendarPage" "GanttPage" "BookingsPage" "PractitionersPage"; do
    file="src/pages/admin/${page}.tsx"
    if [ -f "$file" ]; then
        size=$(wc -c < "$file")
        if [ $size -lt 500 ]; then
            echo "🚨 CRITICAL: $file is suspiciously small ($size bytes)"
            exit 1
        fi
    fi
done

echo "✅ All safety checks passed"
```

### 2.3 實時監控

```bash
# 在開發伺服器運行時監控文件變化
# package.json 添加：

{
  "scripts": {
    "dev": "concurrently \"vite\" \"npm run monitor:files\"",
    "monitor:files": "nodemon --watch src --exec 'npm run check:integrity' --ext tsx,ts",
    "check:integrity": "node scripts/check-file-integrity.js"
  }
}

# scripts/check-file-integrity.js
const fs = require('fs');

const criticalFiles = [
  'src/pages/admin/CalendarPage.tsx',
  'src/pages/admin/GanttPage.tsx',
];

function checkIntegrity() {
  criticalFiles.forEach(file => {
    const stat = fs.statSync(file);
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    
    if (lines < 20) {
      console.error(`❌ ALERT: ${file} has only ${lines} lines!`);
      process.exit(1);
    }
  });
}

checkIntegrity();
```

---

## Layer 3: 恢復層 🔄

### 3.1 自動備份

```bash
# 在 worktree 中每天備份

# .github/workflows/daily-backup.yml (如果使用 GitHub)
name: Daily Backup

on:
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨 2 點

jobs:
  backup:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Create daily backup
        run: |
          BACKUP_DIR="backups/$(date +%Y-%m-%d)"
          mkdir -p $BACKUP_DIR
          cp -r src $BACKUP_DIR/
          cp -r supabase $BACKUP_DIR/
          git add backups/
          git commit -m "Daily backup: $(date)"

# 本地備份腳本
# backup.sh
#!/bin/bash
BACKUP_DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="backups/backup_$BACKUP_DATE"

mkdir -p "$BACKUP_DIR"
cp -r src "$BACKUP_DIR/"
cp -r supabase "$BACKUP_DIR/"

git add "$BACKUP_DIR"
git commit -m "Manual backup: $BACKUP_DATE"

echo "✅ Backup created: $BACKUP_DIR"
```

### 3.2 快速恢復命令

```bash
# 如果文件被誤覆蓋，快速恢復

# 方案 1: 恢復單個文件到上一個提交
git checkout HEAD~1 -- src/pages/admin/CalendarPage.tsx

# 方案 2: 恢復整個目錄
git checkout HEAD -- src/pages/admin/

# 方案 3: 查看文件歷史並恢復到特定版本
git log --oneline src/pages/admin/CalendarPage.tsx
git show <commit>:src/pages/admin/CalendarPage.tsx > CalendarPage.tsx.backup

# 方案 4: 使用 git reflog（最後的防線）
git reflog
git reset --hard <commit>
```

---

## 🎯 立即實施清單

### 今天（現在）

- [ ] **提交當前代碼**
  ```bash
  cd /Users/CL/Documents/預約系統
  git add -A
  git commit -m "checkpoint: before protection strategy"
  ```

- [ ] **創建 worktree**
  ```bash
  git worktree add ../booking-system-ai-workspace develop
  ```

- [ ] **設定 pre-commit hook**
  ```bash
  cat > .git/hooks/pre-commit << 'EOF'
  #!/bin/bash
  # (內容見上方)
  EOF
  chmod +x .git/hooks/pre-commit
  ```

### 本週

- [ ] **建立分支保護規則** - GitHub Settings（如果使用遠端）
- [ ] **設定自動備份** - cron 任務或 GitHub Actions
- [ ] **添加 package.json 檢查腳本**
- [ ] **更新開發文檔**（`.claude/CLAUDE.md`）

### 下週

- [ ] **配置 Supabase 備份** - 自動每日備份
- [ ] **測試恢復流程** - 模擬故障並恢復
- [ ] **團隊培訓** - 確保所有開發者遵守規則

---

## 📋 修改 `.claude/claude.md`（開發指南）

```markdown
# 重要安全規則

## AI 執行規則 (必須遵守)

### Rule 1: 工作目錄隔離
- 所有代碼修改必須在 worktree 中進行
- 主目錄 `/Users/CL/Documents/預約系統/` 受保護

### Rule 2: 提交頻率
- 不連續修改超過 5 個文件
- 每個 User Story 完成後必須 commit
- 提交信息必須清晰說明改動內容

### Rule 3: 敏感文件保護
- 編輯前必須 git status 確認
- 改動超過 50 行必須用戶確認
- 批量刪除必須警告用戶

### Rule 4: 檢查點
- 每天開始工作：git status 檢查
- 每次暫停：git commit 保存進度
- 每週五：git log 審視本週改動

### Rule 5: 災難恢復
- 如果發現代碼被誤覆蓋：
  1. 立即停止所有操作
  2. 執行 `git reflog` 查看歷史
  3. 執行 `git reset --hard <commit>`
  4. 或恢復到上一個 worktree
```

---

## 💡 預期效果

實施後的保護效果：

| 風險 | 原始狀態 | 防護後 |
|------|---------|--------|
| 一次性覆蓋多個文件 | ❌ 無防護 | ✅ pre-commit hook 阻止 |
| 代碼丟失無法恢復 | ❌ 無備份 | ✅ 每次提交自動備份 |
| 不知道誰改了什麼 | ❌ 無記錄 | ✅ Git 完整歷史 + 提交信息 |
| 骨架代碼混入生產 | ❌ 無檢測 | ✅ 自動檢查 + CI/CD |
| 無法快速恢復 | ❌ 難恢復 | ✅ 一條命令恢復 |

---

## 🚨 如果還是發生了怎麼辦？

```bash
# Step 1: 確認損失範圍
git status
git diff

# Step 2: 不要 commit！直接恢復
git checkout -- .          # 恢復所有本地改動
git clean -fd             # 刪除新增文件

# Step 3: 從最近的提交恢復
git log --oneline | head -5
git reset --hard <safe-commit>

# Step 4: 檢查 worktree 狀態
git worktree list
git worktree prune

# Step 5: 通知用戶（如果是 AI 執行）
# 發送警告郵件或日誌
```

---

**下一步**: 你準備好立即實施這個防護策略嗎？我現在就可以：

1. ✅ 執行所有設定（5 分鐘）
2. ✅ 測試恢復流程（10 分鐘）
3. ✅ 更新開發文檔（5 分鐘）

**總計**: 約 20 分鐘，永久防護你的代碼。
