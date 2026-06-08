# 預約管理系統 - 完整設計指南 v2.0

**更新日期**: 2026-06-08  
**風格**: 現代 SaaS（Calendly、Linear、Stripe 風格）  
**應用範圍**: 全站所有頁面與組件

---

## 🎯 核心設計原則

### 三大支柱
1. **簡潔清晰** - 避免視覺雜亂，優先展示關鍵資訊
2. **一致性** - 所有組件、顏色、間距遵循統一系統
3. **可訪問性** - 足夠的對比度、清晰的互動反饋

---

## 🎨 色彩系統

### 語義色彩

| 用途 | 色號 | 淺色 | CSS 類別 | 備註 |
|------|------|------|---------|------|
| **成功/確認** | #34C759 | #D1EFCC | `text-success` `bg-success-light` | 已確認預約 |
| **警告/待確認** | #FF9500 | #FFE5CC | `text-warning` `bg-warning-light` | 需要確認的預約 |
| **資訊/已完成** | #0084FF | #CCE5FF | `text-info` `bg-info-light` | 已完成課程 |
| **中立/已取消** | #8A8A8E | #F0F0F0 | `text-slate-400` `bg-slate-100` | 已取消預約 |

### 中性色彩系統

| 級別 | 色號 | 用途 | CSS 類別 |
|------|------|------|---------|
| **純白** | #FFFFFF | 背景、卡片 | `bg-white` |
| **淺灰** | #F9F9F9 | 次級背景 | `bg-slate-50` |
| **邊框/線條** | #E5E5E5 | **所有邊框、分隔線、描邊** | `border-slate-200` |
| **次要文字** | #8A8A8E | 說明文字、標籤 | `text-slate-600` `text-text-secondary` |
| **主要文字** | #424245 | 標題、內容 | `text-slate-900` `text-text-primary` |
| **深灰** | #1A1A1A | 背景、強調 | `bg-slate-900` |

---

## 📐 線條規則 (Critical)

### ✅ 所有邊框必須使用灰色

```jsx
// ✅ 正確
<div className="border border-slate-200">
<div className="border-b border-slate-200">
<div className="border-l-4 border-slate-300">

// ❌ 錯誤 (不使用)
<div className="border border-blue-200">
<div className="border border-green-300">
```

### 邊框寬度與用途

| 寬度 | 用途 | CSS | 範例 |
|------|------|-----|------|
| **1px** | 標準邊框、容器分界 | `border` | 卡片、表格、彈窗 |
| **2px** | 次要分隔、焦點指示 | `border-2` | 選中狀態 |
| **4px** | 狀態指示符 (left border) | `border-l-4` | 預約卡片的狀態條 |

### 分隔線規範

```jsx
// 頂部邊框
<div className="border-t border-slate-200">

// 底部邊框
<div className="border-b border-slate-200">

// 垂直分隔
<div className="border-r border-slate-200">

// 完整邊框
<div className="border border-slate-200">
```

---

## 🧩 組件樣式規範

### 1. 卡片 (Card)

```jsx
<div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
  {/* 內容 */}
</div>
```

**樣式清單：**
- 背景: `bg-white`
- 邊框: `border border-slate-200`
- 圓角: `rounded-lg` (16px)
- 內間距: `p-6`
- 陰影: `shadow-sm` 默認, `shadow-md` hover
- 過渡: `transition-shadow`

---

### 2. 按鈕

#### 主要按鈕 (Primary)
```jsx
<button className="px-4 py-2 bg-black text-white rounded-lg hover:bg-slate-900 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all font-medium text-sm">
  操作
</button>
```

**樣式清單：**
- 背景: `bg-black`
- 文字: `text-white`
- 邊框: 無
- 圓角: `rounded-lg`
- Hover: `hover:bg-slate-900`
- Focus: `focus:ring-2 focus:ring-black focus:ring-offset-2`
- 文字: `font-medium text-sm`

#### 次要按鈕 (Secondary)
```jsx
<button className="px-4 py-2 bg-slate-100 text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm">
  取消
</button>
```

**樣式清單：**
- 背景: `bg-slate-100`
- 邊框: `border border-slate-200`
- 文字: `text-slate-900`
- Hover: `hover:bg-slate-50`

---

### 3. 輸入框 (Input)

```jsx
<input 
  type="text"
  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all"
  placeholder="輸入..."
/>
```

**樣式清單：**
- 背景: `bg-white`
- 邊框: `border border-slate-200`
- 圓角: `rounded-lg`
- 內間距: `px-4 py-2`
- Focus: `focus:ring-2 focus:ring-black focus:ring-offset-2`

---

### 4. 彈窗 (Modal/Dialog)

```jsx
// 背景遮罩
<div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />

// 彈窗容器
<div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl transition-transform duration-300 z-50 overflow-y-auto rounded-l-xl">
  {/* 標題區 */}
  <div className="p-6 border-b border-slate-200">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-slate-900">標題</h2>
      <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
        <X size={20} />
      </button>
    </div>
  </div>
  
  {/* 內容區 */}
  <div className="p-6 space-y-6">
    {/* 內容 */}
  </div>
</div>
```

**樣式清單：**
- 背景: `bg-white`
- 邊框: `border-b border-slate-200` (標題區下方)
- 標題: `text-lg font-semibold text-slate-900`
- 內間距: `p-6`
- 陰影: `shadow-2xl`
- 關閉按鈕 hover: `hover:bg-slate-100`

---

### 5. 表格 (Table)

```jsx
<div className="border border-slate-200 rounded-lg overflow-hidden">
  <table className="w-full">
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50">
        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">欄位</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
        <td className="px-6 py-3 text-sm text-slate-600">內容</td>
      </tr>
    </tbody>
  </table>
</div>
```

**樣式清單：**
- 邊框: `border border-slate-200`
- 欄位邊界: `border-b border-slate-200`
- 頭部背景: `bg-slate-50`
- 行 Hover: `hover:bg-slate-50`

---

## 📏 間距系統 (8px Grid)

| 單位 | 像素 | 用途 | CSS 類別 |
|------|------|------|---------|
| xs | 4px | 極小間距 | `p-1` `gap-1` |
| sm | 8px | 小間距 | `p-2` `gap-2` |
| md | 12px | 標準間距 | `p-3` `gap-3` |
| lg | 16px | 大間距 | `p-4` `gap-4` |
| xl | 24px | 更大間距 | `p-6` `gap-6` |
| 2xl | 32px | 超大間距 | `p-8` `gap-8` |

---

## 🔤 字體規範

### 標題層級

| 級別 | 大小 | 粗細 | 用途 | CSS |
|------|------|------|------|-----|
| H1 | 32px | semibold (600) | 頁面標題 | `text-3xl font-semibold` |
| H2 | 24px | semibold (600) | 區塊標題 | `text-2xl font-semibold` |
| H3 | 18px | semibold (600) | 卡片標題 | `text-lg font-semibold` |
| H4 | 16px | medium (500) | 次標題 | `text-base font-medium` |
| 身體 | 14px | normal (400) | 正文內容 | `text-sm` |
| 標籤 | 12px | medium (500) | 小標籤 | `text-xs font-medium` |

### 字體規則

```jsx
// ✅ 正確
<h2 className="text-2xl font-semibold text-slate-900">標題</h2>
<p className="text-sm text-slate-600">說明文字</p>

// ❌ 錯誤
<h2 className="text-2xl font-bold text-slate-900">標題</h2>  // bold 改用 semibold
<p className="text-sm text-slate-400">說明文字</p>  // 對比度不足
```

---

## ✨ 互動狀態

### Hover (懸停)

```jsx
// 卡片 Hover
className="shadow-sm hover:shadow-md transition-shadow"

// 按鈕 Hover
className="hover:bg-slate-900" // 深色化

// 文字鏈接 Hover
className="text-slate-600 hover:text-slate-900 transition-colors"
```

### Focus (焦點)

```jsx
// 鍵盤導航焦點
className="focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"

// 簡化版 (某些組件)
className="focus:ring-2 focus:ring-slate-300"
```

### Active (按下)

```jsx
// 按鈕按下
className="active:scale-95 transition-transform"

// 選中狀態
className="bg-slate-50 border-2 border-black"
```

### Disabled (禁用)

```jsx
// 禁用狀態
className="opacity-50 cursor-not-allowed"
```

---

## 🎬 動畫與過渡

### 過渡時間

| 用途 | 時間 | CSS |
|------|------|-----|
| 快速反饋 | 150ms | `transition-colors` |
| 標準過渡 | 200ms | `transition-all` |
| 慢速動畫 | 300ms | `transition-transform` |

### 常用過渡

```jsx
// 顏色變化
className="transition-colors duration-200"

// 陰影變化
className="transition-shadow duration-200"

// 完整變化
className="transition-all duration-200"

// 變形動畫
className="transition-transform duration-300 hover:scale-105"
```

---

## 📱 響應式設計

### 斷點規則

| 尺寸 | 寬度 | 用途 |
|------|------|------|
| 行動 | < 640px | 手機 |
| 平板 | 640px - 1024px | 平板 |
| 桌面 | > 1024px | 電腦 |

### 響應式樣式示例

```jsx
// 隱藏/顯示元素
className="hidden md:flex"  // 桌面顯示

// 尺寸調整
className="w-full md:w-96"  // 行動全寬，桌面固定寬度

// 間距調整
className="p-4 md:p-6"  // 行動 p-4，桌面 p-6
```

---

## 🔒 陰影系統

| 級別 | 用途 | CSS |
|------|------|-----|
| xs | 微妙提升 | `shadow-sm` |
| md | 標準提升 | `shadow-md` |
| lg | 強烈提升 | `shadow-lg` |
| xl | 彈窗級別 | `shadow-2xl` |

```jsx
// 卡片預設陰影
<div className="shadow-sm hover:shadow-md transition-shadow">

// 彈窗陰影
<div className="shadow-2xl">
```

---

## 🎯 元件清單與規則

### 全站必須遵循的規則

| 類型 | 規則 | 例外 |
|------|------|------|
| **邊框** | 所有邊框使用 `border-slate-200` 或 `border-slate-100` | 無 |
| **圓角** | 標準卡片 `rounded-lg`，按鈕 `rounded-lg` | - |
| **陰影** | 默認 `shadow-sm`，hover `shadow-md` | 彈窗 `shadow-2xl` |
| **間距** | 遵循 8px Grid | 特殊排版例外 |
| **字體** | 標題 semibold (600)，body normal (400) | 無 |
| **焦點環** | `focus:ring-2 focus:ring-black focus:ring-offset-2` | 某些嵌入式組件例外 |

---

## 📋 檢查清單

在提交任何 UI 前，確認：

- [ ] 所有邊框都是灰色 (`border-slate-200` 或 `border-slate-100`)
- [ ] 按鈕有 hover 狀態和 focus 環
- [ ] 卡片有陰影且 hover 時陰影增強
- [ ] 輸入框有焦點指示
- [ ] 文字顏色對比度足夠 (WCAG AA 標準)
- [ ] 間距遵循 8px Grid
- [ ] 沒有使用其他顏色的邊框 (除了語義色作為指示符)
- [ ] 所有動畫時間 150-300ms
- [ ] 響應式斷點正確設置

---

**版本歷史**：
- v1.0 (2026-06-05) - CalendarPage & GanttPage 設計規範
- v2.0 (2026-06-08) - 全系統設計指南，統一線條色彩規則
