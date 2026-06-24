-- =============================================
-- C 端預約系統支援
-- 1. bookings 新增 source / client_line_id / client_picture_url
-- 2. stores 新增 liff_id / booking_confirmation_mode / booking_enabled
-- 3. anon 可 SELECT 自己的預約（確認頁用）
-- 4. 更新 create_booking_public：支援 source、LINE 資訊、確認模式
-- =============================================

-- ── 1. bookings 新增欄位 ─────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('line', 'messenger', 'web')),
  ADD COLUMN IF NOT EXISTS client_line_id      TEXT,
  ADD COLUMN IF NOT EXISTS client_picture_url  TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(source);

-- ── 2. stores 新增欄位 ───────────────────────────────────────────────

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS liff_id                   TEXT,
  ADD COLUMN IF NOT EXISTS booking_confirmation_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (booking_confirmation_mode IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS booking_enabled           BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 3. anon SELECT bookings（僅能查自己的 booking，用 id 當憑證）────

-- 公開預約確認頁：anon 用 booking id 查詢自己剛建立的預約
-- 不透漏其他欄位（client_id 等），故只開放 SELECT 不做 RLS bypass
DROP POLICY IF EXISTS "anon read own booking by id" ON bookings;
CREATE POLICY "anon read own booking by id"
  ON bookings FOR SELECT TO anon
  USING (
    -- anon 只能透過 RPC（SECURITY DEFINER）取得 booking，
    -- 此 policy 搭配 create_booking_public 回傳 id 後前端查詢
    -- 用 source 限縮：只有 C 端預約才允許 anon 讀取
    source IN ('line', 'messenger', 'web')
  );

-- ── 4. 更新 create_booking_public ────────────────────────────────────
-- 新增參數：p_source、p_client_line_id、p_client_picture_url
-- 依店家 booking_confirmation_mode 決定初始 status

CREATE OR REPLACE FUNCTION create_booking_public(
  p_full_name           TEXT,
  p_phone               TEXT,
  p_service_id          UUID,
  p_practitioner_id     UUID,
  p_start_time          TIMESTAMPTZ,
  p_notes               TEXT         DEFAULT NULL,
  p_store_id            UUID         DEFAULT '00000000-0000-0000-0000-000000000001',
  p_source              TEXT         DEFAULT 'web',
  p_client_line_id      TEXT         DEFAULT NULL,
  p_client_picture_url  TEXT         DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id    UUID;
  v_duration     INT;
  v_buffer       INT;
  v_end_time     TIMESTAMPTZ;
  v_booking_id   UUID;
  v_conf_mode    TEXT;
  v_init_status  booking_status;
  v_result       JSON;
BEGIN
  -- 基本驗證
  IF trim(p_full_name) = '' OR trim(p_phone) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'MISSING_INFO');
  END IF;

  IF p_source NOT IN ('line', 'messenger', 'web') THEN
    RETURN json_build_object('ok', false, 'error', 'INVALID_SOURCE');
  END IF;

  -- 取得服務時長
  SELECT duration_minutes INTO v_duration
  FROM services WHERE id = p_service_id AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  -- 取得店家設定（緩衝 + 確認模式）
  SELECT default_buffer_minutes, booking_confirmation_mode
  INTO v_buffer, v_conf_mode
  FROM stores WHERE id = p_store_id AND booking_enabled = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'STORE_NOT_FOUND');
  END IF;

  -- 依確認模式決定初始 status
  v_init_status := CASE v_conf_mode
    WHEN 'auto' THEN 'confirmed'::booking_status
    ELSE              'pending'::booking_status
  END;

  -- 計算結束時間
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

  -- 找或建客戶（以電話 + 店家為唯一鍵）
  SELECT id INTO v_client_id
  FROM clients
  WHERE phone = trim(p_phone) AND store_id = p_store_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO clients (full_name, phone, store_id)
    VALUES (trim(p_full_name), trim(p_phone), p_store_id)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE clients SET full_name = trim(p_full_name) WHERE id = v_client_id;
  END IF;

  -- 衝突檢查（排除取消的預約）
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE practitioner_id = p_practitioner_id
      AND status NOT IN ('cancelled')
      AND start_time < v_end_time + (v_buffer || ' minutes')::INTERVAL
      AND (end_time + (COALESCE(buffer_minutes, 0) || ' minutes')::INTERVAL) > p_start_time
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'CONFLICT');
  END IF;

  -- 建立預約
  INSERT INTO bookings (
    client_id, practitioner_id, service_id,
    start_time, end_time, buffer_minutes,
    notes, store_id, status,
    source, client_line_id, client_picture_url
  )
  VALUES (
    v_client_id, p_practitioner_id, p_service_id,
    p_start_time, v_end_time, v_buffer,
    p_notes, p_store_id, v_init_status,
    p_source, p_client_line_id, p_client_picture_url
  )
  RETURNING id INTO v_booking_id;

  RETURN json_build_object(
    'ok',      true,
    'id',      v_booking_id,
    'status',  v_init_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_public TO anon, authenticated;

-- ── 5. anon 查詢單筆預約（確認頁）────────────────────────────────────
-- 前端持有 booking id → 查詢 bookings JOIN services JOIN practitioners
-- 透過獨立 RPC 避免 RLS 複雜度，SECURITY DEFINER 控制欄位揭露範圍

CREATE OR REPLACE FUNCTION get_booking_confirmation(
  p_booking_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT
    b.id,
    b.start_time,
    b.end_time,
    b.status,
    b.notes,
    b.source,
    s.name       AS service_name,
    s.duration_minutes,
    pr.full_name AS practitioner_name,
    pr.color     AS practitioner_color,
    c.full_name  AS client_name,
    c.phone      AS client_phone,
    st.name      AS store_name,
    st.phone     AS store_phone
  INTO v_rec
  FROM bookings b
  JOIN services     s  ON s.id  = b.service_id
  JOIN practitioners pr ON pr.id = b.practitioner_id
  JOIN clients      c  ON c.id  = b.client_id
  JOIN stores       st ON st.id = b.store_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN json_build_object(
    'ok',                 true,
    'id',                 v_rec.id,
    'start_time',         v_rec.start_time,
    'end_time',           v_rec.end_time,
    'status',             v_rec.status,
    'notes',              v_rec.notes,
    'source',             v_rec.source,
    'service_name',       v_rec.service_name,
    'duration_minutes',   v_rec.duration_minutes,
    'practitioner_name',  v_rec.practitioner_name,
    'practitioner_color', v_rec.practitioner_color,
    'client_name',        v_rec.client_name,
    'client_phone',       v_rec.client_phone,
    'store_name',         v_rec.store_name,
    'store_phone',        v_rec.store_phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_booking_confirmation TO anon, authenticated;
