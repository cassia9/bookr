# 設計規範 (Design Guidelines)

本目錄包含系統的設計規範和視覺指南。

## 📚 文檔清單

### 色彩系統
- 主色：Indigo (#4F46E5)
- 次色：Slate (#64748B)
- 背景：White, Gray-50
- 詳見：`AdminLayout.tsx` 組件

### 排版規範
- 標題：text-3xl font-bold (text-slate-900)
- 副標題：text-lg font-semibold
- 正文：text-sm text-slate-600
- 詳見：AdminLayout 和個別頁面實現

### 間距系統
- 邊距：p-4, p-6
- 間隔：gap-3, gap-4
- 詳見：Tailwind CSS utility classes

### 圖標庫
- 使用：lucide-react
- 大小：16-24px 根據上下文
- 顏色：繼承文本顏色

### 互動狀態
```
按鈕：
- 正常：bg-white, border, text-slate-600
- 懸停：bg-slate-50, text-slate-900
- 活躍：bg-indigo-50, text-indigo-700
- 禁用：opacity-50, cursor-not-allowed

輸入框：
- 邊框：border-slate-300
- 焦點：border-indigo-600, ring-2, ring-indigo-100
- 錯誤：border-red-500
```

### 響應式設計
- Desktop: 側邊欄 + 主內容並行
- Tablet: 側邊欄可折疊 (< 1024px)
- Mobile: 全屏垂直堆疊 (< 640px)

---

**參考實現**:
- src/components/layout/AdminLayout.tsx - 主佈局框架
- src/pages/admin/CalendarPage.tsx - 視圖實現示例
- src/components/ui/* - 可復用組件庫

