-- ============================================================
-- 老師臨時休假統一管理
--
-- 1. 新寫入一律使用 practitioner_blocks
-- 2. 安全回填 practitioner_leaves，不刪除舊表或舊資料
-- 3. 同店管理員透過 RPC 新增／刪除，避免跨店與重疊休假
-- 4. 回傳受影響預約並留下稽核紀錄
-- ============================================================

BEGIN;

ALTER TABLE public.practitioner_blocks
  ADD COLUMN IF NOT EXISTS legacy_leave_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'practitioner_blocks_legacy_leave_id_fkey'
      AND conrelid = 'public.practitioner_blocks'::REGCLASS
  ) THEN
    ALTER TABLE public.practitioner_blocks
      ADD CONSTRAINT practitioner_blocks_legacy_leave_id_fkey
      FOREIGN KEY (legacy_leave_id)
      REFERENCES public.practitioner_leaves(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioner_blocks_legacy_leave_unique
  ON public.practitioner_blocks (legacy_leave_id)
  WHERE legacy_leave_id IS NOT NULL;

-- 舊休假只有日期，依店家時區轉為 [當日 00:00, 結束日隔日 00:00)。
-- 已存在任何重疊 block 時不重複建立；舊資料仍保留供部署前後核對。
INSERT INTO public.practitioner_blocks (
  practitioner_id,
  store_id,
  start_time,
  end_time,
  reason,
  legacy_leave_id
)
SELECT
  leave.practitioner_id,
  practitioner.store_id,
  leave.start_date::TIMESTAMP AT TIME ZONE COALESCE(
    NULLIF(store.timezone, ''),
    'Asia/Taipei'
  ),
  (leave.end_date + 1)::TIMESTAMP AT TIME ZONE COALESCE(
    NULLIF(store.timezone, ''),
    'Asia/Taipei'
  ),
  NULLIF(BTRIM(leave.reason), ''),
  leave.id
FROM public.practitioner_leaves AS leave
JOIN public.practitioners AS practitioner
  ON practitioner.id = leave.practitioner_id
 AND practitioner.deleted_at IS NULL
JOIN public.stores AS store ON store.id = practitioner.store_id
WHERE leave.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS block
    WHERE block.legacy_leave_id = leave.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS block
    WHERE block.store_id = practitioner.store_id
      AND block.practitioner_id = leave.practitioner_id
      AND block.start_time < (
        (leave.end_date + 1)::TIMESTAMP AT TIME ZONE COALESCE(
          NULLIF(store.timezone, ''),
          'Asia/Taipei'
        )
      )
      AND block.end_time > (
        leave.start_date::TIMESTAMP AT TIME ZONE COALESCE(
          NULLIF(store.timezone, ''),
          'Asia/Taipei'
        )
      )
  );

-- 一般成員可讀同店休假，但不能再直接新增、修改或刪除。
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practitioner_blocks
  FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_practitioner_leave(
  p_practitioner_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_timezone TEXT;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_block_id UUID;
  v_conflicts JSONB;
  v_conflict_count INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_practitioner_id IS NULL
    OR p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date
    OR p_end_date > p_start_date + 366
    OR CHAR_LENGTH(COALESCE(v_reason, '')) > 500 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei')
  INTO v_timezone
  FROM public.practitioners AS practitioner
  JOIN public.stores AS store ON store.id = practitioner.store_id
  WHERE practitioner.id = p_practitioner_id
    AND practitioner.store_id = v_store_id
    AND practitioner.deleted_at IS NULL
  FOR UPDATE OF practitioner;

  IF v_timezone IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  v_start_time := p_start_date::TIMESTAMP AT TIME ZONE v_timezone;
  v_end_time := (p_end_date + 1)::TIMESTAMP AT TIME ZONE v_timezone;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_store_id::TEXT || ':' || p_practitioner_id::TEXT || ':leave',
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS block
    WHERE block.store_id = v_store_id
      AND block.practitioner_id = p_practitioner_id
      AND block.start_time < v_end_time
      AND block.end_time > v_start_time
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'OVERLAPPING_LEAVE');
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', booking.id,
          'start_time', booking.start_time,
          'end_time', booking.end_time,
          'client_name', client.full_name,
          'service_name', service.name
        ) ORDER BY booking.start_time, booking.id
      ),
      '[]'::JSONB
    )
  INTO v_conflict_count, v_conflicts
  FROM public.bookings AS booking
  JOIN public.clients AS client ON client.id = booking.client_id
  JOIN public.services AS service ON service.id = booking.service_id
  WHERE booking.store_id = v_store_id
    AND booking.practitioner_id = p_practitioner_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND booking.start_time < v_end_time
    AND booking.end_time > v_start_time;

  INSERT INTO public.practitioner_blocks (
    practitioner_id,
    store_id,
    start_time,
    end_time,
    reason
  ) VALUES (
    p_practitioner_id,
    v_store_id,
    v_start_time,
    v_end_time,
    v_reason
  )
  RETURNING id INTO v_block_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    'practitioner_leave_created',
    'practitioner_blocks',
    v_block_id,
    JSONB_BUILD_OBJECT(
      'practitioner_id', p_practitioner_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', v_reason,
      'conflict_count', v_conflict_count
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_block_id,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_practitioner_leave(
  p_block_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_block public.practitioner_blocks%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  SELECT block.*
  INTO v_block
  FROM public.practitioner_blocks AS block
  WHERE block.id = p_block_id
    AND block.store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'LEAVE_NOT_FOUND');
  END IF;

  DELETE FROM public.practitioner_blocks
  WHERE id = v_block.id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    'practitioner_leave_deleted',
    'practitioner_blocks',
    v_block.id,
    JSONB_BUILD_OBJECT(
      'practitioner_id', v_block.practitioner_id,
      'start_time', v_block.start_time,
      'end_time', v_block.end_time,
      'reason', v_block.reason,
      'legacy_leave_id', v_block.legacy_leave_id
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', v_block.id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_practitioner_leave(
  UUID, DATE, DATE, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_practitioner_leave(
  UUID, DATE, DATE, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_practitioner_leave(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_practitioner_leave(UUID)
  TO authenticated;

COMMENT ON COLUMN public.practitioner_blocks.legacy_leave_id IS
  '由舊 practitioner_leaves 安全回填時保存來源；舊表與舊資料不刪除';
COMMENT ON FUNCTION public.save_practitioner_leave(UUID, DATE, DATE, TEXT) IS
  '同店管理員新增老師整日休假，阻擋重疊並回傳受影響預約';
COMMENT ON FUNCTION public.delete_practitioner_leave(UUID) IS
  '同店管理員刪除老師休假並留下稽核紀錄';

COMMIT;
