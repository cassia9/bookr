# 預約管理系統 - 最終設計系統 v1.0

**完成日期**: 2026-06-05  
**狀態**: ✅ 已實裝和驗證  
**應用範圍**: PractitionerManagement 頁面 (Day 5 預覽)

---

## 📋 設計系統概覽

本文檔記錄了從 Day 5 到 Day 5.5 的所有設計系統改動，包括色彩、陰影、間距、排版和互動設計。

### 核心設計理念

```
白色系 + 灰階為主
黑色用於強調 (按鈕、文字)
大片柔和陰影提升深度感
淺灰線條創造邊界區隔
```

---

## 🎨 色彩系統

### 主色彩

| 名稱 | 十六進制 | 用途 | CSS 類別 |
|------|---------|------|---------|
| 白色 | #FFFFFF | 卡片、背景主色 | `bg-white` |
| 淺灰 | #F9F9F9 | 頁面背景/容器 | `bg-slate-50` |
| 淺灰 | #F5F5F5 | 懸停態背景 | `bg-slate-100` |
| 線條灰 | #E8E8E8 | 邊框/分隔線 | `border-slate-200` |
| 主文字 | #424245 | 標題、主要文字 | `text-text-primary` |
| 次文字 | #8A8A8E | 副標題、輔助文字 | `text-text-secondary` |
| 黑色 | #000000 | 主按鈕、強調 | `bg-black` |
| 黑色 Hover | #1A1A1A | 按鈕懸停狀態 | `bg-primary-hover` |

### 語義色彩

| 狀態 | 主色 | 淺色 | 用途 |
|------|------|------|------|
| 成功 | #34C759 | #D1EFCC | 完成、確認 |
| 危險 | #FF3B30 | #FFD1CC | 刪除、錯誤 |
| 警告 | #FF9500 | #FFE5CC | 需注意的項 |
| 資訊 | #0084FF | #CCE5FF | 中立資訊 |

---

## 🌑 陰影系統 (Elevation Scale)

### Tailwind Shadow 定義

```css
shadow-xs:  0 2px 4px 0 rgba(0, 0, 0, 0.06)
shadow-sm:  0 4px 6px 0 rgba(0, 0, 0, 0.08)
shadow-md:  0 8px 12px -2px rgba(0, 0, 0, 0.12)
shadow-lg:  0 16px 24px -4px rgba(0, 0, 0, 0.15)
shadow-xl:  0 24px 36px -8px rgba(0, 0, 0, 0.20)
shadow-2xl: 0 32px 64px -16px rgba(0, 0, 0, 0.30)
```

### 元件陰影對應

| 元件 | 基礎狀態 | Hover 狀態 | 用途 |
|------|---------|-----------|------|
| **統計卡片** | shadow-lg | shadow-xl | 浮起的資料展示 |
| **表格容器** | shadow-lg | shadow-xl | 浮起的表格 |
| **標題欄** | shadow-md | - | 頁面分隔 |
| **搜尋欄** | shadow-md | - | 區隔內容區 |
| **主按鈕** | shadow-lg | shadow-xl | 強調主要操作 |
| **Sidebar** | shadow-lg | - | 側邊欄與內容分隔 |

---

## 📐 間距系統 (8px Grid)

### 基礎間距

```
xs:  4px  (0.5x)
sm:  8px  (1x)   ← 基礎單位
md:  12px (1.5x)
lg:  16px (2x)
xl:  24px (3x)
2xl: 32px (4x)
```

### 常用組合

| 元素 | 內部間距 | 外部間距 | 範例 |
|------|---------|---------|------|
| **卡片** | p-6 (24px) | - | StatsCard, 表格 |
| **標題欄** | px-6 py-6 | - | 頁面頂部 |
| **搜尋欄** | px-6 py-5 | - | 控制區 |
| **表格** | p-6 (容器) | - | 整個表格區域 |
| **卡片間距** | - | gap-6 | 統計卡片行 |

---

## 🔤 排版系統

### 字型堆疊

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             'Noto Sans TC', 'PingFang TC', sans-serif;
```

### 尺寸與權重

| 層級 | 尺寸 | 權重 | 用途 |
|------|------|------|------|
| **大標題** | text-4xl | 700 | 頁面主標題 (h1) |
| **中標題** | text-2xl | 600 | 區段標題 (h2) |
| **小標題** | text-lg | 600 | 卡片標題 |
| **正文** | text-sm | 400 | 表格內容、描述 |
| **標籤** | text-xs | 600 | 卡片標籤、徽章 |
| **次文本** | text-xs | 400 | 副標題、輔助 |

### 行高

```css
heading:    line-height: 1.2 (緊湊)
body:       line-height: 1.5 (舒適)
```

---

## 🎯 元件樣式

### 按鈕

#### 主按鈕 (Primary)

```tsx
className="px-4 py-2.5 bg-black text-white rounded-2xl
           shadow-lg shadow-black/15 
           hover:bg-primary-hover hover:shadow-xl 
           active:scale-95 transition-all"
```

**狀態**:
- 預設: 黑色 + shadow-lg
- Hover: 深灰 (#1A1A1A) + shadow-xl + 放大陰影
- Active: 縮放至 95% (按下反饋)
- Disabled: opacity-60 + cursor-not-allowed

#### 次按鈕 (Secondary)

```tsx
className="px-4 py-2.5 bg-slate-100 text-text-primary 
           border border-slate-200 rounded-lg shadow-sm
           hover:bg-slate-200 transition"
```

**狀態**:
- 預設: 淺灰背景 + 淺灰邊框
- Hover: 更深的淺灰背景

#### 危險按鈕 (Danger)

```tsx
className="bg-danger text-white hover:bg-danger/90 
           shadow-md shadow-danger/20"
```

### 輸入框 (Input)

```tsx
className="px-4 py-2.5 border border-slate-200 
           bg-white rounded-lg text-text-primary
           focus:outline-none focus:ring-0 
           focus:border-black transition"
```

**狀態**:
- 預設: 邊框 1px slate-200
- Focus: 邊框 1px 黑色 (只改顏色,粗細不變)
- Placeholder: text-text-secondary

### 選擇框 (Select)

```tsx
className="px-4 py-2.5 border border-slate-200 
           bg-white rounded-lg text-text-primary
           focus:outline-none focus:ring-0 
           focus:border-black transition"
```

**特殊設定**:
- Focus: 邊框改黑色 (ring-0,只改顏色)
- 邊框粗細: 始終 1px (不變)

### 卡片 (Card)

```tsx
className="bg-white rounded-xl p-6 space-y-3
           shadow-lg hover:shadow-xl transition-all"
```

**特性**:
- 背景: 純白
- 圓角: rounded-xl (12px)
- 內間距: p-6 (24px)
- 陰影: shadow-lg (浮起感)
- 邊框: 無 (陰影足以區隔)

### 表格容器

```tsx
className="bg-white rounded-xl shadow-lg 
           overflow-hidden border-0"
```

**表格頭**:
```tsx
className="bg-slate-50 border-b border-slate-200"
```

**表格行**:
```tsx
className="border-b border-slate-200/30 
           hover:bg-slate-50 transition-colors"
```

---

## 🏗️ 佈局系統

### 頁面結構

```
┌─────────────────────────────────────┐
│ Sidebar (bg-white shadow-lg)        │ Main Area
│ w-60                                │ (bg-slate-50)
├─────────────────────────────────────┤
│ Header (bg-white shadow-md)         │
│ px-6 py-6                           │
├─────────────────────────────────────┤
│ Stats Cards (shadow-lg)             │
│ px-6 py-8 grid-cols-4 gap-6        │
├─────────────────────────────────────┤
│ Search Bar (shadow-md)              │
│ px-6 py-5                           │
├─────────────────────────────────────┤
│ Table (shadow-lg white card)        │
│ p-6                                 │
└─────────────────────────────────────┘
```

### 響應式斷點

```
Mobile:   < 768px  (全寬,堆疊)
Tablet:   768px    (flex 並排)
Desktop:  1024px   (固定寬度)
```

---

## ✨ 互動設計

### 轉換與動畫

```css
transition-all duration-200  /* 卡片、按鈕 */
transition-colors            /* 文字、邊框顏色變化 */
hover:shadow-xl              /* 陰影提升 */
active:scale-95              /* 按下縮小 */
```

### 焦點狀態

```
Input/Select Focus:
  outline: 無
  ring: 無 (ring-0)
  border: 1px 黑色 (只改顏色,不改粗細)
  
Hover:
  shadow: 提升
  bg-color: 淺灰 (可選)
```

### 禁用狀態

```css
disabled:opacity-60           /* 減少不透明度 */
disabled:cursor-not-allowed   /* 鼠標游標改變 */
```

---

## 📋 已套用元件

### ✅ Day 5 更新

| 元件 | 檔案位置 | 改動內容 |
|------|---------|---------|
| **Button** | `src/components/ui/Button.tsx` | 色彩、陰影、轉換 |
| **StatsCard** | `src/components/ui/StatsCard.tsx` | 排版、陰影、徽章樣式 |
| **AdminLayout** | `src/components/layout/AdminLayout.tsx` | Sidebar 陰影、邊框調整 |
| **PractitionerManagement** | `src/pages/admin/PractitionerManagement.tsx` | 佈局、間距、色彩 |
| **PractitionerTable** | `src/components/practitioners/PractitionerTable.tsx` | 表格卡片化、陰影 |

### 🔧 Day 5.5 微調

| 改動 | 提交 | 詳情 |
|------|------|------|
| 增強陰影系統 | `2d3a9b6` | shadow 提升 40% |
| 淺灰線條 | `2f7d385` | border-slate-200 |
| 移除邊框 | `071548c` | 卡片只用陰影 |
| 修正 Focus 線條 | `20e03ca` | ring-2 → ring-1 |

---

## 🎯 設計決策與原因

### 為什麼選擇白色+灰階?

✅ **現代感強** - 企業級應用標準  
✅ **易讀性高** - 黑字在白背景對比度最高  
✅ **減少視覺負擔** - 灰階溫和不刺眼  
✅ **適配深色模式** - 未來擴展容易  

### 為什麼用大片陰影?

✅ **深度感清晰** - 卡片浮起,層級明確  
✅ **現代設計標準** - Material Design 3  
✅ **視覺吸引力** - 柔和陰影比邊框優雅  
✅ **無障礙友善** - 陰影 + 顏色區隔  

### 為什麼移除邊框?

✅ **簡潔度提升** - 陰影本身就是邊界  
✅ **減少視覺干擾** - 線條太多顯得雜亂  
✅ **現代設計趨勢** - 扁平 + 陰影混合  

### 為什麼 ring-1 而非 ring-2?

✅ **視覺一致** - 與邊框同樣厚細  
✅ **焦點清晰** - 足以顯示焦點,不過度強調  
✅ **設計簡潔** - 只改顏色,不改寬度  

---

## 📏 檢查清單 (Quality Assurance)

在應用此設計系統到其他頁面前,請檢查:

### 色彩
- [ ] 所有文字對比度 ≥ 4.5:1
- [ ] 邊框都用 border-slate-200
- [ ] 背景用 white / slate-50 / slate-100
- [ ] 沒有硬編碼的顏色

### 陰影
- [ ] 卡片使用 shadow-lg/xl
- [ ] 按鈕使用 shadow-lg
- [ ] Hover 狀態提升至下一級陰影
- [ ] 無邊框的卡片只靠陰影區隔

### 間距
- [ ] 卡片內間距 p-6
- [ ] 區域外間距遵循 8px grid
- [ ] 元件間距用 gap-6

### 互動
- [ ] Focus ring 使用 ring-1
- [ ] Hover 有視覺反饋 (陰影或顏色)
- [ ] Active/Pressed 有按下效果
- [ ] Disabled 顯示 opacity-60

### 排版
- [ ] 標題用 text-4xl font-bold
- [ ] 正文用 text-sm font-normal
- [ ] 標籤用 text-xs font-semibold
- [ ] 行高適當 (heading 1.2, body 1.5)

---

## 🚀 下一步應用

此設計系統已驗證在:
- ✅ PractitionerManagement 頁面

準備應用到:
- ⏳ BookingsPage (預約管理)
- ⏳ DashboardPage (數據總覽)
- ⏳ ClientsPage (客戶管理)
- ⏳ ServicesPage (課程管理)
- ⏳ 所有頁面

### 應用步驟

1. **複製樣式模式** - 參考 PractitionerManagement 的實作
2. **替換色彩** - 用新色彩系統替換舊色彩
3. **調整間距** - 確保遵循 8px grid
4. **驗證對比度** - 檢查無障礙標準
5. **測試互動** - 確認所有狀態正常

---

## 📚 參考資源

### 設計文檔
- `DESIGN_SYSTEM_MASTER.md` - 舊版本 (已更新)
- `COLOR_PALETTE_REFERENCE.md` - 色彩參考表
- `DESIGN_SYSTEM_PREVIEW.md` - 預覽報告

### 代碼文件
- `tailwind.config.js` - Tailwind 配置 (陰影系統)
- `src/styles/design-tokens.css` - CSS 變數
- `src/index.css` - 全局樣式

### Git 提交
```
af0f79f - Day 5: 更新頁面樣式和按鈕元件
2d3a9b6 - Day 5.5: 增強陰影和淺灰線條
2f7d385 - 增強陰影和淺灰線條
071548c - 移除有陰影卡片的邊框線條
20e03ca - 修正 select focus 狀態線條寬度
```

---

## ✅ 設計系統 v1.0 完成

**時間軸**: Day 5 ~ Day 5.5 (約 2 小時)  
**應用頁面**: 1 個 (PractitionerManagement)  
**準備狀態**: ✅ 可全站推廣  

**下一個里程碑**: Day 6-7 全站遷移

---

**維護者**: Design Team  
**最後更新**: 2026-06-05  
**版本**: 1.0.0

