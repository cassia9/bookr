-- =============================================
-- upsert_booking RPC
-- 統一建立 / 更新預約入口，含衝突檢查
--
-- 回傳 JSON:
--   { ok: true,  id: UUID }
--   { ok: false, error: 'TIME_CONFLICT',
--     conflict: { id, start_time, end_time, buffer_minutes,
--                 client_name, service_name } }
-- =============================================

CREATE OR REPLACE FUNCTION upsert_booking(
  p_booking_id       UUID,          -- NULL = 建立新預約
  p_client_id        UUID,
  p_practitioner_id  UUID,
  p_service_id       UUID,
  p_start_time       TIMESTAMPTZ,
  p_end_time         TIMESTAMPTZ,
  p_buffer_minutes   INT DEFAULT 0,
  p_notes            TEXT DEFAULT NULL,
  p_store_id         UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_buffered_end TIMESTAMPTZ;
  v_conflict         RECORD;
  v_result_id        UUID;
BEGIN
  -- 新預約的緩衝時間結束點
  v_new_buffered_end := p_end_time + (p_buffer_minutes || ' minutes')::INTERVAL;

  -- 衝突檢查：
  --   同從業人員、非取消、非自己（編輯時）
  --   且 時間區段有重疊：
  --     existing.start_time < 我方緩衝結束
  --     AND (existing.end_time + existing.buffer) > 我方開始
  SELECT
    b.id,
    b.start_time,
    b.end_time,
    b.buffer_minutes,
    c.full_name  AS client_name,
    s.name       AS service_name
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

  IF p_booking_id IS NULL THEN
    -- 建立新預約
    INSERT INTO bookings (
      client_id, practitioner_id, service_id,
      start_time, end_time, buffer_minutes,
      status, notes, store_id
    ) VALUES (
      p_client_id, p_practitioner_id, p_service_id,
      p_start_time, p_end_time, p_buffer_minutes,
      'confirmed', p_notes, p_store_id
    )
    RETURNING id INTO v_result_id;
  ELSE
    -- 更新既有預約
    UPDATE bookings SET
      practitioner_id = p_practitioner_id,
      service_id      = p_service_id,
      start_time      = p_start_time,
      end_time        = p_end_time,
      buffer_minutes  = p_buffer_minutes,
      notes           = p_notes,
      updated_at      = NOW()
    WHERE id = p_booking_id;
    v_result_id := p_booking_id;
  END IF;

  RETURN json_build_object(
    'ok',      true,
    'id',      v_result_id,
    'error',   null,
    'conflict', null
  );
END;
$$;

-- 允許已驗證用戶呼叫（RLS 已在 bookings 表層保護資料）
GRANT EXECUTE ON FUNCTION upsert_booking TO authenticated;
