# 預約系統文檔庫

本目錄包含所有項目文檔，便於查找和版本管理。

## 📂 目錄結構

### specifications/ - 功能規格文檔
- `PRD_BOOKING_MANAGEMENT_UNIFIED.md` - 統一預約管理系統 PRD (最新)
- `PRD_MEMBER_MANAGEMENT.md` - 成員管理系統 PRD

### design-guidelines/ - 設計規範
- (待補充)

### incident-reports/ - 事件報告
- `INCIDENT_ANALYSIS_CalendarGantt_Regression.md` - 2026-06-04 代碼丟失事件分析

### api-documentation/ - API 文檔
- `SENDGRID_SETUP.md` - SendGrid 郵件 API 配置

### 根目錄文檔
- `CODE_PROTECTION_STRATEGY.md` - 三層代碼保護策略
- `SECURITY_REVIEW.md` - 安全審查報告
- `SECURITY_IMPROVEMENT_PLAN.md` - 安全改善計劃

## 🔍 快速查找

### 我想了解 X 功能
- 👉 查看 `specifications/` 中的對應 PRD

### 系統被誤改了，我想恢復
- 👉 查看 `CODE_PROTECTION_STRATEGY.md` 的恢復命令部分
- 👉 查看 `incident-reports/` 了解發生過的問題

### 我想配置郵件服務
- 👉 查看 `api-documentation/SENDGRID_SETUP.md`

### 我想增強系統安全性
- 👉 查看 `SECURITY_REVIEW.md` 和 `SECURITY_IMPROVEMENT_PLAN.md`

## 📝 文檔維護規則

1. **每次提交 PRD 時**：同時提交到 `specifications/`
2. **每次出現事件時**：新增報告到 `incident-reports/`
3. **每次配置新服務時**：記錄到 `api-documentation/`
4. **修改此 README 時**：同時更新目錄索引

## ✅ 備份和恢復

所有文檔都受 Git 版本控制：
```bash
# 查看文檔歷史
git log --oneline docs/

# 恢復特定文檔到某個版本
git checkout <commit> -- docs/specifications/PRD_BOOKING_MANAGEMENT_UNIFIED.md

# 查看檔案的全部版本
git log -p docs/specifications/PRD_BOOKING_MANAGEMENT_UNIFIED.md
```

每日備份：`backups/` 目錄

---

**最後更新**: 2026-06-04
