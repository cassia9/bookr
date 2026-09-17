BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(18);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone,
  open_time, close_time
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '循環預約測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '09:00',
  '18:00'
), (
  'b0000000-0000-0000-0000-000000000002',
  '循環預約隔離店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '09:00',
  '18:00'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'recurring-admin@example.test',
  '{"full_name":"循環預約管理員"}'::JSONB
);

UPDATE public.users
SET
  store_id = 'b0000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role
WHERE id = 'b1000000-0000-0000-0000-000000000001';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  '循環預約客戶',
  '0918111111',
  'b0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  'b3000000-0000-0000-0000-000000000001',
  '循環預約課程',
  60,
  1500,
  TRUE,
  'b0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'b4000000-0000-0000-0000-000000000001',
  '循環預約老師',
  '#84CC16',
  TRUE,
  'b0000000-0000-0000-0000-000000000001'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.create_recurring_bookings_with_voucher(uuid,uuid,uuid,timestamptz,timestamptz,integer,integer,uuid,integer,text,uuid,integer,text,uuid)',
    'EXECUTE'
  ),
  '匿名角色不能建立循環預約'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.cancel_booking_scope(uuid,text)',
    'EXECUTE'
  ),
  '匿名角色不能批次取消預約'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.create_recurring_bookings_with_voucher(
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    DATE_TRUNC('day', NOW()) + INTERVAL '10 days 3 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '10 days 4 hours',
    1,
    1,
    'b5000000-0000-0000-0000-000000000001',
    0,
    '無效堂數',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    'none',
    NULL
  ) ->> 'error',
  'INVALID_INPUT',
  '循環預約至少需要兩堂'
);

SELECT extensions.ok(
  (
    public.create_recurring_bookings_with_voucher(
      'b2000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000001',
      'b3000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '20 days 3 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '20 days 4 hours',
      2,
      3,
      'b5000000-0000-0000-0000-000000000002',
      0,
      '凌晨特殊時段系列',
      'b0000000-0000-0000-0000-000000000001',
      NULL,
      'none',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '後台可在營業時間外建立三堂循環預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.bookings
    WHERE notes = '凌晨特殊時段系列'
  ),
  3::BIGINT,
  '循環系列建立三筆獨立預約'
);

SELECT extensions.is(
  (
    SELECT MAX(start_time) - MIN(start_time)
    FROM public.bookings
    WHERE notes = '凌晨特殊時段系列'
  ),
  INTERVAL '4 weeks',
  '每兩週循環的日期正確'
);

SELECT extensions.is(
  (
    SELECT ARRAY_AGG(recurrence_occurrence_index ORDER BY recurrence_occurrence_index)
    FROM public.bookings
    WHERE notes = '凌晨特殊時段系列'
  ),
  ARRAY[1, 2, 3]::SMALLINT[],
  '每堂具有穩定的系列順序'
);

SELECT extensions.is(
  (
    public.create_recurring_bookings_with_voucher(
      'b2000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000001',
      'b3000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '20 days 3 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '20 days 4 hours',
      2,
      3,
      'b5000000-0000-0000-0000-000000000002',
      0,
      '凌晨特殊時段系列',
      'b0000000-0000-0000-0000-000000000001',
      NULL,
      'none',
      NULL
    ) ->> 'idempotent'
  )::BOOLEAN,
  TRUE,
  '相同冪等鍵重送時回傳既有系列'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings WHERE notes = '凌晨特殊時段系列'),
  3::BIGINT,
  '重送不會重複建立預約'
);

SELECT extensions.ok(
  (
    public.upsert_booking_with_voucher(
      NULL,
      'b2000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000001',
      'b3000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '55 days 10 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '55 days 11 hours',
      0,
      '循環衝突既有預約',
      'b0000000-0000-0000-0000-000000000001',
      NULL,
      'none',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '先建立第二堂會撞期的既有預約'
);

SELECT extensions.is(
  public.create_recurring_bookings_with_voucher(
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    DATE_TRUNC('day', NOW()) + INTERVAL '48 days 10 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '48 days 11 hours',
    1,
    3,
    'b5000000-0000-0000-0000-000000000003',
    0,
    '應全部回滾的系列',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    'none',
    NULL
  ) ->> 'error',
  'TIME_CONFLICT',
  '任一堂衝突會回傳衝突錯誤'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.bookings
    WHERE notes = '應全部回滾的系列'
  ),
  0::BIGINT,
  '衝突系列不會留下部分預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.booking_recurrence_series
    WHERE idempotency_key = 'b5000000-0000-0000-0000-000000000003'
  ),
  0::BIGINT,
  '衝突系列不會留下空殼系列'
);

SELECT extensions.ok(
  (
    public.create_recurring_bookings_with_voucher(
      'b2000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000001',
      'b3000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '90 days 14 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '90 days 15 hours',
      1,
      4,
      'b5000000-0000-0000-0000-000000000004',
      0,
      '取消範圍測試系列',
      'b0000000-0000-0000-0000-000000000001',
      NULL,
      'none',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '建立取消範圍測試系列'
);

SELECT extensions.is(
  public.cancel_booking_scope(
    (
      SELECT id FROM public.bookings
      WHERE notes = '取消範圍測試系列'
        AND recurrence_occurrence_index = 2
    ),
    'single'
  ) ->> 'affected_count',
  '1',
  '可以只取消系列中的單次預約'
);

UPDATE public.bookings
SET status = 'completed'::public.booking_status
WHERE notes = '取消範圍測試系列'
  AND recurrence_occurrence_index = 3;

SELECT extensions.is(
  public.cancel_booking_scope(
    (
      SELECT id FROM public.bookings
      WHERE notes = '取消範圍測試系列'
        AND recurrence_occurrence_index = 1
    ),
    'future'
  ) ->> 'affected_count',
  '2',
  '取消本次起未來預約只處理仍有效且未開始的堂次'
);

SELECT extensions.is(
  (
    SELECT status::TEXT
    FROM public.bookings
    WHERE notes = '取消範圍測試系列'
      AND recurrence_occurrence_index = 3
  ),
  'completed',
  '批次取消不改動已完課預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.bookings
    WHERE notes = '取消範圍測試系列'
      AND status = 'cancelled'::public.booking_status
  ),
  3::BIGINT,
  '單次與未來取消後的系列狀態正確'
);

SELECT * FROM extensions.finish();
ROLLBACK;
