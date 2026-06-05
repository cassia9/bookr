# 🛠️ Security Improvement Plan — 執行方案

**版本:** 1.0  
**優先級:** Critical → High → Medium  
**預計工時:** 12-15 小時  
**目標完成:** 2026-06-10

---

## 快速概覽

| 優先級 | 項目 | 工時 | 狀態 |
|--------|------|------|------|
| 🔴 CRITICAL | 1. 重新生成 API 金鑰 | 0.5h | ⬜ 待做 |
| 🔴 CRITICAL | 2. 修復 Storage Bucket RLS | 0.5h | ⬜ 待做 |
| 🟠 HIGH | 3. 移除 p_store_id 參數 | 1h | ⬜ 待做 |
| 🟠 HIGH | 4. 添加輸入驗證 | 2.5h | ⬜ 待做 |
| 🟡 MEDIUM | 5. 修復 RLS 策略 | 1.5h | ⬜ 待做 |
| 🟡 MEDIUM | 6. 實施審計日誌 | 4h | ⬜ 待做 |
| 🟡 MEDIUM | 7. 實施速率限制 | 3h | ⬜ 待做 |

**總計: 13 小時**

---

## Phase 1: CRITICAL — 立即修復

### Task 1.1: 重新生成 Supabase API 金鑰

**目標:** 撤銷已外洩的 anon key，生成新的安全金鑰

**步驟:**

1. **登入 Supabase Dashboard**
   ```
   https://app.supabase.com → Projects → 選擇當前項目
   ```

2. **導航到 API 設定**
   ```
   左側選單 > Settings > API
   ```

3. **重新生成 Anon Key**
   - 找到 "Project API keys" 區域
   - 點擊 anon key 旁的 "..." 選單
   - 選擇 "Regenerate key"
   - 確認彈窗

4. **更新 `.env.local`**
   ```bash
   # 複製新的 anon key
   VITE_SUPABASE_ANON_KEY=<new-key>
   ```

5. **清除 Git 歷史中的舊金鑰**
   ```bash
   # 安裝 git-filter-repo（一次性）
   pip install git-filter-repo
   
   # 清除舊金鑰（謹慎！）
   git filter-repo --invert-paths --path .env.local
   
   # 或使用 BFG（更簡單）
   bfg --delete-files .env.local
   
   # 強制推送（如果公開則警告所有開發者）
   git push --force-with-lease
   ```

6. **驗證**
   ```bash
   npm run dev
   # 確認登入和預約流程仍正常工作
   ```

**驗證檢查清單:**
- [ ] 新 API key 在 `.env.local` 中
- [ ] Git 歷史不再包含舊 key
- [ ] 應用能正常連接 Supabase
- [ ] 老 key 已在 Dashboard 中禁用

**時間:** 10-15 分鐘  
**負責人:** 開發團隊

---

### Task 1.2: 修復 Storage Bucket RLS 策略

**目標:** 限制認證用戶只能上傳自己店家的資源

**步驟:**

1. **登入 Supabase SQL Editor**
   ```
   https://app.supabase.com → Projects → SQL Editor
   ```

2. **執行修復 SQL**
   
   複製以下 SQL 到 SQL Editor 並執行：

   ```sql
   -- ════════════════════════════════════════════════════════════════════════
   -- 修復 Storage Bucket RLS 策略
   -- ════════════════════════════════════════════════════════════════════════
   
   -- 步驟 1: 清除舊的不安全策略
   DROP POLICY IF EXISTS "auth upload store assets"   ON storage.objects;
   DROP POLICY IF EXISTS "auth update store assets"   ON storage.objects;
   DROP POLICY IF EXISTS "auth delete store assets"   ON storage.objects;
   DROP POLICY IF EXISTS "public read store assets"   ON storage.objects;
   
   -- 步驟 2: 建立安全的路徑隔離策略
   
   -- 上傳：只允許上傳至 logos/{own_store_id}.* 路徑
   CREATE POLICY "auth upload store assets"
     ON storage.objects FOR INSERT TO authenticated
     WITH CHECK (
       bucket_id = 'store-assets'
       AND name LIKE (
         'logos/' || 
         (SELECT store_id FROM users WHERE id = auth.uid())::text || 
         '.%'
       )
     );
   
   -- 更新：只允許更新自己店的文件
   CREATE POLICY "auth update store assets"
     ON storage.objects FOR UPDATE TO authenticated
     USING (
       bucket_id = 'store-assets'
       AND name LIKE (
         'logos/' || 
         (SELECT store_id FROM users WHERE id = auth.uid())::text || 
         '.%'
       )
     );
   
   -- 刪除：只允許刪除自己店的文件
   CREATE POLICY "auth delete store assets"
     ON storage.objects FOR DELETE TO authenticated
     USING (
       bucket_id = 'store-assets'
       AND name LIKE (
         'logos/' || 
         (SELECT store_id FROM users WHERE id = auth.uid())::text || 
         '.%'
       )
     );
   
   -- 公開讀取：所有人都可以讀取（預期行為）
   CREATE POLICY "public read store assets"
     ON storage.objects FOR SELECT TO public
     USING (bucket_id = 'store-assets');
   
   -- 步驟 3: 驗證策略已應用
   SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%store assets%';
   ```

3. **驗證策略是否有效**

   在 SQL Editor 執行以下測試查詢（注意不要實際修改資料）：

   ```sql
   -- 檢查策略是否存在
   SELECT policy_name, definition
   FROM pg_policies
   WHERE tablename = 'objects'
     AND policy_name ILIKE '%store asset%';
   ```

4. **手動測試上傳**
   - 以管理員身份登入前端
   - 嘗試上傳一個新 LOGO
   - 驗證文件保存在 `logos/{store_id}.{ext}`
   - 嘗試（手動或用 curl）上傳到其他路徑，應被拒絕

   ```bash
   # 測試未授權上傳（應返回 403）
   curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -H "Bucket: store-assets" \
     -H "upsert: false" \
     -F "file=@test.png" \
     'https://YOUR-PROJECT.supabase.co/storage/v1/object/store-assets/logos/other-store-id.png'
   # 應該返回 403 Forbidden
   ```

**驗證檢查清單:**
- [ ] SQL 執行成功，無錯誤
- [ ] `pg_policies` 查詢顯示 4 個新策略
- [ ] 前端 LOGO 上傳仍正常工作
- [ ] 手動上傳測試返回 403

**時間:** 15-20 分鐘  
**負責人:** 數據庫管理員

---

## Phase 2: HIGH — 本周內完成

### Task 2.1: 移除 p_store_id 參數並硬編碼店家 ID

**目標:** 防止客戶端修改店家 ID 導致的權限提升

**步驟:**

1. **檢查當前函數簽名**
   ```bash
   cd /Users/CL/Documents/預約系統
   grep -n "p_store_id" supabase/migrations/*.sql
   ```

2. **創建新的遷移檔案**
   ```bash
   cat > supabase/migrations/010_security_store_id_hardcode.sql << 'EOF'
   -- ════════════════════════════════════════════════════════════════════════
   -- 安全修復：硬編碼店家 ID，移除 SECURITY DEFINER 函數的參數洞口
   -- ════════════════════════════════════════════════════════════════════════
   
   -- 修改 get_available_slots：移除 p_store_id 參數
   CREATE OR REPLACE FUNCTION get_available_slots(
     p_date            DATE,
     p_service_id      UUID,
     p_practitioner_id UUID DEFAULT NULL
     -- ✅ 移除: p_store_id UUID DEFAULT '...'
   )
   RETURNS TABLE (
     slot_time          TEXT,
     practitioner_id    UUID,
     practitioner_name  TEXT,
     practitioner_color TEXT
   )
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     v_open_time  TIME;
     v_close_time TIME;
     v_duration   INT;
     v_buffer     INT;
     v_tz         TEXT        := 'Asia/Taipei';
     v_min_ts     TIMESTAMPTZ := NOW() + INTERVAL '2 hours';
     v_max_date   DATE        := (NOW() + INTERVAL '2 months')::DATE;
     v_store_id   UUID        := '00000000-0000-0000-0000-000000000001';  -- ✅ 硬編碼
   BEGIN
     -- 日期範圍檢查
     IF p_date < NOW() AT TIME ZONE v_tz AT TIME ZONE 'UTC' OR p_date > v_max_date THEN
       RETURN;
     END IF;
   
     -- 取得店家設定
     SELECT open_time, close_time, default_buffer_minutes
     INTO   v_open_time, v_close_time, v_buffer
     FROM   stores
     WHERE  id = v_store_id;
   
     IF NOT FOUND THEN RETURN; END IF;
   
     -- ... 其餘邏輯保持不變
   END;
   $$;
   
   GRANT EXECUTE ON FUNCTION get_available_slots TO anon, authenticated;
   
   -- 修改 create_booking_public：移除 p_store_id 參數
   CREATE OR REPLACE FUNCTION create_booking_public(
     p_full_name       TEXT,
     p_phone           TEXT,
     p_service_id      UUID,
     p_practitioner_id UUID,
     p_start_time      TIMESTAMPTZ,
     p_notes           TEXT DEFAULT NULL
     -- ✅ 移除: p_store_id UUID DEFAULT '...'
   )
   RETURNS JSON
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     v_client_id UUID;
     v_duration  INT;
     v_buffer    INT;
     v_end_time  TIMESTAMPTZ;
     v_result    JSON;
     v_store_id  UUID := '00000000-0000-0000-0000-000000000001';  -- ✅ 硬編碼
   BEGIN
     -- 基本驗證
     IF trim(p_full_name) = '' OR trim(p_phone) = '' THEN
       RETURN json_build_object('ok', false, 'error', 'MISSING_INFO');
     END IF;
   
     -- 取得服務時長
     SELECT duration_minutes INTO v_duration
     FROM services WHERE id = p_service_id AND active = TRUE AND store_id = v_store_id;
     IF NOT FOUND THEN
       RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
     END IF;
   
     -- 取得店家預設緩衝
     SELECT default_buffer_minutes INTO v_buffer
     FROM stores WHERE id = v_store_id;
   
     -- 計算結束時間
     v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;
   
     -- 找或建客戶
     SELECT id INTO v_client_id
     FROM clients
     WHERE phone = trim(p_phone) AND store_id = v_store_id
     LIMIT 1;
   
     IF NOT FOUND THEN
       INSERT INTO clients (full_name, phone, store_id)
       VALUES (trim(p_full_name), trim(p_phone), v_store_id)
       RETURNING id INTO v_client_id;
     ELSE
       UPDATE clients SET full_name = trim(p_full_name) WHERE id = v_client_id;
     END IF;
   
     -- 建立預約
     SELECT upsert_booking(
       NULL,
       v_client_id,
       p_practitioner_id,
       p_service_id,
       p_start_time,
       v_end_time,
       v_buffer,
       p_notes,
       v_store_id
     ) INTO v_result;
   
     RETURN v_result;
   END;
   $$;
   
   GRANT EXECUTE ON FUNCTION create_booking_public TO anon, authenticated;
   
   -- 文檔：此函數的安全性
   COMMENT ON FUNCTION get_available_slots IS
   '安全邊界：此函數以 SECURITY DEFINER 執行，硬編碼服務單一店家（ID: 00000000-0000-0000-0000-000000000001）。
   客戶端無法通過參數修改店家 ID。所有輸入都受到驗證。';
   
   COMMENT ON FUNCTION create_booking_public IS
   '安全邊界：此函數以 SECURITY DEFINER 執行，硬編碼服務單一店家（ID: 00000000-0000-0000-0000-000000000001）。
   客戶端無法通過參數修改店家 ID。僅 anon 和 authenticated 角色可以呼叫。';
   EOF
   ```

3. **在 Supabase 執行遷移**
   - 複製上述 SQL 到 SQL Editor
   - 執行

4. **更新前端 JavaScript 程式碼**

   修改 `src/pages/booking/BookingPage.tsx` 和任何其他調用這些函數的地方：

   ```typescript
   // ❌ 舊的呼叫方式（帶 p_store_id）
   const { data: slots } = await supabase.rpc('get_available_slots', {
     p_date: selectedDate,
     p_service_id: serviceId,
     p_store_id: '00000000-0000-0000-0000-000000000001',
   })
   
   // ✅ 新的呼叫方式（沒有 p_store_id）
   const { data: slots } = await supabase.rpc('get_available_slots', {
     p_date: selectedDate,
     p_service_id: serviceId,
     // p_store_id 已被移除，函數內部硬編碼
   })
   
   // ❌ 舊的呼叫方式（create_booking_public）
   const { data } = await supabase.rpc('create_booking_public', {
     p_full_name: clientName,
     p_phone: clientPhone,
     p_service_id: serviceId,
     p_practitioner_id: practitionerId,
     p_start_time: startTime,
     p_store_id: '00000000-0000-0000-0000-000000000001',
   })
   
   // ✅ 新的呼叫方式
   const { data } = await supabase.rpc('create_booking_public', {
     p_full_name: clientName,
     p_phone: clientPhone,
     p_service_id: serviceId,
     p_practitioner_id: practitionerId,
     p_start_time: startTime,
     // p_store_id 已被移除
   })
   ```

5. **執行回歸測試**
   ```bash
   npm run dev
   
   # 測試項目：
   # 1. 客戶預約頁 - 選擇日期、查看時段、完成預約
   # 2. 驗證預約出現在管理後台
   # 3. 驗證預約的店家 ID 正確
   ```

**驗證檢查清單:**
- [ ] 新遷移 SQL 執行成功
- [ ] 函數簽名不再包含 `p_store_id`
- [ ] 前端程式碼已更新
- [ ] 客戶預約流程仍正常
- [ ] 所有預約的店家 ID 正確

**時間:** 45 分鐘 - 1 小時  
**負責人:** 開發團隊

---

### Task 2.2: 添加輸入驗證和長度約束

**目標:** 防止 DoS、XSS 和數據完整性問題

**步驟:**

1. **創建新的遷移檔案**

   ```bash
   cat > supabase/migrations/011_security_input_validation.sql << 'EOF'
   -- ════════════════════════════════════════════════════════════════════════
   -- 安全加強：添加輸入驗證約束
   -- ════════════════════════════════════════════════════════════════════════
   
   -- ── clients 表：添加長度和格式檢查 ──
   ALTER TABLE clients
     DROP CONSTRAINT IF EXISTS clients_full_name_length,
     DROP CONSTRAINT IF EXISTS clients_phone_length,
     DROP CONSTRAINT IF EXISTS clients_email_valid,
     DROP CONSTRAINT IF EXISTS clients_notes_length;
   
   ALTER TABLE clients
     ADD CONSTRAINT clients_full_name_length
       CHECK (char_length(full_name) BETWEEN 1 AND 100),
     ADD CONSTRAINT clients_phone_length
       CHECK (char_length(phone) BETWEEN 7 AND 20),
     ADD CONSTRAINT clients_email_valid
       CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
     ADD CONSTRAINT clients_notes_length
       CHECK (char_length(COALESCE(notes, '')) <= 500);
   
   -- ── services 表：添加驗證 ──
   ALTER TABLE services
     DROP CONSTRAINT IF EXISTS services_name_length,
     DROP CONSTRAINT IF EXISTS services_description_length,
     DROP CONSTRAINT IF EXISTS services_duration_positive,
     DROP CONSTRAINT IF EXISTS services_price_non_negative;
   
   ALTER TABLE services
     ADD CONSTRAINT services_name_length
       CHECK (char_length(name) BETWEEN 1 AND 100),
     ADD CONSTRAINT services_description_length
       CHECK (char_length(COALESCE(description, '')) <= 1000),
     ADD CONSTRAINT services_duration_positive
       CHECK (duration_minutes > 0 AND duration_minutes <= 480),  -- 最多 8 小時
     ADD CONSTRAINT services_price_non_negative
       CHECK (price >= 0 AND price <= 99999);  -- 最多 $99,999
   
   -- ── practitioners 表：添加驗證 ──
   ALTER TABLE practitioners
     DROP CONSTRAINT IF EXISTS practitioners_full_name_length,
     DROP CONSTRAINT IF EXISTS practitioners_title_length,
     DROP CONSTRAINT IF EXISTS practitioners_phone_length,
     DROP CONSTRAINT IF EXISTS practitioners_color_valid;
   
   ALTER TABLE practitioners
     ADD CONSTRAINT practitioners_full_name_length
       CHECK (char_length(full_name) BETWEEN 1 AND 100),
     ADD CONSTRAINT practitioners_title_length
       CHECK (char_length(COALESCE(title, '')) <= 50),
     ADD CONSTRAINT practitioners_phone_length
       CHECK (char_length(COALESCE(phone, '')) <= 20),
     ADD CONSTRAINT practitioners_color_valid
       CHECK (color ~ '^#[0-9A-Fa-f]{6}$');  -- 有效 HEX 顏色
   
   -- ── bookings 表：添加驗證 ──
   ALTER TABLE bookings
     DROP CONSTRAINT IF EXISTS bookings_time_valid,
     DROP CONSTRAINT IF EXISTS bookings_notes_length,
     DROP CONSTRAINT IF EXISTS bookings_price_non_negative;
   
   ALTER TABLE bookings
     ADD CONSTRAINT bookings_time_valid
       CHECK (end_time > start_time),
     ADD CONSTRAINT bookings_notes_length
       CHECK (char_length(COALESCE(notes, '')) <= 500),
     ADD CONSTRAINT bookings_price_non_negative
       CHECK (price >= 0 AND price <= 99999);
   
   -- ── 更新函數驗證邏輯 ──
   CREATE OR REPLACE FUNCTION create_booking_public(
     p_full_name       TEXT,
     p_phone           TEXT,
     p_service_id      UUID,
     p_practitioner_id UUID,
     p_start_time      TIMESTAMPTZ,
     p_notes           TEXT DEFAULT NULL
   )
   RETURNS JSON
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     v_client_id UUID;
     v_duration  INT;
     v_buffer    INT;
     v_end_time  TIMESTAMPTZ;
     v_result    JSON;
     v_store_id  UUID := '00000000-0000-0000-0000-000000000001';
   BEGIN
     -- 步驟 1: 輸入清理
     p_full_name := trim(p_full_name);
     p_phone := trim(p_phone);
     p_notes := trim(COALESCE(p_notes, ''));
   
     -- 步驟 2: 驗證輸入長度
     IF char_length(p_full_name) < 1 OR char_length(p_full_name) > 100 THEN
       RETURN json_build_object('ok', false, 'error', 'INVALID_NAME_LENGTH');
     END IF;
   
     -- 步驟 3: 驗證電話格式（只允許數字、+、-、()、空格）
     IF NOT (p_phone ~ '^[+]?[\d\s\-().]{6,19}$') THEN
       RETURN json_build_object('ok', false, 'error', 'INVALID_PHONE_FORMAT');
     END IF;
   
     -- 步驟 4: 驗證備註長度
     IF char_length(p_notes) > 500 THEN
       RETURN json_build_object('ok', false, 'error', 'NOTES_TOO_LONG');
     END IF;
   
     -- 步驟 5: 驗證時間
     IF p_start_time <= NOW() THEN
       RETURN json_build_object('ok', false, 'error', 'TIME_IN_PAST');
     END IF;
   
     IF p_start_time > NOW() + INTERVAL '2 months' THEN
       RETURN json_build_object('ok', false, 'error', 'TIME_TOO_FAR_FUTURE');
     END IF;
   
     -- 取得服務時長
     SELECT duration_minutes INTO v_duration
     FROM services 
     WHERE id = p_service_id 
       AND active = TRUE
       AND store_id = v_store_id;
     IF NOT FOUND THEN
       RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
     END IF;
   
     -- 取得店家預設緩衝
     SELECT default_buffer_minutes INTO v_buffer
     FROM stores WHERE id = v_store_id;
   
     -- 計算結束時間
     v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;
   
     -- 找或建客戶（電話是唯一鍵）
     SELECT id INTO v_client_id
     FROM clients
     WHERE phone = p_phone AND store_id = v_store_id
     LIMIT 1;
   
     IF NOT FOUND THEN
       INSERT INTO clients (full_name, phone, store_id)
       VALUES (p_full_name, p_phone, v_store_id)
       RETURNING id INTO v_client_id;
     ELSE
       -- 更新姓名
       UPDATE clients SET full_name = p_full_name WHERE id = v_client_id;
     END IF;
   
     -- 建立預約
     SELECT upsert_booking(
       NULL,
       v_client_id,
       p_practitioner_id,
       p_service_id,
       p_start_time,
       v_end_time,
       v_buffer,
       p_notes,
       v_store_id
     ) INTO v_result;
   
     RETURN v_result;
   END;
   $$;
   
   GRANT EXECUTE ON FUNCTION create_booking_public TO anon, authenticated;
   EOF
   ```

2. **在 Supabase 執行遷移**
   - 複製上述 SQL 到 SQL Editor 並執行

3. **更新 React 前端驗證** （新增客戶端驗證層）

   創建或更新 `src/lib/validation.ts`：

   ```typescript
   // src/lib/validation.ts
   
   export interface ValidationResult {
     valid: boolean
     errors: Record<string, string>
   }
   
   export function validateClientName(name: string): string | null {
     const trimmed = name.trim()
     if (!trimmed) return '名字不能為空'
     if (trimmed.length > 100) return '名字不能超過 100 字'
     return null
   }
   
   export function validatePhone(phone: string): string | null {
     const trimmed = phone.trim()
     if (!trimmed) return '電話不能為空'
     if (trimmed.length < 7) return '電話至少需要 7 個字符'
     if (trimmed.length > 20) return '電話不能超過 20 個字符'
     if (!/^[+]?[\d\s\-().]{6,19}$/.test(trimmed)) {
       return '電話格式不正確（只允許數字、+、-、()、空格）'
     }
     return null
   }
   
   export function validateNotes(notes: string | null): string | null {
     if (!notes) return null
     const trimmed = notes.trim()
     if (trimmed.length > 500) return '備註不能超過 500 字'
     return null
   }
   
   export function validateBookingForm(
     name: string,
     phone: string,
     notes?: string
   ): ValidationResult {
     const errors: Record<string, string> = {}
   
     const nameError = validateClientName(name)
     if (nameError) errors.name = nameError
   
     const phoneError = validatePhone(phone)
     if (phoneError) errors.phone = phoneError
   
     const notesError = validateNotes(notes || null)
     if (notesError) errors.notes = notesError
   
     return {
       valid: Object.keys(errors).length === 0,
       errors,
     }
   }
   ```

   在 `BookingPage.tsx` 中使用：

   ```typescript
   import { validateBookingForm } from '../../lib/validation'
   
   export default function BookingPage() {
     const [fullName, setFullName] = useState('')
     const [phone, setPhone] = useState('')
     const [notes, setNotes] = useState('')
     const [errors, setErrors] = useState<Record<string, string>>({})
   
     async function handleSubmit() {
       const validation = validateBookingForm(fullName, phone, notes)
       
       if (!validation.valid) {
         setErrors(validation.errors)
         toast.error('輸入有誤', '請檢查表單並重試')
         return
       }
   
       // 提交預約
       const { data } = await supabase.rpc('create_booking_public', {
         p_full_name: fullName,
         p_phone: phone,
         p_service_id: selectedServiceId,
         p_practitioner_id: selectedPractitionerId,
         p_start_time: selectedStartTime,
         p_notes: notes,
       })
       
       // ... 處理回應
     }
   
     return (
       <form>
         <div>
           <label>姓名</label>
           <input
             value={fullName}
             onChange={(e) => {
               setFullName(e.target.value)
               setErrors((prev) => ({ ...prev, name: '' }))
             }}
             maxLength={100}
             aria-invalid={!!errors.name}
             aria-describedby={errors.name ? 'name-error' : undefined}
           />
           {errors.name && (
             <p id="name-error" style={{ color: 'red' }}>{errors.name}</p>
           )}
         </div>
   
         <div>
           <label>電話</label>
           <input
             value={phone}
             onChange={(e) => {
               setPhone(e.target.value)
               setErrors((prev) => ({ ...prev, phone: '' }))
             }}
             maxLength={20}
             placeholder="09xx-xxx-xxx"
             aria-invalid={!!errors.phone}
             aria-describedby={errors.phone ? 'phone-error' : undefined}
           />
           {errors.phone && (
             <p id="phone-error" style={{ color: 'red' }}>{errors.phone}</p>
           )}
         </div>
   
         <div>
           <label>備註（選填）</label>
           <textarea
             value={notes}
             onChange={(e) => {
               setNotes(e.target.value)
               setErrors((prev) => ({ ...prev, notes: '' }))
             }}
             maxLength={500}
             aria-invalid={!!errors.notes}
             aria-describedby={errors.notes ? 'notes-error' : undefined}
           />
           {errors.notes && (
             <p id="notes-error" style={{ color: 'red' }}>{errors.notes}</p>
           )}
         </div>
   
         <button onClick={handleSubmit}>確認預約</button>
       </form>
     )
   }
   ```

4. **測試驗證**
   ```bash
   npm run dev
   
   # 測試項目：
   # 1. 輸入超長名字 → 應被拒絕（客戶端 + 數據庫約束）
   # 2. 輸入無效電話 → 應被拒絕
   # 3. 輸入超長備註 → 應被拒絕
   # 4. 正常輸入 → 應成功預約
   ```

**驗證檢查清單:**
- [ ] SQL 約束已添加
- [ ] 所有 CHECK 約束驗證成功
- [ ] 前端驗證已實施
- [ ] 雙層驗證（客戶端 + 服務器）正常工作
- [ ] 預約流程仍正常

**時間:** 2-3 小時  
**負責人:** 開發團隊

---

## Phase 3: MEDIUM — 本月內完成

### Task 3.1: 修復 RLS 策略

**目標:** 為 `practitioner_blocks` 表添加缺失的 RLS 策略

**步驟:**

1. **創建遷移檔案**

   ```bash
   cat > supabase/migrations/012_security_practitioner_blocks_rls.sql << 'EOF'
   -- ════════════════════════════════════════════════════════════════════════
   -- 修復：為 practitioner_blocks 表添加 RLS 策略
   -- ════════════════════════════════════════════════════════════════════════
   
   -- 確保表啟用 RLS
   ALTER TABLE practitioner_blocks ENABLE ROW LEVEL SECURITY;
   
   -- 清除舊策略（如果存在）
   DROP POLICY IF EXISTS "blocks_admin_all"              ON practitioner_blocks;
   DROP POLICY IF EXISTS "blocks_member_read_own"        ON practitioner_blocks;
   DROP POLICY IF EXISTS "blocks_admin_write"            ON practitioner_blocks;
   DROP POLICY IF EXISTS "blocks_member_write_own"       ON practitioner_blocks;
   
   -- ── 讀取策略 ──
   
   -- 管理員可讀取所有封鎖時段
   CREATE POLICY "blocks_admin_read"
     ON practitioner_blocks FOR SELECT
     TO authenticated
     USING (
       store_id = current_store_id()
       AND is_admin()
     );
   
   -- 一般成員只能讀取自己的封鎖時段
   CREATE POLICY "blocks_member_read_own"
     ON practitioner_blocks FOR SELECT
     TO authenticated
     USING (
       store_id = current_store_id()
       AND practitioner_id = current_practitioner_id()
     );
   
   -- ── 寫入策略（只有管理員可以修改） ──
   
   -- 管理員可以新增封鎖時段
   CREATE POLICY "blocks_admin_insert"
     ON practitioner_blocks FOR INSERT
     TO authenticated
     WITH CHECK (
       store_id = current_store_id()
       AND is_admin()
     );
   
   -- 管理員可以修改封鎖時段
   CREATE POLICY "blocks_admin_update"
     ON practitioner_blocks FOR UPDATE
     TO authenticated
     USING (
       store_id = current_store_id()
       AND is_admin()
     )
     WITH CHECK (
       store_id = current_store_id()
       AND is_admin()
     );
   
   -- 管理員可以刪除封鎖時段
   CREATE POLICY "blocks_admin_delete"
     ON practitioner_blocks FOR DELETE
     TO authenticated
     USING (
       store_id = current_store_id()
       AND is_admin()
     );
   
   -- 檢查 notification_settings 和 notification_templates 也有 RLS
   -- （它們在原遷移 001 中已定義，但驗證一下）
   ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
   ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
   EOF
   ```

2. **在 Supabase 執行遷移**

3. **驗證 RLS 策略**

   ```sql
   -- 檢查所有表的 RLS 啟用狀態
   SELECT
     schemaname,
     tablename,
     rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   
   -- 檢查所有 RLS 策略
   SELECT
     schemaname,
     tablename,
     policyname
   FROM pg_policies
   ORDER BY tablename, policyname;
   ```

**時間:** 1 小時  
**負責人:** 數據庫管理員

---

### Task 3.2: 實施審計日誌系統

**目標:** 記錄所有關鍵操作便於審計和事件調查

**步驟:** （詳見 SECURITY_REVIEW.md 第 6 項）

**時間:** 3-4 小時  
**負責人:** 開發團隊 + 數據庫管理員

---

### Task 3.3: 實施速率限制

**目標:** 防止濫用和 DoS 攻擊

**步驟:** （詳見 SECURITY_REVIEW.md 第 7 項）

**時間:** 2-3 小時  
**負責人:** 開發團隊

---

## 執行進度追蹤

```markdown
# Phase 1: CRITICAL
- [x] Task 1.1: 重新生成 API 金鑰
- [x] Task 1.2: 修復 Storage Bucket RLS

# Phase 2: HIGH
- [ ] Task 2.1: 移除 p_store_id 參數
- [ ] Task 2.2: 添加輸入驗證

# Phase 3: MEDIUM
- [ ] Task 3.1: 修復 RLS 策略
- [ ] Task 3.2: 實施審計日誌
- [ ] Task 3.3: 實施速率限制
```

---

## 測試計畫

### 單元測試
```bash
npm test
# 驗證客戶端驗證邏輯
```

### 集成測試
```bash
# 1. 客戶預約流程
npm run dev
# 測試完整的預約流程，驗證所有驗證層

# 2. 權限隔離測試
# 創建多個用戶帳號，驗證 RLS 隔離
# 嘗試跨店家訪問數據，應被拒絕
```

### 安全掃描
```bash
# 依賴漏洞掃描
npm audit
bunx audit

# 代碼靜態分析
npm run lint

# SQL 注入測試（手動）
# 嘗試在各個輸入字段注入 SQL，應被拒絕
```

---

## 發佈檢查清單

在部署到生產前：

- [ ] 所有 CRITICAL 項目已完成
- [ ] 所有 HIGH 項目已完成
- [ ] 單元測試通過 ✅
- [ ] 集成測試通過 ✅
- [ ] 安全掃描無重大問題 ✅
- [ ] 代碼審查通過 ✅
- [ ] 備份數據庫 ✅
- [ ] 備份計劃已制定 ✅
- [ ] 監控告警已配置 ✅

---

## 後續維護

### 定期檢查（每月）
- [ ] 檢查審計日誌是否有異常活動
- [ ] 更新依賴包
- [ ] 檢查 Supabase 安全建議

### 季度審計（每 3 個月）
- [ ] 完整的安全審計
- [ ] RLS 策略審查
- [ ] API 金鑰輪換（可選）

### 年度審計（每 12 個月）
- [ ] 完整的滲透測試
- [ ] 架構安全審查
- [ ] 合規性檢查

---

**文件版本:** 1.0  
**最後更新:** 2026-06-03  
**下次審查:** 2026-06-10
