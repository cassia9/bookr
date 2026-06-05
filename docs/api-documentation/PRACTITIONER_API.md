# 從業人員管理 API 文檔

**版本**: 1.0  
**狀態**: 設計階段  
**建立日期**: 2026-06-05

---

## 📋 API 端點列表

### 老師管理（Practitioners）

| 方法 | 端點 | 功能 | 權限 |
|------|------|------|------|
| POST | `/api/practitioners` | 新增老師 | 管理員 |
| GET | `/api/practitioners` | 列出所有老師 | 成員+ |
| GET | `/api/practitioners/:id` | 查看老師詳情 | 成員+ |
| PUT | `/api/practitioners/:id` | 編輯老師 | 管理員 |
| DELETE | `/api/practitioners/:id` | 刪除老師（軟刪除） | 管理員 |

### 老師課程指派（Practitioner Services）

| 方法 | 端點 | 功能 | 權限 |
|------|------|------|------|
| GET | `/api/practitioners/:id/services` | 取得老師可被預約的課程 | 成員+ |
| PUT | `/api/practitioners/:id/services` | 更新老師課程指派 | 管理員 |

### 老師休假（Practitioner Leaves）

| 方法 | 端點 | 功能 | 權限 |
|------|------|------|------|
| GET | `/api/practitioners/:id/leaves` | 查詢老師休假列表 | 成員+ |
| POST | `/api/practitioners/:id/leaves` | 新增老師休假 | 管理員 |
| PUT | `/api/practitioners/:id/leaves/:leaveId` | 編輯休假 | 管理員 |
| DELETE | `/api/practitioners/:id/leaves/:leaveId` | 刪除休假 | 管理員 |

---

## 🔧 詳細 API 規格

### 1. POST /api/practitioners - 新增老師

**請求**：
```json
{
  "name": "王美麻",
  "color_hex": "#9333EA",
  "bio": "專業瑞典按摩師，擁有 10 年經驗",
  "photo_url": "https://example.com/photos/wang-mei.jpg"
}
```

**驗證**：
- `name` (必填)：非空字符串，長度 1-255
- `color_hex` (必填)：有效的 HEX 色值，格式 `#RRGGBB`
- `bio` (可選)：最多 1000 字
- `photo_url` (可選)：有效的 URL

**回應 (201 Created)**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "store_id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "王美麻",
  "color_hex": "#9333EA",
  "bio": "專業瑞典按摩師，擁有 10 年經驗",
  "photo_url": "https://example.com/photos/wang-mei.jpg",
  "is_active": true,
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T10:00:00Z",
  "deleted_at": null
}
```

**錯誤**：
- 400 Bad Request：驗證失敗（缺少必填欄位、格式錯誤）
- 401 Unauthorized：未授權
- 403 Forbidden：權限不足（非管理員）

---

### 2. GET /api/practitioners - 列出所有老師

**查詢參數**：
```
?search=王          # 按姓名搜尋
&is_active=true    # 篩選活躍狀態（true/false/all）
&limit=50          # 分頁大小（預設 50）
&offset=0          # 分頁偏移
```

**回應 (200 OK)**：
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "王美麻",
      "color_hex": "#9333EA",
      "bio": "專業瑞典按摩師",
      "photo_url": "https://example.com/photos/wang-mei.jpg",
      "is_active": true,
      "booking_count": 5,  // 今日預約數（可選欄位）
      "status": "available",  // 'busy' | 'available' | 'no_bookings'
      "created_at": "2026-06-05T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 12,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

### 3. GET /api/practitioners/:id - 查看老師詳情

**路徑參數**：
- `id`: 老師的 UUID

**回應 (200 OK)**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "王美麻",
  "color_hex": "#9333EA",
  "bio": "專業瑞典按摩師，擁有 10 年經驗",
  "photo_url": "https://example.com/photos/wang-mei.jpg",
  "is_active": true,
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T10:00:00Z",
  "deleted_at": null,
  
  // 擴展資訊（可選）
  "services": [
    {
      "id": "service-id-1",
      "name": "瑞典按摩",
      "duration_minutes": 60,
      "price": 800
    }
  ],
  "leaves": [
    {
      "id": "leave-id-1",
      "start_date": "2026-06-10",
      "end_date": "2026-06-15",
      "reason": "年假"
    }
  ],
  "booking_count": 5,
  "status": "available"
}
```

---

### 4. PUT /api/practitioners/:id - 編輯老師

**請求**：
```json
{
  "name": "王美麻（更新）",
  "color_hex": "#EC4899",
  "bio": "已更新的簡介",
  "photo_url": "https://example.com/photos/new-photo.jpg"
}
```

**回應 (200 OK)**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "王美麻（更新）",
  "color_hex": "#EC4899",
  "bio": "已更新的簡介",
  "photo_url": "https://example.com/photos/new-photo.jpg",
  "is_active": true,
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T11:30:00Z",
  "deleted_at": null
}
```

---

### 5. DELETE /api/practitioners/:id - 刪除老師

**回應 (204 No Content)**：
- 無返回體

**注意**：
- 執行軟刪除（標記 `deleted_at` 時間戳）
- 不會從資料庫物理刪除記錄
- 已刪除的老師不會出現在 GET 列表中
- 如果有未完成的預約，返回 409 Conflict

**錯誤**：
```json
{
  "error": "CONFLICT",
  "message": "該老師還有 3 筆未完成的預約，無法刪除",
  "pending_bookings": 3
}
```

---

### 6. PUT /api/practitioners/:id/services - 更新老師課程指派

**請求**：
```json
{
  "service_ids": [
    "service-id-1",  // 瑞典按摩
    "service-id-3"   // 伸展課程
  ]
}
```

**驗證**：
- 至少需要指派 1 個課程
- 所有 `service_id` 必須存在於資料庫
- 課程必須是活躍狀態（is_active = true）

**回應 (200 OK)**：
```json
{
  "practitioner_id": "550e8400-e29b-41d4-a716-446655440000",
  "services": [
    {
      "id": "service-id-1",
      "name": "瑞典按摩",
      "duration_minutes": 60,
      "price": 800
    },
    {
      "id": "service-id-3",
      "name": "伸展課程",
      "duration_minutes": 45,
      "price": 500
    }
  ]
}
```

---

### 7. GET /api/practitioners/:id/leaves - 查詢老師休假列表

**查詢參數**：
```
?from=2026-06-01    # 開始日期（YYYY-MM-DD）
&to=2026-06-30      # 結束日期
```

**回應 (200 OK)**：
```json
{
  "data": [
    {
      "id": "leave-id-1",
      "practitioner_id": "550e8400-e29b-41d4-a716-446655440000",
      "start_date": "2026-06-10",
      "end_date": "2026-06-15",
      "reason": "年假",
      "created_at": "2026-06-05T10:00:00Z",
      "updated_at": "2026-06-05T10:00:00Z"
    },
    {
      "id": "leave-id-2",
      "practitioner_id": "550e8400-e29b-41d4-a716-446655440000",
      "start_date": "2026-07-20",
      "end_date": "2026-07-22",
      "reason": "生病",
      "created_at": "2026-06-05T10:30:00Z",
      "updated_at": "2026-06-05T10:30:00Z"
    }
  ]
}
```

---

### 8. POST /api/practitioners/:id/leaves - 新增老師休假

**請求**：
```json
{
  "start_date": "2026-06-20",
  "end_date": "2026-06-25",
  "reason": "年假"
}
```

**驗證**：
- `start_date` 和 `end_date` 必須是有效的日期格式（YYYY-MM-DD）
- `end_date` >= `start_date`
- 檢查是否與現有休假重疊，給出警告（但允許建立）

**回應 (201 Created)**：
```json
{
  "id": "leave-id-new",
  "practitioner_id": "550e8400-e29b-41d4-a716-446655440000",
  "start_date": "2026-06-20",
  "end_date": "2026-06-25",
  "reason": "年假",
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T10:00:00Z"
}
```

---

### 9. PUT /api/practitioners/:id/leaves/:leaveId - 編輯休假

**請求**：
```json
{
  "start_date": "2026-06-20",
  "end_date": "2026-06-26",
  "reason": "年假（已調整）"
}
```

**回應 (200 OK)**：同新增

---

### 10. DELETE /api/practitioners/:id/leaves/:leaveId - 刪除休假

**回應 (204 No Content)**：
- 無返回體

---

## 🔐 認證與授權

### 認證方式
- 使用 Supabase Auth Bearer Token
- 請求頭：`Authorization: Bearer <token>`

### 授權規則

| 端點 | 管理員 | 成員 | 未授權 |
|------|--------|------|--------|
| POST /api/practitioners | ✅ | ❌ | ❌ |
| GET /api/practitioners | ✅ | ✅ | ❌ |
| GET /api/practitioners/:id | ✅ | ✅ | ❌ |
| PUT /api/practitioners/:id | ✅ | ❌ | ❌ |
| DELETE /api/practitioners/:id | ✅ | ❌ | ❌ |
| GET/PUT /api/practitioners/:id/services | ✅ (PUT) / ✅ (GET) | ❌ (PUT) / ✅ (GET) | ❌ |
| GET/POST/PUT/DELETE /api/practitioners/:id/leaves | ✅ | ❌ | ❌ |

---

## 📊 回應格式規範

### 成功回應

**2xx 狀態碼**：
```json
{
  "data": { /* 實際資料 */ },
  "meta": {
    "timestamp": "2026-06-05T10:00:00Z",
    "request_id": "req-uuid-here"
  }
}
```

### 錯誤回應

**4xx / 5xx 狀態碼**：
```json
{
  "error": "ERROR_CODE",
  "message": "人類可讀的錯誤訊息",
  "details": {
    "field": "錯誤欄位",
    "reason": "詳細原因"
  }
}
```

### 常見錯誤碼

| 代碼 | 狀態 | 說明 |
|------|------|------|
| VALIDATION_ERROR | 400 | 輸入驗證失敗 |
| UNAUTHORIZED | 401 | 未授權（缺少 token） |
| FORBIDDEN | 403 | 無權限執行操作 |
| NOT_FOUND | 404 | 資源不存在 |
| CONFLICT | 409 | 衝突（如重複值、邏輯衝突） |
| INTERNAL_ERROR | 500 | 伺服器內部錯誤 |

---

## 🔗 預約驗證整合

### 場景 1：課程驗證

預約時需驗證老師是否可提供該課程：

```sql
-- 驗證老師是否可提供該課程
SELECT EXISTS (
  SELECT 1 FROM practitioner_services
  WHERE practitioner_id = $1
  AND service_id = $2
) AS can_book;
```

### 場景 2：休假驗證

預約時需檢查老師是否在休假：

```sql
-- 檢查老師在指定日期是否休假
SELECT EXISTS (
  SELECT 1 FROM practitioner_leaves
  WHERE practitioner_id = $1
  AND start_date <= $2
  AND end_date >= $2
) AS is_on_leave;
```

---

## 📝 實施檢查清單

- [ ] 遷移文件已執行（Migration 014）
- [ ] RLS 政策已啟用
- [ ] 審計觸發器已建立
- [ ] API 端點已實施
- [ ] 輸入驗證已完成
- [ ] 錯誤處理已完成
- [ ] 認證檢查已完成
- [ ] 整合測試已通過

---

**建立者**: Claude Haiku 4.5  
**最後更新**: 2026-06-05
