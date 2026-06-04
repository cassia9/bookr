-- =============================================
-- 從業人員封鎖時段
-- =============================================

-- 1. practitioner_blocks 表：從業人員不可預約時段（如休假、例假）
CREATE TABLE IF NOT EXISTS practitioner_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  store_id        UUID NOT NULL REFERENCES stores(id)        ON DELETE CASCADE,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT practitioner_blocks_times_check CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS practitioner_blocks_practitioner_idx
  ON practitioner_blocks (practitioner_id);
CREATE INDEX IF NOT EXISTS practitioner_blocks_time_range_idx
  ON practitioner_blocks (store_id, start_time, end_time);

ALTER TABLE practitioner_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can manage blocks" ON practitioner_blocks;
CREATE POLICY "authenticated can manage blocks"
  ON practitioner_blocks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON practitioner_blocks TO authenticated;

-- 2. 更新 upsert_booking RPC：加入封鎖時段檢查
CREATE OR REPLACE FUNCTION upsert_booking(
  p_booking_id       UUID,
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
  v_block_id         UUID;
  v_result_id        UUID;
BEGIN
  v_new_buffered_end := p_end_time + (p_buffer_minutes || ' minutes')::INTERVAL;

  -- ① 檢查從業人員封鎖時段
  SELECT id INTO v_block_id
  FROM   practitioner_blocks
  WHERE  practitioner_id = p_practitioner_id
    AND  start_time      < v_new_buffered_end
    AND  end_time        > p_start_time
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'ok',      false,
      'error',   'PRACTITIONER_BLOCKED',
      'conflict', null
    );
  END IF;

  -- ② 衝突檢查：同從業人員、非取消、非自己（編輯時）
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

  -- ③ 插入或更新
  IF p_booking_id IS NULL THEN
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

GRANT EXECUTE ON FUNCTION upsert_booking TO authenticated;
