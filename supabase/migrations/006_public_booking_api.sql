-- =============================================
-- 客戶公開預約 API
-- 1. get_available_slots  — 查詢可預約時段
-- 2. create_booking_public — 建立公開預約（含找/建客戶）
-- 3. 公開讀取 RLS（stores / services / practitioners）
-- =============================================

-- ── 公開讀取權限 ──────────────────────────────────────────────────────
-- anon key 可以讀取店家基本資訊、上架服務、啟用從業人員

DROP POLICY IF EXISTS "anon read stores"         ON stores;
DROP POLICY IF EXISTS "anon read services"        ON services;
DROP POLICY IF EXISTS "anon read practitioners"   ON practitioners;

CREATE POLICY "anon read stores"
  ON stores FOR SELECT TO anon USING (true);

CREATE POLICY "anon read services"
  ON services FOR SELECT TO anon USING (active = true);

CREATE POLICY "anon read practitioners"
  ON practitioners FOR SELECT TO anon USING (active = true);

-- ── get_available_slots ───────────────────────────────────────────────
-- 回傳指定日期可預約的時段清單（15 分鐘間隔）
-- 自動排除：非營業時間、封鎖時段、已有預約（含緩衝）
-- p_practitioner_id = NULL → 自動分配（依當日/當週預約量最少者）

CREATE OR REPLACE FUNCTION get_available_slots(
  p_date            DATE,
  p_service_id      UUID,
  p_practitioner_id UUID DEFAULT NULL,
  p_store_id        UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE (
  slot_time          TEXT,    -- "HH:MM" 當地時間
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
BEGIN
  -- 日期範圍檢查
  IF p_date < NOW() AT TIME ZONE v_tz AT TIME ZONE 'UTC' OR p_date > v_max_date THEN
    RETURN;
  END IF;

  -- 取得店家設定
  SELECT open_time, close_time, default_buffer_minutes
  INTO   v_open_time, v_close_time, v_buffer
  FROM   stores
  WHERE  id = p_store_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- 取得服務時長
  SELECT duration_minutes INTO v_duration
  FROM   services
  WHERE  id = p_service_id AND active = TRUE;

  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  WITH
  -- ① 產生所有 15 分鐘時段（開店到 close - duration 之間）
  raw_slots AS (
    SELECT
      gs                                        AS slot_ts,
      to_char(gs AT TIME ZONE v_tz, 'HH24:MI') AS slot_str
    FROM generate_series(
      (p_date::TEXT || ' ' || v_open_time::TEXT )::TIMESTAMP AT TIME ZONE v_tz,
      (p_date::TEXT || ' ' || v_close_time::TEXT)::TIMESTAMP AT TIME ZONE v_tz
        - (v_duration || ' minutes')::INTERVAL,
      '15 minutes'::INTERVAL
    ) gs
    -- 只保留距現在 2 小時以後的時段
    WHERE gs > v_min_ts
  ),

  -- ② 篩選從業人員
  active_pracs AS (
    SELECT id, full_name, color
    FROM   practitioners
    WHERE  store_id = p_store_id
      AND  active = TRUE
      AND  (p_practitioner_id IS NULL OR id = p_practitioner_id)
  ),

  -- ③ 時段 × 從業人員 組合
  candidates AS (
    SELECT r.slot_ts, r.slot_str, p.id AS prac_id, p.full_name, p.color
    FROM raw_slots r
    CROSS JOIN active_pracs p
  ),

  -- ④ 排除被封鎖的時段
  no_block AS (
    SELECT c.*
    FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM practitioner_blocks b
      WHERE b.practitioner_id = c.prac_id
        AND b.start_time < c.slot_ts + (v_duration || ' minutes')::INTERVAL
        AND b.end_time   > c.slot_ts
    )
  ),

  -- ⑤ 排除預約衝突（新預約含緩衝 vs 既有預約含其緩衝）
  no_conflict AS (
    SELECT nb.*
    FROM no_block nb
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings bk
      WHERE  bk.practitioner_id = nb.prac_id
        AND  bk.status NOT IN ('cancelled')
        AND  bk.start_time < nb.slot_ts + ((v_duration + v_buffer) || ' minutes')::INTERVAL
        AND  (bk.end_time  + (COALESCE(bk.buffer_minutes, 0) || ' minutes')::INTERVAL)
               > nb.slot_ts
    )
  ),

  -- ⑥ 計算當日 / 當週各從業人員預約量（自動分配排序用）
  -- 注意：加上表別名 bk 避免與 RETURNS TABLE 的 practitioner_id 欄位名稱衝突
  today_cnt AS (
    SELECT bk.practitioner_id, COUNT(*) AS cnt
    FROM   bookings bk
    WHERE  bk.store_id = p_store_id
      AND  bk.status NOT IN ('cancelled')
      AND  (bk.start_time AT TIME ZONE v_tz)::DATE = p_date
    GROUP BY bk.practitioner_id
  ),
  week_cnt AS (
    SELECT bk.practitioner_id, COUNT(*) AS cnt
    FROM   bookings bk
    WHERE  bk.store_id = p_store_id
      AND  bk.status NOT IN ('cancelled')
      AND  bk.start_time >= date_trunc('week', (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz)
      AND  bk.start_time <  date_trunc('week', (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz)
                          + INTERVAL '7 days'
    GROUP BY bk.practitioner_id
  ),

  -- ⑦ 每個時段選出最佳從業人員（自動分配：當日最少 → 當週最少 → id 排序）
  best AS (
    SELECT DISTINCT ON (nc.slot_ts)
      nc.slot_ts,
      nc.slot_str,
      nc.prac_id,
      nc.full_name,
      nc.color
    FROM no_conflict nc
    LEFT JOIN today_cnt tc ON tc.practitioner_id = nc.prac_id
    LEFT JOIN week_cnt  wc ON wc.practitioner_id = nc.prac_id
    ORDER BY
      nc.slot_ts,
      COALESCE(tc.cnt, 0) ASC,
      COALESCE(wc.cnt, 0) ASC,
      nc.prac_id  -- 最終 tiebreaker（保持一致性）
  )

  SELECT b.slot_str, b.prac_id, b.full_name, b.color
  FROM   best b
  ORDER  BY b.slot_ts;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_slots TO anon, authenticated;

-- ── create_booking_public ─────────────────────────────────────────────
-- 公開預約建立入口：找或建客戶 → 呼叫 upsert_booking
-- 回傳 JSON: { ok, id, error, conflict }

CREATE OR REPLACE FUNCTION create_booking_public(
  p_full_name       TEXT,
  p_phone           TEXT,
  p_service_id      UUID,
  p_practitioner_id UUID,
  p_start_time      TIMESTAMPTZ,
  p_notes           TEXT DEFAULT NULL,
  p_store_id        UUID DEFAULT '00000000-0000-0000-0000-000000000001'
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
BEGIN
  -- 基本驗證
  IF trim(p_full_name) = '' OR trim(p_phone) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'MISSING_INFO');
  END IF;

  -- 取得服務時長
  SELECT duration_minutes INTO v_duration
  FROM services WHERE id = p_service_id AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  -- 取得店家預設緩衝
  SELECT default_buffer_minutes INTO v_buffer
  FROM stores WHERE id = p_store_id;

  -- 計算結束時間
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

  -- 找或建客戶（以電話為唯一鍵）
  SELECT id INTO v_client_id
  FROM clients
  WHERE phone = trim(p_phone) AND store_id = p_store_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO clients (full_name, phone, store_id)
    VALUES (trim(p_full_name), trim(p_phone), p_store_id)
    RETURNING id INTO v_client_id;
  ELSE
    -- 更新姓名（客戶可能改名）
    UPDATE clients SET full_name = trim(p_full_name) WHERE id = v_client_id;
  END IF;

  -- 建立預約（含封鎖時段 + 衝突檢查）
  SELECT upsert_booking(
    NULL,              -- 新預約
    v_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    v_end_time,
    v_buffer,
    p_notes,
    p_store_id
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_public TO anon, authenticated;
