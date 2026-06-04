-- =============================================
-- 每筆預約的實收金額（可手動覆蓋服務定價）
-- =============================================

-- 1. bookings 加 price 欄位（預設 0，後端填入服務定價）
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0;

-- 2. 更新 upsert_booking，接受 p_price 參數
CREATE OR REPLACE FUNCTION upsert_booking(
  p_booking_id       UUID,
  p_client_id        UUID,
  p_practitioner_id  UUID,
  p_service_id       UUID,
  p_start_time       TIMESTAMPTZ,
  p_end_time         TIMESTAMPTZ,
  p_buffer_minutes   INT  DEFAULT 0,
  p_notes            TEXT DEFAULT NULL,
  p_store_id         UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_price            INT  DEFAULT NULL   -- NULL = 自動帶入服務定價
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_buffered_end TIMESTAMPTZ;
  v_conflict         RECORD;
  v_result_id        UUID;
  v_block_id         UUID;
  v_price            INT;
BEGIN
  -- 封鎖時段檢查
  SELECT id INTO v_block_id
  FROM practitioner_blocks
  WHERE practitioner_id = p_practitioner_id
    AND start_time < p_end_time + (p_buffer_minutes || ' minutes')::INTERVAL
    AND end_time   > p_start_time
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'PRACTITIONER_BLOCKED');
  END IF;

  -- 新預約的緩衝結束點
  v_new_buffered_end := p_end_time + (p_buffer_minutes || ' minutes')::INTERVAL;

  -- 衝突檢查
  SELECT
    b.id, b.start_time, b.end_time, b.buffer_minutes,
    c.full_name AS client_name,
    s.name      AS service_name
  INTO v_conflict
  FROM   bookings  b
  JOIN   clients   c ON c.id = b.client_id
  JOIN   services  s ON s.id = b.service_id
  WHERE  b.practitioner_id = p_practitioner_id
    AND  b.status NOT IN ('cancelled')
    AND  (p_booking_id IS NULL OR b.id <> p_booking_id)
    AND  b.start_time < v_new_buffered_end
    AND  (b.end_time + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL) > p_start_time
  ORDER  BY b.start_time
  LIMIT  1;

  IF FOUND THEN
    RETURN json_build_object(
      'ok',       false,
      'error',    'TIME_CONFLICT',
      'conflict', json_build_object(
        'id',             v_conflict.id,
        'start_time',     v_conflict.start_time,
        'end_time',       v_conflict.end_time,
        'buffer_minutes', v_conflict.buffer_minutes,
        'client_name',    v_conflict.client_name,
        'service_name',   v_conflict.service_name
      )
    );
  END IF;

  -- 決定實收金額：傳入 NULL 時自動帶入服務定價
  IF p_price IS NULL THEN
    SELECT price INTO v_price FROM services WHERE id = p_service_id;
    v_price := COALESCE(v_price, 0);
  ELSE
    v_price := p_price;
  END IF;

  IF p_booking_id IS NULL THEN
    INSERT INTO bookings (
      client_id, practitioner_id, service_id,
      start_time, end_time, buffer_minutes,
      price, status, notes, store_id
    ) VALUES (
      p_client_id, p_practitioner_id, p_service_id,
      p_start_time, p_end_time, p_buffer_minutes,
      v_price, 'confirmed', p_notes, p_store_id
    )
    RETURNING id INTO v_result_id;
  ELSE
    UPDATE bookings SET
      practitioner_id = p_practitioner_id,
      service_id      = p_service_id,
      start_time      = p_start_time,
      end_time        = p_end_time,
      buffer_minutes  = p_buffer_minutes,
      price           = v_price,
      notes           = p_notes,
      updated_at      = NOW()
    WHERE id = p_booking_id;
    v_result_id := p_booking_id;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_result_id, 'error', null, 'conflict', null);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_booking TO authenticated;
