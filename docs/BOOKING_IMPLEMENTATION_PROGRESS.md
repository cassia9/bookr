# 預約管理模塊 - 實現進度

**更新日期**: 2026-06-10  
**Phase**: 1 (P0 - 基礎新增/編輯)  
**狀態**: ⏳ 實現中

---

## 📋 任務清單

### 後端 (Backend)
使用 `/supabase-postgres-best-practices` 技能

- [ ] **clients 表創建**
  - [ ] 遷移文件：CREATE TABLE clients
  - [ ] 索引：store_id, phone
  - [ ] RLS 政策：店家隔離
  
- [ ] **bookings 表擴展**
  - [ ] 添加 store_id 欄位
  - [ ] 添加 client_id 欄位
  - [ ] 添加 deleted_at 欄位（軟刪除）
  - [ ] 驗證 FK 約束
  
- [ ] **時段衝突檢測函數**
  - [ ] 創建 check_booking_conflict() 函數
  - [ ] 參數驗證
  - [ ] 測試用例
  
- [ ] **RLS 政策**
  - [ ] bookings: admin 完全控制，member 僅自己的
  - [ ] clients: admin 完全控制，member 按 store_id 篩選
  
- [ ] **性能優化**
  - [ ] 複合索引：bookings(practitioner_id, start_time, end_time, status)
  - [ ] 索引：clients(store_id, phone)

**進度**: 等待技能返回完整 SQL 代碼

---

### 前端 (Frontend)
使用 `/frontend-design` 技能

#### 文件結構已建立
```
src/
├── types/
│   └── booking.ts              ✅ 完成
├── lib/
│   └── bookings/
│       └── api.ts              ✅ 完成（占位符）
└── components/
    └── bookings/
        ├── BookingForm.tsx      ⏳ 等待完整實現
        ├── BookingStep1.tsx     ⏳ 待創建
        ├── BookingStep2.tsx     ⏳ 待創建
        ├── BookingStep3.tsx     ⏳ 待創建
        ├── BookingStep4.tsx     ⏳ 待創建
        ├── CustomerSearch.tsx   ⏳ 待創建
        └── TimeSlotPicker.tsx   ⏳ 待創建
```

#### 待實現的組件
- [ ] **BookingForm.tsx**
  - [ ] 4 步驟狀態管理
  - [ ] 步驟指示器（1/4, 2/4, 3/4, 4/4）
  - [ ] 上一步/下一步/確認按鈕

- [ ] **BookingStep1.tsx** - 選擇客戶
  - [ ] 搜尋框（名字/電話）
  - [ ] 結果列表（最多 5 個）
  - [ ] 新增客戶快速表單
  - [ ] 選中狀態

- [ ] **BookingStep2.tsx** - 選擇老師 & 課程
  - [ ] 老師下拉選擇
  - [ ] 課程列表（動態更新）
  - [ ] 課程信息顯示（名字、時長、價格）

- [ ] **BookingStep3.tsx** - 選擇時間
  - [ ] 日期選擇（Datepicker）
  - [ ] 時間選擇（可用時段）
  - [ ] 預約時長輸入
  - [ ] end_time 預覽
  - [ ] 衝突檢測和警告

- [ ] **BookingStep4.tsx** - 確認
  - [ ] 預約摘要顯示
  - [ ] 「確認新增」按鈕
  - [ ] 「上一步」按鈕

- [ ] **CustomerSearch.tsx** - 客戶搜尋組件
  - [ ] 搜尋框和結果列表
  - [ ] Loading 狀態
  - [ ] 新增客戶表單邏輯

- [ ] **TimeSlotPicker.tsx** - 時間選擇組件
  - [ ] 日期和時間選擇
  - [ ] 衝突檢測整合
  - [ ] 視覺反饋

**進度**: 等待技能返回完整 React 代碼

---

## 🔧 已完成的準備工作

✅ **類型定義** (`src/types/booking.ts`)
- Client, Booking, BookingFormData 接口
- BookingStep, BookingFormState 類型

✅ **API 函數** (`src/lib/bookings/api.ts`)
- searchClients()
- createClient()
- getPractitionerServices()
- checkBookingConflict()
- createBooking()
- updateBooking()
- deleteBooking()
- getAvailableTimeSlots()

✅ **占位符組件** (`src/components/bookings/BookingForm.tsx`)
- 基本結構已建立，待完整實現替換

---

## 📅 預期時程

| 階段 | 工作項 | 預估 | 狀態 |
|------|--------|------|------|
| 1 | 技能返回 SQL + React 代碼 | 進行中 | ⏳ |
| 2 | 整合後端遷移 | 1h | 等待 |
| 3 | 整合前端組件 | 1h | 等待 |
| 4 | 集成和測試 (/qc) | 1h | 等待 |
| 5 | Git 提交 | 0.5h | 等待 |

---

## 🚀 後續步驟（待執行）

1. **後端實現**
   - [ ] 執行後端 SQL 遷移到 Supabase
   - [ ] 驗證 RLS 政策生效
   - [ ] 測試衝突檢測函數

2. **前端實現**
   - [ ] 將完整的 React 代碼複製到各個組件文件
   - [ ] 確保組件導入正確
   - [ ] 驗證 Supabase 查詢邏輯

3. **集成測試**
   - [ ] 運行 `npm run dev`
   - [ ] 執行 `/qc` 品質檢查
   - [ ] 測試新增預約流程（端到端）

4. **提交**
   - [ ] `git add` 所有新文件
   - [ ] `git commit` Phase 1 完成

---

## 📝 相關文檔

- [PRD_BOOKING_MANAGEMENT.md](./PRD_BOOKING_MANAGEMENT.md) - 完整需求文檔
- [src/types/booking.ts](../src/types/booking.ts) - 類型定義
- [src/lib/bookings/api.ts](../src/lib/bookings/api.ts) - API 函數

---

## ⚠️ 注意事項

- ✅ 不刪除既有功能（practitioner management, calendar view）
- ✅ 所有改動向後兼容
- ✅ RLS 政策確保店家隔離
- ⏳ 等待兩個技能的完整實現結果

---

**更新者**: Claude Haiku 4.5  
**下次檢查**: 等待技能完成後
