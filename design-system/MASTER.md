# 預約管理系統 - 設計系統 MASTER

**版本**: 1.0  
**生成日期**: 2026-06-05  
**Stack**: React + Vite + Tailwind CSS  

---

## 🎨 設計系統概述

### 產品類型
- **分類**: Service Booking Admin Dashboard + Practitioner Management
- **風格**: Data-Dense Dashboard (最大化操作效率)
- **模式**: Minimal Single Column (清潔聚焦)

### 核心哲學
- ✅ 數據可見性優先（最大化 KPI 卡、表格、圖表）
- ✅ 最小化視覺干擾（無多餘裝飾）
- ✅ 快速操作流程（一鍵完成常見任務）
- ✅ 清晰的狀態指示（顏色 + 圖標 + 文本）

---

## 🎭 色彩系統

### 核心調色盤
```
主色: #0F172A (Slate-900) - 深專業感
背景: #020617 (Slate-950) - 深色背景
前景: #F8FAFC (Slate-50) - 高對比度白
```

### 語義色彩
| 用途 | 顏色 | Hex | Tailwind | 用例 |
|------|------|-----|----------|------|
| **主要操作** | 綠色 | `#22C55E` | `bg-green-500` | CTA 按鈕、確認 |
| **次要操作** | 藍色 | `#3B82F6` | `bg-blue-500` | 編輯、輔助操作 |
| **危險操作** | 紅色 | `#EF4444` | `bg-red-500` | 刪除、取消、警告 |
| **禁用狀態** | 灰色 | `#6B7280` | `bg-gray-500` | 禁用按鈕、不可用 |
| **成功狀態** | 綠色 | `#10B981` | `bg-emerald-500` | 完課、確認完成 |
| **待處理** | 黃色 | `#F59E0B` | `bg-amber-500` | 待確認、待辦 |
| **邊界線** | 深灰 | `#334155` | `border-slate-700` | 分隔線、邊框 |
| **背景次層** | 暗灰 | `#1E293B` | `bg-slate-800` | 卡片、容器背景 |

### 老師識別色彩
預設 8 種顏色供老師選擇，用於日曆和甘特圖視覺化：

```javascript
const PRACTITIONER_COLORS = [
  { name: '紫色', hex: '#9333EA', tailwind: 'bg-purple-600' },
  { name: '藍色', hex: '#3B82F6', tailwind: 'bg-blue-500' },
  { name: '綠色', hex: '#22C55E', tailwind: 'bg-green-500' },
  { name: '紅色', hex: '#EF4444', tailwind: 'bg-red-500' },
  { name: '橙色', hex: '#F97316', tailwind: 'bg-orange-500' },
  { name: '粉色', hex: '#EC4899', tailwind: 'bg-pink-500' },
  { name: '青色', hex: '#06B6D4', tailwind: 'bg-cyan-500' },
  { name: '靛色', hex: '#6366F1', tailwind: 'bg-indigo-500' },
]
```

---

## 🔤 排版系統

### 字型
- **標題 (Headings)**: Fira Code, 600-700 weight
- **正文 (Body)**: Fira Sans, 400 weight
- **標籤 (Labels)**: Fira Sans, 500 weight
- **代碼 (Code)**: Fira Code, 400 weight

### 文字比例
```
h1: 32px / 1.2 (頁面標題)
h2: 24px / 1.3 (區段標題)
h3: 20px / 1.4 (子標題)
body: 16px / 1.5 (正文)
small: 14px / 1.5 (輔助文本)
label: 12px / 1.4 (表單標籤)
```

### 對比度要求
- **正文 vs 背景**: ≥ 4.5:1 (WCAG AA)
- **次要文本 vs 背景**: ≥ 3:1
- **互動元素**: ≥ 4.5:1

---

## 🎛️ 間距與佈局

### 間距系統 (4dp 基準)
```
xs: 4px   (緊湊間距)
sm: 8px   (按鈕內邊距、小間隙)
md: 12px  (卡片間距)
lg: 16px  (區段間距)
xl: 24px  (主要間距)
2xl: 32px (大區段間隔)
3xl: 48px (版面間隔)
```

### 容器寬度
```
phone (375px):     w-full
tablet (768px):    max-w-2xl
desktop (1024px):  max-w-4xl
wide (1440px):     max-w-6xl
```

### 柵欄 (Gutter)
```
phone:   px-4 (16px 邊距)
tablet:  px-6 (24px 邊距)
desktop: px-8 (32px 邊距)
```

---

## 🔘 互動元素

### 按鈕規格

#### 主要按鈕 (Primary CTA)
```
大小: h-10 px-6 (40px 高)
背景: bg-green-500
文本: text-white font-semibold
圓角: rounded-lg
邊界: 無
陰影: shadow-sm hover:shadow-md
狀態:
  - 正常: bg-green-500
  - Hover: bg-green-600 (亮度 -10%)
  - 按下: scale-95 (視覺反饋)
  - 禁用: bg-gray-500 opacity-50 cursor-not-allowed
```

#### 次要按鈕 (Secondary)
```
大小: h-10 px-4
背景: bg-slate-800
邊界: border border-slate-700
文本: text-slate-50 font-medium
圓角: rounded-lg
狀態:
  - Hover: bg-slate-700 border-slate-600
  - 按下: scale-95
```

#### 危險按鈕 (Destructive)
```
顏色: bg-red-600
Hover: bg-red-700
```

### 觸摸目標
- **最小尺寸**: 44×44px (iOS), 48×48dp (Android)
- **最小間距**: 8px (相鄰觸摸目標之間)
- **實現**: 若圖標 < 44px，用 `p-2` 或 `hitSlop` 擴展

### 互動狀態反饋
```
Hover:     150ms ease-out (略微亮度提升、陰影增加)
Focus:     2-4px focus ring (blue-500 或 green-500)
按下:      transform scale-95 + opacity-90
禁用:      opacity-50 + cursor-not-allowed + no hover
```

### 動畫計時
- **微互動** (按鈕、狀態變化): 150-250ms
- **轉場** (頁面、彈窗): 200-300ms
- **複雜動畫**: ≤ 400ms
- **曲線**: `ease-out` (進入), `ease-in` (離開)

### 無障礙要求
- ✅ 所有互動元素可鍵盤聚焦
- ✅ Tab 順序與視覺順序一致
- ✅ Focus ring 在所有狀態下可見
- ✅ 尊重 `prefers-reduced-motion` (禁用/簡化動畫)

---

## 📋 表單設計

### 輸入框
```
高度: h-10 (40px)
邊框: border border-slate-700
背景: bg-slate-900
文本: text-slate-50
圓角: rounded-lg
焦點: ring-2 ring-green-500 (或品牌色)
佔位符: text-slate-500 italic
```

### 標籤與提示
```
標籤:   block text-sm font-medium text-slate-50 mb-2
提示:   text-xs text-slate-400 mt-1 (助性文本)
錯誤:   text-xs text-red-500 mt-1 (立即在欄位下方)
必填:   添加紅色星號 (*) 在標籤後
```

### 驗證狀態
```
正常: border-slate-700 bg-slate-900
焦點: ring-2 ring-green-500 border-green-500
有效: border-green-500 (可選)
無效: border-red-500 ring-2 ring-red-500/50
禁用: bg-slate-800 opacity-50 cursor-not-allowed
```

### 多選框 / 單選框
```
大小: 20×20px
邊框: 2px border-slate-700
選中: bg-green-500 border-green-500
焦點: ring-2 ring-green-500/50
```

---

## 🎨 卡片 & 容器

### 標準卡片
```
背景: bg-slate-800 (次層背景)
邊框: border border-slate-700
圓角: rounded-lg
邊距: p-4 (16px 內邊距)
陰影: shadow-sm
懸停: shadow-md border-slate-600 (可選)
```

### 狀態指示卡片
```
成功: bg-green-900/30 border-green-700/50 text-green-50
警告: bg-amber-900/30 border-amber-700/50 text-amber-50
錯誤: bg-red-900/30 border-red-700/50 text-red-50
資訊: bg-blue-900/30 border-blue-700/50 text-blue-50
```

---

## 🗂️ 導航 & 佈局

### 側邊欄 (Sidebar)
```
寬度: w-60 (240px)
背景: bg-slate-900 border-r border-slate-800
位置: 固定左側或可摺疊
```

### 頂部欄 (Header)
```
高度: h-16 (64px)
背景: bg-white (淺色) 或 bg-slate-900 (深色)
邊框: border-b border-slate-200 (淺) / border-slate-800 (深)
邊距: px-6 py-4
```

### 底部導航 (Bottom Nav) - 移動設備
```
高度: h-20 (80px) 含 safe-area
位置: 固定底部
項目: ≤ 5 個
```

### 安全區域 (Safe Area)
- iOS: 尊重 `env(safe-area-inset-*)`
- Android: 尊重 notch 和導航欄
- 實現: `pb-safe` (Tailwind plugin)

---

## 📊 資料視覺化

### 日曆 / 甘特圖
```
時段單位: 30 分鐘 / 1 小時
顏色: 老師識別色 (8 色)
狀態指示:
  - 已預約: 老師色 (alpha 0.9)
  - 休假: 灰色條紋 (#1A1E2F 斜紋)
  - 待確認: 黃色 (#F59E0B alpha 0.7)
  - 未來: bg-slate-800
邊界: 1px border-slate-700
懸停: 提示卡顯示：客戶名、課程、時間
```

### KPI 卡片
```
排列: 4 列 (桌面) / 2 列 (平板) / 1 列 (手機)
內容:
  - 標題 (text-sm font-medium text-slate-400)
  - 數值 (text-3xl font-bold text-slate-50)
  - 變化趨勢 (↑ green-500 或 ↓ red-500)
```

### 表格
```
標題行: bg-slate-800 font-semibold text-slate-50
資料行: bg-slate-900 border-b border-slate-800
懸停: bg-slate-800 (行高亮)
填充: px-4 py-3
```

---

## ✨ 動畫與過渡

### 進入動畫
```
淡入: opacity 0 → 1 (200ms)
向上滑動: translate-y-4 → 0 (250ms ease-out)
縮放: scale-95 → 1 (200ms ease-out)
```

### 離開動畫
```
淡出: opacity 1 → 0 (150ms)
向下滑動: translate-y-0 → 4 (150ms ease-in)
```

### 狀態變化
```
折疊/展開: height + opacity (200ms ease-out)
顏色變化: 所有顏色屬性 (150ms ease-out)
```

### 載入狀態
```
Skeleton: 淺色脈衝動畫 (1.5s infinite)
Spinner: 旋轉動畫 (1s linear infinite)
進度條: width 動畫 (smooth)
```

---

## 🚫 禁止模式 (Anti-patterns)

| ❌ 不要做 | ✅ 應該做 |
|-----------|---------|
| 使用 emoji 作為圖標 | 使用 SVG (Lucide / Heroicons) |
| 隨意混合顏色 | 使用語義色彩系統 |
| 固定寬度佈局 | 響應式設計 (mobile-first) |
| 超過 500ms 的動畫 | 保持 150-300ms (流暢感) |
| 淡紫灰文本 | 高對比度 (≥4.5:1) |
| 省略焦點環 | 清晰的鍵盤焦點指示 |
| Hover 專用互動 | 支持觸摸和鍵盤 |
| 忽視 prefers-reduced-motion | 尊重無障礙偏好 |

---

## 📱 響應式斷點

```
Mobile:    375px (base)
Tablet:    768px (md)
Desktop:   1024px (lg)
Wide:      1440px (2xl)
```

### 佈局適配
- **Mobile**: 單欄，邊距 px-4
- **Tablet**: 最多 2 欄，邊距 px-6
- **Desktop**: 3-4 欄，邊距 px-8，側邊欄可見
- **Wide**: 最大寬度限制 max-w-7xl

---

## ♿ 無障礙清單

- [ ] 文本對比度 ≥ 4.5:1
- [ ] 所有圖標有 aria-label
- [ ] 表單標籤與輸入框關聯 (`<label htmlFor>`)
- [ ] 焦點順序邏輯正確
- [ ] 顏色不是唯一信息來源（+ 圖標 / 文本）
- [ ] Reduced motion 動畫簡化
- [ ] 螢幕閱讀器測試通過
- [ ] 鍵盤導航完整支持

---

## 🔍 Pre-Delivery 檢查清單

- [ ] 無 emoji 圖標 (使用 SVG)
- [ ] 所有互動元素 ≥ 44×44px
- [ ] Hover/Focus/Active 狀態清晰
- [ ] 光暗模式對比度分別測試
- [ ] 375px / 1440px 響應式驗證
- [ ] prefers-reduced-motion 支持
- [ ] 焦點環可見 (Tab 鍵導航)
- [ ] 表單錯誤提示立即且清晰
- [ ] 無佈局抖動 (CLS < 0.1)
- [ ] 動畫 < 400ms

---

**文件更新**: 2026-06-05  
**維護者**: Design & Engineering Team
