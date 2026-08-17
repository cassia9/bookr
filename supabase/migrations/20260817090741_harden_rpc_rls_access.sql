-- RPC、資料表權限與 RLS 安全收斂：
-- 1. 所有 SECURITY DEFINER 函式使用固定且安全的 search_path
-- 2. RPC 先全部撤權，再依公開／登入／service_role 白名單重新授權
-- 3. 移除 permissive 舊政策，重新建立店家隔離與角色授權
-- 4. 撤銷 Supabase 預設寬鬆資料表權限，僅開放前端實際需要的操作

BEGIN;

-- ============================================================
-- 1. 補齊正式環境已有、歷史 migration 遺漏的 booking_slug
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS booking_slug TEXT;

-- 正式舊環境已記錄 014/018 migration，但實際缺少此軟刪除欄位。
-- 既有關聯保持 NULL（有效），不需回填或更新任何業務資料。
ALTER TABLE public.practitioner_services
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_booking_slug_unique
  ON public.stores (LOWER(booking_slug))
  WHERE booking_slug IS NOT NULL;

-- 正式舊環境曾修復 migration history 但未實際建立此索引；公開預約的
-- ON CONFLICT 需要它，同時可防止並發請求建立同店家的重複有效客戶。
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_store_unique
  ON public.clients (phone, store_id)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. 身分／店家輔助函式：固定 search_path 並排除停用帳號
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.store_id
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
    AND u.deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_current_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_store_id()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT u.role = 'admin'::public.user_role
    FROM public.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND u.deleted_at IS NULL
    LIMIT 1
  ), FALSE)
$$;

CREATE OR REPLACE FUNCTION public.current_practitioner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.practitioner_id
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
    AND u.deleted_at IS NULL
  LIMIT 1
$$;

-- Auth 觸發器雖不開放 API 呼叫，仍屬 SECURITY DEFINER，必須使用安全路徑。
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, store_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    'member'::public.user_role,
    '00000000-0000-0000-0000-000000000001'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. 公開店家查詢 RPC：只回傳可預約店家的 id
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_store_by_code(p_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.stores AS s
  WHERE s.store_code = LOWER(BTRIM(p_code))
    AND s.booking_enabled = TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_store_by_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.stores AS s
  WHERE LOWER(s.booking_slug) = LOWER(BTRIM(p_slug))
    AND s.booking_enabled = TRUE
  LIMIT 1
$$;

-- ============================================================
-- 4. 公開可預約時段：所有關聯資料都必須屬於同一店家
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_date DATE,
  p_service_id UUID,
  p_practitioner_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE (
  slot_time TEXT,
  practitioner_id UUID,
  practitioner_name TEXT,
  practitioner_color TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open_time TIME;
  v_close_time TIME;
  v_duration INT;
  v_buffer INT;
  v_tz CONSTANT TEXT := 'Asia/Taipei';
  v_min_ts TIMESTAMPTZ := NOW() + INTERVAL '2 hours';
  v_max_date DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 62;
BEGIN
  IF p_date IS NULL
    OR p_service_id IS NULL
    OR p_store_id IS NULL
    OR p_date < (NOW() AT TIME ZONE v_tz)::DATE
    OR p_date > v_max_date THEN
    RETURN;
  END IF;

  SELECT
    s.open_time,
    s.close_time,
    COALESCE(s.default_buffer_minutes, 0)
  INTO v_open_time, v_close_time, v_buffer
  FROM public.stores AS s
  WHERE s.id = p_store_id
    AND s.booking_enabled = TRUE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT s.duration_minutes
  INTO v_duration
  FROM public.services AS s
  WHERE s.id = p_service_id
    AND s.store_id = p_store_id
    AND s.active = TRUE
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_practitioner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = p_practitioner_id
        AND p.store_id = p_store_id
        AND p.active = TRUE
        AND p.deleted_at IS NULL
    ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT
      gs AS slot_ts,
      TO_CHAR(gs AT TIME ZONE v_tz, 'HH24:MI') AS slot_str
    FROM GENERATE_SERIES(
      (p_date::TEXT || ' ' || v_open_time::TEXT)::TIMESTAMP AT TIME ZONE v_tz,
      (p_date::TEXT || ' ' || v_close_time::TEXT)::TIMESTAMP AT TIME ZONE v_tz
        - (v_duration || ' minutes')::INTERVAL,
      INTERVAL '15 minutes'
    ) AS gs
    WHERE gs > v_min_ts
  ),
  active_practitioners AS (
    SELECT p.id, p.full_name, p.color
    FROM public.practitioners AS p
    WHERE p.store_id = p_store_id
      AND p.active = TRUE
      AND p.deleted_at IS NULL
      AND (p_practitioner_id IS NULL OR p.id = p_practitioner_id)
  ),
  candidates AS (
    SELECT
      r.slot_ts,
      r.slot_str,
      p.id AS practitioner_id,
      p.full_name,
      p.color
    FROM raw_slots AS r
    CROSS JOIN active_practitioners AS p
  ),
  unblocked AS (
    SELECT c.*
    FROM candidates AS c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.practitioner_blocks AS pb
      WHERE pb.store_id = p_store_id
        AND pb.practitioner_id = c.practitioner_id
        AND pb.start_time < c.slot_ts + (v_duration || ' minutes')::INTERVAL
        AND pb.end_time > c.slot_ts
    )
  ),
  available AS (
    SELECT u.*
    FROM unblocked AS u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.store_id = p_store_id
        AND b.practitioner_id = u.practitioner_id
        AND b.deleted_at IS NULL
        AND b.status <> 'cancelled'::public.booking_status
        AND b.start_time < u.slot_ts
          + ((v_duration + v_buffer) || ' minutes')::INTERVAL
        AND b.end_time
          + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
          > u.slot_ts
    )
  ),
  today_counts AS (
    SELECT b.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND (b.start_time AT TIME ZONE v_tz)::DATE = p_date
    GROUP BY b.practitioner_id
  ),
  week_counts AS (
    SELECT b.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_time >= DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz
      )
      AND b.start_time < DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz
      ) + INTERVAL '7 days'
    GROUP BY b.practitioner_id
  ),
  best AS (
    SELECT DISTINCT ON (a.slot_ts)
      a.slot_ts,
      a.slot_str,
      a.practitioner_id,
      a.full_name,
      a.color
    FROM available AS a
    LEFT JOIN today_counts AS tc
      ON tc.practitioner_id = a.practitioner_id
    LEFT JOIN week_counts AS wc
      ON wc.practitioner_id = a.practitioner_id
    ORDER BY
      a.slot_ts,
      COALESCE(tc.booking_count, 0),
      COALESCE(wc.booking_count, 0),
      a.practitioner_id
  )
  SELECT
    b.slot_str,
    b.practitioner_id,
    b.full_name,
    b.color
  FROM best AS b
  ORDER BY b.slot_ts;
END;
$$;

-- ============================================================
-- 5. 公開建立預約：跨店檢查 + 同老師交易鎖避免並發重複預約
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking_public(
  p_full_name TEXT,
  p_phone TEXT,
  p_service_id UUID,
  p_practitioner_id UUID,
  p_start_time TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_source TEXT DEFAULT 'web',
  p_client_line_id TEXT DEFAULT NULL,
  p_client_picture_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_buffer INT;
  v_end_time TIMESTAMPTZ;
  v_booking_id UUID;
  v_confirmation_mode TEXT;
  v_initial_status public.booking_status;
BEGIN
  IF NULLIF(BTRIM(p_full_name), '') IS NULL
    OR NULLIF(BTRIM(p_phone), '') IS NULL
    OR p_service_id IS NULL
    OR p_practitioner_id IS NULL
    OR p_start_time IS NULL
    OR p_store_id IS NULL THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'MISSING_INFO');
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('line', 'messenger', 'web') THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_SOURCE');
  END IF;

  SELECT s.duration_minutes
  INTO v_duration
  FROM public.services AS s
  WHERE s.id = p_service_id
    AND s.store_id = p_store_id
    AND s.active = TRUE
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practitioners AS p
    WHERE p.id = p_practitioner_id
      AND p.store_id = p_store_id
      AND p.active = TRUE
      AND p.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  SELECT
    COALESCE(s.default_buffer_minutes, 0),
    s.booking_confirmation_mode
  INTO v_buffer, v_confirmation_mode
  FROM public.stores AS s
  WHERE s.id = p_store_id
    AND s.booking_enabled = TRUE;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'STORE_NOT_FOUND');
  END IF;

  v_initial_status := CASE v_confirmation_mode
    WHEN 'auto' THEN 'confirmed'::public.booking_status
    ELSE 'pending'::public.booking_status
  END;
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

  -- 同一老師的公開預約序列化，避免兩個請求同時通過衝突檢查。
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_practitioner_id::TEXT, 0)
  );

  INSERT INTO public.clients AS c (full_name, phone, store_id)
  VALUES (BTRIM(p_full_name), BTRIM(p_phone), p_store_id)
  ON CONFLICT (phone, store_id) WHERE deleted_at IS NULL
  DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING c.id INTO v_client_id;

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS pb
    WHERE pb.store_id = p_store_id
      AND pb.practitioner_id = p_practitioner_id
      AND pb.start_time < v_end_time
      AND pb.end_time > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.practitioner_id = p_practitioner_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_time < v_end_time + (v_buffer || ' minutes')::INTERVAL
      AND b.end_time
        + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
        > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CONFLICT');
  END IF;

  INSERT INTO public.bookings (
    client_id,
    practitioner_id,
    service_id,
    start_time,
    end_time,
    buffer_minutes,
    notes,
    store_id,
    status,
    source,
    client_line_id,
    client_picture_url
  ) VALUES (
    v_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    v_end_time,
    v_buffer,
    p_notes,
    p_store_id,
    v_initial_status,
    p_source,
    p_client_line_id,
    p_client_picture_url
  )
  RETURNING id INTO v_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_booking_id,
    'status', v_initial_status
  );
END;
$$;

-- 舊確認 RPC 未被現行前端使用，且會向匿名呼叫者揭露客戶電話，明確移除。
DROP FUNCTION IF EXISTS public.get_booking_confirmation(UUID);

-- 後台內部 RPC 改為 invoker；除了函式內的店家檢查，仍必須通過 RLS。
ALTER FUNCTION public.upsert_booking(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  TIMESTAMPTZ, INT, TEXT, UUID, INT
) SECURITY INVOKER;

ALTER FUNCTION public.search_clients(TEXT, UUID, INT) SECURITY INVOKER;
ALTER FUNCTION public.get_client_bookings(UUID, INT) SECURITY INVOKER;

-- ============================================================
-- 6. 後台統計 RPC：保留原回傳格式，只讓管理員取得資料
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_kpi(
  p_tz TEXT DEFAULT 'Asia/Taipei'
)
RETURNS TABLE (
  today_bookings BIGINT,
  today_completed BIGINT,
  month_bookings BIGINT,
  month_completed BIGINT,
  month_revenue BIGINT,
  pending_count BIGINT,
  prev_month_bookings BIGINT,
  prev_month_revenue BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT public.current_store_id() AS store_id
    WHERE public.is_admin()
  ),
  bounds AS (
    SELECT
      DATE_TRUNC('day', NOW() AT TIME ZONE p_tz)::TIMESTAMP AT TIME ZONE p_tz AS today_start,
      (DATE_TRUNC('day', NOW() AT TIME ZONE p_tz) + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE p_tz AS today_end,
      DATE_TRUNC('month', NOW() AT TIME ZONE p_tz)::TIMESTAMP AT TIME ZONE p_tz AS month_start,
      (DATE_TRUNC('month', NOW() AT TIME ZONE p_tz) + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE p_tz AS month_end,
      DATE_TRUNC('month', NOW() AT TIME ZONE p_tz - INTERVAL '1 month')::TIMESTAMP AT TIME ZONE p_tz AS previous_start,
      DATE_TRUNC('month', NOW() AT TIME ZONE p_tz)::TIMESTAMP AT TIME ZONE p_tz AS previous_end
  )
  SELECT
    COUNT(*) FILTER (
      WHERE b.start_time >= x.today_start
        AND b.start_time < x.today_end
        AND b.status <> 'cancelled'::public.booking_status
    ),
    COUNT(*) FILTER (
      WHERE b.start_time >= x.today_start
        AND b.start_time < x.today_end
        AND b.status = 'completed'::public.booking_status
    ),
    COUNT(*) FILTER (
      WHERE b.start_time >= x.month_start
        AND b.start_time < x.month_end
        AND b.status <> 'cancelled'::public.booking_status
    ),
    COUNT(*) FILTER (
      WHERE b.start_time >= x.month_start
        AND b.start_time < x.month_end
        AND b.status = 'completed'::public.booking_status
    ),
    COALESCE(SUM(b.price) FILTER (
      WHERE b.start_time >= x.month_start
        AND b.start_time < x.month_end
        AND b.status = 'completed'::public.booking_status
    ), 0)::BIGINT,
    COUNT(*) FILTER (WHERE b.status = 'pending'::public.booking_status),
    COUNT(*) FILTER (
      WHERE b.start_time >= x.previous_start
        AND b.start_time < x.previous_end
        AND b.status <> 'cancelled'::public.booking_status
    ),
    COALESCE(SUM(b.price) FILTER (
      WHERE b.start_time >= x.previous_start
        AND b.start_time < x.previous_end
        AND b.status = 'completed'::public.booking_status
    ), 0)::BIGINT
  FROM public.bookings AS b
  CROSS JOIN bounds AS x
  CROSS JOIN ctx
  WHERE b.store_id = ctx.store_id
    AND b.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.get_practitioner_stats(
  p_start DATE,
  p_end DATE,
  p_tz TEXT DEFAULT 'Asia/Taipei'
)
RETURNS TABLE (
  practitioner_id UUID,
  full_name TEXT,
  color TEXT,
  booking_count BIGINT,
  completed_count BIGINT,
  revenue BIGINT,
  completion_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT public.current_store_id() AS store_id
    WHERE public.is_admin()
  ),
  bounds AS (
    SELECT
      p_start::TIMESTAMP AT TIME ZONE p_tz AS range_start,
      (p_end + 1)::TIMESTAMP AT TIME ZONE p_tz AS range_end
  ),
  booking_aggregate AS (
    SELECT
      b.practitioner_id,
      COUNT(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS booking_count,
      COUNT(*) FILTER (WHERE b.status = 'completed'::public.booking_status) AS completed_count,
      COALESCE(SUM(b.price) FILTER (
        WHERE b.status = 'completed'::public.booking_status
      ), 0) AS revenue
    FROM public.bookings AS b
    CROSS JOIN bounds AS x
    CROSS JOIN ctx
    WHERE b.store_id = ctx.store_id
      AND b.deleted_at IS NULL
      AND b.start_time >= x.range_start
      AND b.start_time < x.range_end
    GROUP BY b.practitioner_id
  )
  SELECT
    p.id,
    p.full_name,
    p.color,
    COALESCE(a.booking_count, 0),
    COALESCE(a.completed_count, 0),
    COALESCE(a.revenue, 0)::BIGINT,
    CASE
      WHEN COALESCE(a.booking_count, 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(a.completed_count, 0)::NUMERIC
          / a.booking_count::NUMERIC * 100,
        1
      )
    END
  FROM public.practitioners AS p
  CROSS JOIN ctx
  LEFT JOIN booking_aggregate AS a ON a.practitioner_id = p.id
  WHERE p.store_id = ctx.store_id
    AND p.active = TRUE
    AND p.deleted_at IS NULL
  ORDER BY revenue DESC, completed_count DESC
$$;

CREATE OR REPLACE FUNCTION public.get_service_stats(
  p_start DATE,
  p_end DATE,
  p_tz TEXT DEFAULT 'Asia/Taipei'
)
RETURNS TABLE (
  service_id UUID,
  service_name TEXT,
  booking_count BIGINT,
  revenue BIGINT,
  avg_price NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT public.current_store_id() AS store_id
    WHERE public.is_admin()
  ),
  bounds AS (
    SELECT
      p_start::TIMESTAMP AT TIME ZONE p_tz AS range_start,
      (p_end + 1)::TIMESTAMP AT TIME ZONE p_tz AS range_end
  ),
  booking_aggregate AS (
    SELECT
      b.service_id,
      COUNT(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS booking_count,
      COALESCE(SUM(b.price) FILTER (
        WHERE b.status = 'completed'::public.booking_status
      ), 0) AS revenue,
      ROUND(AVG(b.price) FILTER (
        WHERE b.status = 'completed'::public.booking_status
      ), 0) AS avg_price
    FROM public.bookings AS b
    CROSS JOIN bounds AS x
    CROSS JOIN ctx
    WHERE b.store_id = ctx.store_id
      AND b.deleted_at IS NULL
      AND b.start_time >= x.range_start
      AND b.start_time < x.range_end
    GROUP BY b.service_id
  )
  SELECT
    s.id,
    s.name,
    a.booking_count,
    a.revenue::BIGINT,
    COALESCE(a.avg_price, 0)
  FROM booking_aggregate AS a
  JOIN public.services AS s ON s.id = a.service_id
  CROSS JOIN ctx
  WHERE s.store_id = ctx.store_id
    AND s.deleted_at IS NULL
  ORDER BY a.booking_count DESC
  LIMIT 5
$$;

CREATE OR REPLACE FUNCTION public.get_daily_stats(
  p_start DATE,
  p_end DATE,
  p_tz TEXT DEFAULT 'Asia/Taipei'
)
RETURNS TABLE (
  stat_date DATE,
  booking_count BIGINT,
  completed_count BIGINT,
  revenue BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT public.current_store_id() AS store_id
    WHERE public.is_admin()
  ),
  bounds AS (
    SELECT
      p_start::TIMESTAMP AT TIME ZONE p_tz AS range_start,
      (p_end + 1)::TIMESTAMP AT TIME ZONE p_tz AS range_end
  ),
  dates AS (
    SELECT GENERATE_SERIES(p_start, p_end, INTERVAL '1 day')::DATE AS stat_date
  ),
  booking_aggregate AS (
    SELECT
      (b.start_time AT TIME ZONE p_tz)::DATE AS stat_date,
      COUNT(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS booking_count,
      COUNT(*) FILTER (WHERE b.status = 'completed'::public.booking_status) AS completed_count,
      COALESCE(SUM(b.price) FILTER (
        WHERE b.status = 'completed'::public.booking_status
      ), 0) AS revenue
    FROM public.bookings AS b
    CROSS JOIN bounds AS x
    CROSS JOIN ctx
    WHERE b.store_id = ctx.store_id
      AND b.deleted_at IS NULL
      AND b.start_time >= x.range_start
      AND b.start_time < x.range_end
    GROUP BY (b.start_time AT TIME ZONE p_tz)::DATE
  )
  SELECT
    d.stat_date,
    COALESCE(a.booking_count, 0)::BIGINT,
    COALESCE(a.completed_count, 0)::BIGINT,
    COALESCE(a.revenue, 0)::BIGINT
  FROM dates AS d
  CROSS JOIN ctx
  LEFT JOIN booking_aggregate AS a ON a.stat_date = d.stat_date
  ORDER BY d.stat_date
$$;

-- ============================================================
-- 7. RLS：刪除舊 permissive 政策，建立唯一明確的授權集合
-- ============================================================

DO $migration$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'stores',
        'users',
        'practitioners',
        'clients',
        'services',
        'bookings',
        'notification_settings',
        'notification_templates',
        'pending_invitations',
        'practitioner_blocks',
        'practitioner_leaves',
        'practitioner_services',
        'audit_logs'
      ])
  LOOP
    EXECUTE FORMAT(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END
$migration$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- stores
CREATE POLICY "select_anon_stores"
  ON public.stores FOR SELECT TO anon
  USING (booking_enabled = TRUE);

CREATE POLICY "select_member_store"
  ON public.stores FOR SELECT TO authenticated
  USING (id = (SELECT public.current_store_id()));

CREATE POLICY "update_admin_store"
  ON public.stores FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- users：成員只看／改自己；管理員看同店成員。角色與店家欄位不授權前端更新。
CREATE POLICY "select_self_user"
  ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY "select_admin_users"
  ON public.users FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

CREATE POLICY "update_self_user"
  ON public.users FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    AND store_id = (SELECT public.current_store_id())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    AND store_id = (SELECT public.current_store_id())
    AND deleted_at IS NULL
  );

-- practitioners
CREATE POLICY "select_anon_practitioners"
  ON public.practitioners FOR SELECT TO anon
  USING (
    active = TRUE
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores AS s
      WHERE s.id = practitioners.store_id
        AND s.booking_enabled = TRUE
    )
  );

CREATE POLICY "select_member_practitioners"
  ON public.practitioners FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND active = TRUE
    AND deleted_at IS NULL
  );

CREATE POLICY "manage_admin_practitioners"
  ON public.practitioners FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- services
CREATE POLICY "select_anon_services"
  ON public.services FOR SELECT TO anon
  USING (
    active = TRUE
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores AS s
      WHERE s.id = services.store_id
        AND s.booking_enabled = TRUE
    )
  );

CREATE POLICY "select_member_services"
  ON public.services FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND active = TRUE
    AND deleted_at IS NULL
  );

CREATE POLICY "manage_admin_services"
  ON public.services FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- bookings
CREATE POLICY "select_admin_bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

CREATE POLICY "select_member_bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND practitioner_id = (SELECT public.current_practitioner_id())
    AND deleted_at IS NULL
  );

CREATE POLICY "insert_admin_bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

CREATE POLICY "update_admin_bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- clients：一般成員只可讀取自己預約所關聯的客戶。
CREATE POLICY "select_admin_clients"
  ON public.clients FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

CREATE POLICY "select_member_clients"
  ON public.clients FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.client_id = clients.id
        AND b.store_id = clients.store_id
        AND b.practitioner_id = (SELECT public.current_practitioner_id())
        AND b.deleted_at IS NULL
    )
  );

CREATE POLICY "insert_admin_clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

CREATE POLICY "update_admin_clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- practitioner_services
CREATE POLICY "select_member_practitioner_services"
  ON public.practitioner_services FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_services.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "manage_admin_practitioner_services"
  ON public.practitioner_services FOR ALL TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_services.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      JOIN public.services AS s
        ON s.id = practitioner_services.service_id
      WHERE p.id = practitioner_services.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
        AND s.store_id = p.store_id
        AND p.deleted_at IS NULL
        AND s.deleted_at IS NULL
    )
  );

-- practitioner_leaves
CREATE POLICY "select_member_practitioner_leaves"
  ON public.practitioner_leaves FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_leaves.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "manage_admin_practitioner_leaves"
  ON public.practitioner_leaves FOR ALL TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_leaves.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_leaves.practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
        AND p.deleted_at IS NULL
    )
  );

-- practitioner_blocks：成員可管理自己的封鎖時段，管理員可管理同店全部。
CREATE POLICY "select_member_practitioner_blocks"
  ON public.practitioner_blocks FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

CREATE POLICY "manage_admin_practitioner_blocks"
  ON public.practitioner_blocks FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_blocks.practitioner_id
        AND p.store_id = practitioner_blocks.store_id
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "manage_self_practitioner_blocks"
  ON public.practitioner_blocks FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND practitioner_id = (SELECT public.current_practitioner_id())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND practitioner_id = (SELECT public.current_practitioner_id())
  );

-- notification settings/templates
CREATE POLICY "manage_admin_notification_settings"
  ON public.notification_settings FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

CREATE POLICY "manage_admin_notification_templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- pending invitations
CREATE POLICY "manage_admin_pending_invitations"
  ON public.pending_invitations FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

CREATE POLICY "select_self_pending_invitation"
  ON public.pending_invitations FOR SELECT TO authenticated
  USING (accepted_user_id = (SELECT auth.uid()));

-- audit logs
CREATE POLICY "select_admin_audit_logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

-- ============================================================
-- 8. 資料表 GRANT：先撤銷 Supabase 預設權限，再精確重授
-- ============================================================

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
  ON TABLE public.stores, public.services, public.practitioners
  TO anon;

GRANT SELECT
  ON TABLE
    public.stores,
    public.users,
    public.practitioners,
    public.services,
    public.clients,
    public.bookings,
    public.practitioner_services,
    public.practitioner_leaves,
    public.practitioner_blocks,
    public.notification_settings,
    public.notification_templates,
    public.pending_invitations,
    public.audit_logs,
    public.client_stats
  TO authenticated;

GRANT UPDATE (full_name)
  ON TABLE public.users
  TO authenticated;

GRANT UPDATE
  ON TABLE public.stores
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.clients, public.bookings
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    public.practitioners,
    public.services,
    public.practitioner_services,
    public.practitioner_leaves,
    public.practitioner_blocks,
    public.notification_settings,
    public.notification_templates,
    public.pending_invitations
  TO authenticated;

-- Edge Functions 使用 service_role，僅開放目前程式碼實際使用的物件。
GRANT SELECT
  ON TABLE public.stores, public.bookings
  TO service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.users, public.pending_invitations
  TO service_role;

GRANT SELECT, INSERT
  ON TABLE public.audit_logs
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    public.practitioners,
    public.services,
    public.practitioner_services,
    public.practitioner_leaves
  TO service_role;

-- 未來 migration 建立的新物件預設不對 API 角色開放。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================
-- 9. RPC EXECUTE 白名單
-- ============================================================

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated, service_role;

-- 公開預約流程。
GRANT EXECUTE ON FUNCTION
  public.get_store_by_code(TEXT),
  public.get_store_by_slug(TEXT),
  public.get_available_slots(DATE, UUID, UUID, UUID),
  public.create_booking_public(
    TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
  ),
  public.validate_invitation_token(UUID)
TO anon, authenticated;

-- RLS／登入用戶輔助函式。
GRANT EXECUTE ON FUNCTION
  public.current_store_id(),
  public.get_current_store_id(),
  public.is_admin(),
  public.current_practitioner_id()
TO authenticated;

-- 後台 RPC；角色差異由函式內檢查與 RLS 雙重限制。
GRANT EXECUTE ON FUNCTION
  public.upsert_booking(
    UUID, UUID, UUID, UUID, TIMESTAMPTZ,
    TIMESTAMPTZ, INT, TEXT, UUID, INT
  ),
  public.search_clients(TEXT, UUID, INT),
  public.get_client_bookings(UUID, INT),
  public.get_dashboard_kpi(TEXT),
  public.get_practitioner_stats(DATE, DATE, TEXT),
  public.get_service_stats(DATE, DATE, TEXT),
  public.get_daily_stats(DATE, DATE, TEXT)
TO authenticated;

-- 邀請 Edge Functions 的內部 RPC。
GRANT EXECUTE ON FUNCTION
  public.validate_invitation_token(UUID),
  public.claim_member_invitation(UUID),
  public.release_member_invitation_claim(UUID),
  public.complete_member_invitation(UUID, UUID),
  public.claim_invitation_email_send(UUID, UUID),
  public.finish_invitation_email_send(UUID, BOOLEAN, TEXT)
TO service_role;

COMMENT ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) IS '公開預約入口；驗證店家關聯並以交易鎖避免同老師並發重複預約';

COMMENT ON FUNCTION public.get_dashboard_kpi(TEXT)
  IS '管理員限定：店家 KPI 統計';

COMMIT;
