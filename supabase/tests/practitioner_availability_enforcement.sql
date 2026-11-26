BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(11);

INSERT INTO public.stores (
  id,
  name,
  booking_enabled,
  booking_confirmation_mode,
  timezone,
  open_time,
  close_time,
  same_day_booking_lead_minutes,
  line_login_channel_id
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  '老師可用性測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '08:00',
  '21:00',
  15,
  '9876543210'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'availability-admin@example.test',
    '{"full_name":"可用性管理員"}'::JSONB
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'availability-member@example.test',
    '{"full_name":"可用性成員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'e0000000-0000-0000-0000-000000000001',
    role = CASE
      WHEN id = 'e1000000-0000-0000-0000-000000000001'
        THEN 'admin'::public.user_role
      ELSE 'member'::public.user_role
    END
WHERE id IN (
  'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002'
);

INSERT INTO public.clients (
  id, full_name, phone, store_id
) VALUES (
  'e2000000-0000-0000-0000-000000000001',
  '可用性測試客戶',
  '0911222333',
  'e0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  'e3000000-0000-0000-0000-000000000001',
  '可用性測試課程',
  60,
  1500,
  TRUE,
  'e0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES
  (
    'e4000000-0000-0000-0000-000000000001',
    '已設定班表老師',
    '#0EA5E9',
    TRUE,
    'e0000000-0000-0000-0000-000000000001'
  ),
  (
    'e4000000-0000-0000-0000-000000000002',
    '沿用舊行為老師',
    '#22C55E',
    TRUE,
    'e0000000-0000-0000-0000-000000000001'
  );

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.save_practitioner_weekly_schedule(
      'e4000000-0000-0000-0000-000000000001',
      (
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'weekday', weekday,
            'is_working', weekday = EXTRACT(
              ISODOW FROM (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1
            )::INTEGER,
            'start_time', CASE
              WHEN weekday = EXTRACT(
                ISODOW FROM (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1
              )::INTEGER THEN '10:00'
              ELSE NULL
            END,
            'end_time', CASE
              WHEN weekday = EXTRACT(
                ISODOW FROM (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1
              )::INTEGER THEN '12:00'
              ELSE NULL
            END
          ) ORDER BY weekday
        )
        FROM GENERATE_SERIES(1, 7) AS weekday
      )
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可建立只有明天上班的測試班表'
);

RESET ROLE;

SELECT extensions.ok(
  (
    SELECT COUNT(*) > 0
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1,
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001'
    )
  ),
  '上班日會回傳可預約時段'
);

SELECT extensions.ok(
  (
    SELECT BOOL_AND(slot_time::TIME >= '10:00'::TIME AND slot_time::TIME <= '11:00'::TIME)
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1,
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001'
    )
  ),
  '課程完整落在 10:00 至 12:00 班別內'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2,
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001'
    )
  ),
  0::BIGINT,
  '非上班日不回傳老師時段'
);

SELECT extensions.ok(
  (
    SELECT COUNT(*) > 0
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2,
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000002',
      'e0000000-0000-0000-0000-000000000001'
    )
  ),
  '沒有班表資料的既有老師維持舊行為'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.is(
  public.create_booking_public(
    '非上班時段客戶',
    '0911000001',
    'e3000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    (
      (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1)::TEXT || ' 08:00')::TIMESTAMP
        AT TIME ZONE 'Asia/Taipei'
    ),
    NULL,
    'e0000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'PRACTITIONER_UNAVAILABLE',
  '公開送出層不可繞過非上班時段'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.throws_ok(
  $$
    INSERT INTO public.bookings (
      client_id, practitioner_id, service_id, start_time, end_time,
      status, store_id
    ) VALUES (
      'e2000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'e3000000-0000-0000-0000-000000000001',
      (
        (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2)::TEXT || ' 10:00')::TIMESTAMP
          AT TIME ZONE 'Asia/Taipei'
      ),
      (
        (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2)::TEXT || ' 11:00')::TIMESTAMP
          AT TIME ZONE 'Asia/Taipei'
      ),
      'confirmed'::public.booking_status,
      'e0000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'PRACTITIONER_UNAVAILABLE',
  '一般成員直接寫入也不可覆寫班表'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

INSERT INTO public.bookings (
  client_id, practitioner_id, service_id, start_time, end_time,
  status, store_id
) VALUES (
  'e2000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001',
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2)::TEXT || ' 12:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2)::TEXT || ' 13:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  'confirmed'::public.booking_status,
  'e0000000-0000-0000-0000-000000000001'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'e0000000-0000-0000-0000-000000000001'
      AND action = 'booking_practitioner_availability_overridden'
  ),
  1::BIGINT,
  '管理員覆寫非排班時段會留下稽核紀錄'
);

INSERT INTO public.practitioner_blocks (
  practitioner_id, store_id, start_time, end_time, reason
) VALUES (
  'e4000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1)::TEXT || ' 00:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 2)::TEXT || ' 00:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  '整日休假'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1,
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001'
    )
  ),
  0::BIGINT,
  '老師整日休假時不回傳任何公開時段'
);

SELECT extensions.ok(
  private.is_practitioner_available_for_booking(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000002',
    (
      (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1)::TEXT || ' 10:00')::TIMESTAMP
        AT TIME ZONE 'Asia/Taipei'
    ),
    (
      (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1)::TEXT || ' 11:00')::TIMESTAMP
        AT TIME ZONE 'Asia/Taipei'
    )
  ),
  '共用判斷函式對未設定班表老師維持可用'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'private.is_practitioner_available_for_booking(uuid,uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  '匿名角色不可直接呼叫內部可用性函式'
);

SELECT * FROM extensions.finish();
ROLLBACK;
