# 預約管理系統 - 行事曆 & 甘特圖設計規範 v1.0

**完成日期**: 2026-06-05  
**風格**: 現代 SaaS（Calendly、Linear、Notion 風格）  
**應用範圍**: CalendarPage + GanttPage 組件

---

## 📋 設計系統概覽

### 核心設計理念

```
簡約專業 + 功能至上
清晰的時間軸階層
視覺化時間占用率
實時交互反饋
```

---

## 🎨 配色系統 (按預約狀態)

### 預約狀態色彩

| 狀態 | 色號 | CSS 類別 | 用途 | 淺色背景 |
|------|------|---------|------|---------|
| **已確認** | #34C759 | `text-success` / `bg-success` | 已確定的預約 | `bg-success-light` |
| **待確認** | #FF9500 | `text-warning` / `bg-warning` | 需要確認的預約 | `bg-warning-light` |
| **已完成** | #0084FF | `text-info` / `bg-info` | 已完成的課程 | `bg-info-light` |
| **已取消** | #E8E8E8 | `text-slate-400` | 已取消的預約 | `bg-slate-100` |

### 從業人員識別色 (已有系統)

- 每位從業人員有唯一的 `color_hex`，用於甘特圖和行事曆行
- 色塊在甘特圖中顯示為事件區塊的邊框或背景

---

## 📐 行事曆視圖 (Calendar)

### 1. 月視圖 (Month View)

#### 網格結構
```
┌─────────────┬─────────────┬─────────────┐
│   6月1日    │   6月2日    │   6月3日    │
│  (已確認)   │  (待確認)   │   空        │
│  2 個預約   │  1 個預約   │             │
└─────────────┴─────────────┴─────────────┘
```

#### 樣式規範

**日期格子容器：**
```jsx
// 基礎格子
"bg-white border border-slate-200 rounded-lg p-3 min-h-24 hover:shadow-md transition-shadow cursor-pointer"

// Hover 狀態
"shadow-md border-slate-300"

// 選中狀態
"bg-slate-50 border-2 border-black"
```

**日期標題：**
```jsx
// 格式: "1" (只顯示日期)
"text-sm font-semibold text-text-primary mb-2"
```

**預約卡片 (在月視圖中縮小顯示)：**
```jsx
// 卡片樣式（堆疊在格子內）
"text-xs px-2 py-1 rounded-md font-medium truncate mb-1"

// 已確認狀態
"bg-success-light text-success border-l-2 border-success"

// 待確認狀態
"bg-warning-light text-warning border-l-2 border-warning"

// 已完成狀態
"bg-info-light text-info border-l-2 border-info"

// 已取消狀態
"bg-slate-100 text-slate-400 border-l-2 border-slate-300"
```

**計數器 (當預約 > 3 時):**
```jsx
// "+2 more" 提示
"text-xs text-text-secondary mt-1 px-2"
```

---

### 2. 週視圖 (Week View)

#### 時間軸結構
```
時間    │ 5/31   │  6/1   │  6/2   │  6/3  │  6/4  │  6/5  │  6/6
─────────┼────────┼────────┼────────┼───────┼───────┼───────┼──────
9:00    │        │ [按摩]  │        │ [伸展] │       │       │
10:00   │[伸展]  │ [伸展]  │ [按摩]  │       │ [美容]│[伸展] │
11:00   │        │ [美容]  │        │ [按摩]│       │       │
```

#### 樣式規範

**時間軸頭部：**
```jsx
// 日期標題
"sticky top-0 bg-white border-b border-slate-200 px-4 py-3"
"text-sm font-semibold text-text-primary"

// 日期副標題 (星期)
"text-xs text-text-secondary"
```

**時間標籤：**
```jsx
// 左側時間列
"text-xs text-text-secondary text-right pr-4 py-2 sticky left-0 bg-white"
"border-r border-slate-200"
```

**時間網格：**
```jsx
// 背景網格線
"border-b border-slate-100"

// 時間格 (高度 80px 用於視覺重量)
"min-h-20 border-r border-slate-100"

// 現在時間指示線 (深紅色，高度 2px)
"h-0.5 bg-danger absolute w-full z-10"
"mt-[當前時間百分比]"
```

**事件卡片 (週視圖詳細版)：**
```jsx
// 絕對定位容器，填滿時間格
"absolute bg-white border-2 rounded-md px-3 py-2 shadow-sm hover:shadow-md transition-shadow"

// 狀態色邊框
"border-l-4" // border-success / border-warning / border-info / border-slate-300

// 事件內容
"text-xs font-medium text-text-primary truncate"
"text-xs text-text-secondary mt-1 truncate" // 客戶名稱
```

---

### 3. 日視圖 (Day View)

#### 時間軸結構 (全天細節)
```
時間    │ 6月5日（週五）
─────────┼──────────────────────────────
9:00    │ [王太太 - 伸展 30分] 
        │ [李先生 - 按摩 60分]
─────────┤──────────────────────────────
10:00   │ (空)
─────────┤──────────────────────────────
11:00   │ [張小姐 - 美容 45分]
```

#### 樣式規範

**日期標題：**
```jsx
// 大標題 "2026年6月5日 (週五)"
"text-2xl font-bold text-text-primary mb-6"
```

**時間標籤：**
```jsx
// 更大的時間文字
"text-sm font-semibold text-text-primary"
```

**事件卡片 (日視圖詳細版)：**
```jsx
// 整列寬度的卡片
"w-full bg-white rounded-lg border-2 p-4 mb-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"

// 事件標題
"font-semibold text-text-primary text-base"

// 事件詳細
"text-sm text-text-secondary mt-1"
"客戶: 王太太 | 課程: 伸展 | 30分鐘"

// 時間範圍
"text-xs text-text-secondary mt-2"
"09:00 - 09:30"

// 進度條 (如果在進行中)
"mt-2 h-1 bg-slate-100 rounded-full overflow-hidden"
"<div className='h-full bg-success' style={{width: '65%'}} />"
```

---

## 📊 甘特圖視圖 (Gantt Chart)

### 佈局結構

```
┌─────────────────────────────────────────────────────────────────┐
│ 從業人員列表  │        時間軸 (橫軸: 時間)                      │
├─────────────────┼────────────────────────────────────────────────┤
│ 王老師 (綠)     │ [伸展30m] [按摩60m]                [伸展45m]   │
│ 李老師 (藍)     │         [美容45m] [按摩90m]                    │
│ 張老師 (紅)     │ [伸展30m]              [美容60m]               │
└─────────────────┴────────────────────────────────────────────────┘
```

### 樣式規範

**左側面板 (從業人員列表)：**
```jsx
// 容器
"sticky left-0 w-48 bg-white border-r border-slate-200 overflow-y-auto"

// 面板標題
"px-4 py-3 border-b border-slate-200 font-semibold text-text-primary text-sm"

// 從業人員行
"px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"

// 人員名稱 + 識別色
"text-sm font-medium text-text-primary"
"<span className='inline-block w-3 h-3 rounded-full mr-2' style={{backgroundColor: practitioner.color_hex}} />"
"王老師"
```

**右側時間軸 (橫向滾動)：**
```jsx
// 容器
"flex-1 overflow-x-auto overflow-y-hidden relative"

// 時間標籤行 (sticky)
"sticky top-0 bg-white border-b border-slate-200 flex z-20"

// 時間刻度 (每小時)
"text-xs text-text-secondary text-center py-2"
"border-r border-slate-100 min-w-24"

// 背景網格 (時間列)
"absolute h-full w-full border-r border-slate-100"
```

**事件區塊 (甘特圖項目)：**
```jsx
// 容器 (相對定位，使用 left/width 控制位置)
"absolute bg-white border-2 rounded-md px-2 py-1 h-12 shadow-sm hover:shadow-md transition-shadow cursor-pointer"

// 邊框色 (使用從業人員的 color_hex)
"border-l-4 border-t-0 border-r-0 border-b-0"
"style={{borderLeftColor: practitioner.color_hex}}"

// 事件文字
"text-xs font-semibold text-text-primary truncate"
"text-xs text-text-secondary" // 課程名稱
```

**拖動功能 (進階)：**
```jsx
// Drag over 狀態
"bg-blue-50 shadow-lg border-l-blue-500"

// Drop zone 提示
"border-2 border-dashed border-slate-300"
```

---

## 🎯 共享組件設計

### 1. 時間選擇器

#### 快速導航按鈕
```jsx
// 上一個/下一個按鈕
"p-2 hover:bg-slate-100 rounded-lg transition text-text-secondary hover:text-text-primary"
"<ChevronLeft className='w-5 h-5' />"

// 「今天」按鈕
"px-4 py-2 bg-black text-white rounded-lg hover:bg-primary-hover shadow-md hover:shadow-lg transition font-medium text-sm"
```

#### 日期顯示
```jsx
// 日期範圍顯示
"text-center min-w-48"
"<p className='text-lg font-semibold text-text-primary'>2026/06/05（週五）</p>"
```

### 2. 視圖切換按鈕組

```jsx
// 按鈕組容器 (for Calendar: month/week/day; for Gantt: day/week)
"flex items-center bg-surface-secondary rounded-lg p-1 gap-1"

// 單一按鈕
"px-3 py-1.5 text-sm font-medium rounded-md transition-colors"

// 選中狀態
"bg-black text-white shadow-sm"

// 非選中狀態
"text-text-secondary hover:text-text-primary hover:bg-white"
```

### 3. 篩選器

#### 從業人員篩選
```jsx
// 篩選標籤
"inline-flex items-center bg-slate-100 text-text-secondary text-xs font-medium px-3 py-1 rounded-full gap-2"

// 移除按鈕
"hover:text-text-primary cursor-pointer"
"<X className='w-3 h-3' />"
```

#### 狀態篩選
```jsx
// 篩選按鈕
"text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 transition"

// 選中狀態
"bg-black text-white border-black"

// 狀態選項: 全部 / 已確認 / 待確認 / 已完成
```

### 4. 事件卡片 (快速預覽)

```jsx
// 點擊事件後的側邊抽屜內容
"<div className='bg-white rounded-lg border border-slate-200 p-4 shadow-sm'>"

// 狀態標籤 + 課程名稱
"<div className='flex items-center gap-2 mb-3'>"
"<span className='inline-block px-2 py-1 bg-success-light text-success text-xs font-semibold rounded'>"
"已確認"
"</span>"
"<h3 className='text-lg font-semibold text-text-primary'>伸展課程</h3>"

// 詳細信息列表
"<div className='space-y-2 text-sm'>"
"<p><span className='text-text-secondary'>客戶:</span> <span className='text-text-primary font-medium'>王太太</span></p>"
"<p><span className='text-text-secondary'>時間:</span> <span className='text-text-primary font-medium'>09:00 - 09:30</span></p>"
"<p><span className='text-text-secondary'>從業人員:</span> <span className='text-text-primary font-medium'>李老師</span></p>"
"<p><span className='text-text-secondary'>備註:</span> <span className='text-text-primary'>客戶首次來訪</span></p>"
```

---

## ✨ 交互 & 動畫規範

### 1. 懸停效果 (Hover)

| 元素 | 效果 | 時間 | 代碼 |
|------|------|------|------|
| 日期格子 | 陰影升高 | 200ms | `shadow-md border-slate-300` |
| 事件卡片 | 陰影升高 + 游標變手 | 150ms | `shadow-md cursor-pointer` |
| 按鈕 | 背景變化 + 陰影 | 150ms | `hover:bg-primary-hover shadow-lg` |
| 篩選標籤 | 背景變淺 | 150ms | `opacity-80` |

### 2. 按下效果 (Active)

```jsx
// 事件卡片點擊
"scale-95 shadow-lg" // 150ms ease-out

// 按鈕點擊
"scale-95" // 100ms ease-out 然後回復
```

### 3. 過場動畫

**月視圖 → 週視圖：**
```jsx
// 淡入
opacity: 0 → 1 (200ms ease-out)
```

**事件卡片展開：**
```jsx
// 縮放 + 淡入
scale: 0.95 → 1 (250ms ease-out)
opacity: 0 → 1 (250ms ease-out)
```

### 4. 加載狀態

```jsx
// 骨架屏 (skeleton)
"<div className='bg-slate-200 rounded-lg animate-pulse h-20 mb-2' />"

// 進度條
"<div className='h-1 bg-slate-100 rounded-full overflow-hidden'>"
"<div className='h-full bg-black animate-pulse' style={{width: '45%'}} />"
```

---

## 📱 響應式設計

### 斷點

| 寬度 | 設備 | 行事曆 | 甘特圖 |
|------|------|--------|--------|
| < 640px | 手機 | 日視圖 (default) | 日視圖 |
| 640-1024px | 平板 | 週視圖 (default) | 週視圖 |
| ≥ 1024px | 桌機 | 月視圖 (default) | 週視圖 |

### 手機優化

```jsx
// 隱藏細節，顯示精簡視圖
"隱藏次文本: text-xs text-text-secondary"
"簡化課程名稱: truncate"
"簡化時間顯示: 09:00 而非 09:00 - 09:30"

// 較大的觸摸目標
"最小 h-16 對於每個事件卡片"
```

---

## 🎭 深色模式 (Future)

### 配色適配

| 元素 | 淺色 | 深色 | 備註 |
|------|------|------|------|
| 背景 | #F9F9F9 | #1A1A1A | 使用 CSS variable |
| 卡片 | #FFFFFF | #262626 | 使用 CSS variable |
| 邊框 | #E8E8E8 | #404040 | 使用 CSS variable |
| 主文本 | #424245 | #F0F0F0 | 使用 CSS variable |
| 次文本 | #8A8A8E | #A0A0A0 | 使用 CSS variable |

---

## 🔧 Tailwind CSS 實現指南

### 常用類別組合

#### 日期格子 (月視圖)
```jsx
className="bg-white border border-slate-200 rounded-lg p-3 min-h-24 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
```

#### 事件卡片 (所有視圖)
```jsx
className={cn(
  "bg-white rounded-md px-3 py-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer",
  "border-l-4 truncate",
  status === 'confirmed' ? 'border-l-success bg-success-light text-success' :
  status === 'pending' ? 'border-l-warning bg-warning-light text-warning' :
  status === 'completed' ? 'border-l-info bg-info-light text-info' :
  'border-l-slate-300 bg-slate-100 text-slate-400'
)}
```

#### 按鈕組 (視圖切換)
```jsx
className={cn(
  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
  isActive 
    ? 'bg-black text-white shadow-sm' 
    : 'text-text-secondary hover:text-text-primary hover:bg-white'
)}
```

#### 時間標籤
```jsx
className="text-xs font-semibold text-text-primary py-2 px-4 border-r border-slate-100"
```

---

## ✅ QA 清單

在實裝前檢查：

- [ ] 所有預約狀態顏色對比度 ≥ 4.5:1
- [ ] 月視圖 3+ 預約時顯示「+2 more」而非堆疊
- [ ] 週視圖現在時間線 (紅線) 正確定位
- [ ] 甘特圖事件可拖動或點擊展開詳情
- [ ] 所有視圖都有「回到今天」按鈕
- [ ] 手機上自動切換到日視圖
- [ ] 懸停效果延遲 ≤ 150ms
- [ ] 加載狀態使用骨架屏
- [ ] 空狀態有清晰提示
- [ ] 點擊事件卡片可查看詳情

---

## 📚 參考設計產品

- **Calendly** - 簡潔月/週視圖
- **Linear** - 現代 SaaS 交互
- **Notion** - 彈性網格設計
- **Google Calendar** - 標準時間軸

---

**最後更新**: 2026-06-05  
**版本**: 1.0  
**維護者**: Design System Team
