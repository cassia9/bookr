BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(15);

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
  'c0000000-0000-0000-0000-000000000001',
  '即時預約門檻測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '00:00',
  '23:59',
  60,
  '1234567890'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'lead-admin@example.test',
  '{"full_name":"門檻管理員"}'::JSONB
);

UPDATE public.users
SET store_id = 'c0000000-0000-0000-0000-000000000001',
    role = 'admin'::public.user_role
WHERE id = 'c1000000-0000-0000-0000-000000000001';

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  'c2000000-0000-0000-0000-000000000001',
  '即時預約測試服務',
  15,
  600,
  TRUE,
  'c0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'c3000000-0000-0000-0000-000000000001',
  '即時預約測試老師',
  '#84CC16',
  TRUE,
  'c0000000-0000-0000-0000-000000000001'
);

SELECT extensions.is(
  (
    SELECT same_day_booking_lead_minutes
    FROM public.stores
    WHERE id = 'c0000000-0000-0000-0000-000000000001'
  ),
  60,
  '店家可保存 60 分鐘門檻'
);

SELECT extensions.throws_ok(
  $$UPDATE public.stores
    SET same_day_booking_lead_minutes = 45
    WHERE id = 'c0000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  '門檻只允許 15、30、60、120 分鐘'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE,
      'c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001'
    ) AS slot
    WHERE (
      ((NOW() AT TIME ZONE 'Asia/Taipei')::DATE::TEXT || ' ' || slot.slot_time)::TIMESTAMP
        AT TIME ZONE 'Asia/Taipei'
    ) < NOW() + INTERVAL '60 minutes'
  ),
  '今日時段查詢不回傳早於 60 分鐘門檻的時段'
);

SELECT extensions.ok(
  (
    SELECT BOOL_AND(EXTRACT(MINUTE FROM slot.slot_time::TIME)::INTEGER % 15 = 0)
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1,
      'c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001'
    ) AS slot
  ),
  '回傳時段維持 15 分鐘格線'
);

SELECT extensions.ok(
  (
    SELECT COUNT(*) > 0
    FROM public.get_available_slots(
      (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1,
      'c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001'
    )
  ),
  '未來日期不受當日門檻裁切'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.is(
  public.create_booking_public(
    '過早網頁客戶',
    '0911000001',
    'c2000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '15 minutes',
    NULL,
    'c0000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'BOOKING_TOO_SOON',
  '一般網頁預約送出層阻擋過早時段'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT extensions.is(
  public.create_line_booking(
    '過早 LINE 客戶',
    '0911000002',
    'c2000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '15 minutes',
    'c0000000-0000-0000-0000-000000000001',
    '1234567890',
    'U0123456789abcdef0123456789abcdef',
    'LINE 測試客戶',
    NULL,
    NULL
  ) ->> 'error',
  'BOOKING_TOO_SOON',
  'LINE 預約送出層阻擋過早時段'
);

RESET ROLE;
SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.ok(
  (
    public.create_booking_public(
      '未來網頁客戶',
      '0911000003',
      'c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      (
        ((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 1)::TEXT
          || ' 10:00 Asia/Taipei'
      )::TIMESTAMPTZ,
      NULL,
      'c0000000-0000-0000-0000-000000000001'
    ) ->> 'ok'
  )::BOOLEAN,
  '未來日期的公開預約可正常建立'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

UPDATE public.stores
SET same_day_booking_lead_minutes = 15
WHERE id = 'c0000000-0000-0000-0000-000000000001';

SELECT extensions.is(
  (
    SELECT same_day_booking_lead_minutes
    FROM public.stores
    WHERE id = 'c0000000-0000-0000-0000-000000000001'
  ),
  15,
  '管理員可把門檻調整為 15 分鐘'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'c0000000-0000-0000-0000-000000000001'
      AND action = 'same_day_booking_lead_updated'
  ),
  1::BIGINT,
  '門檻變更留下單筆稽核紀錄'
);

SELECT extensions.is(
  (
    SELECT old_values ->> 'same_day_booking_lead_minutes'
    FROM public.audit_logs
    WHERE store_id = 'c0000000-0000-0000-0000-000000000001'
      AND action = 'same_day_booking_lead_updated'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  '60',
  '稽核紀錄保存修改前門檻'
);

SELECT extensions.is(
  (
    SELECT new_values ->> 'same_day_booking_lead_minutes'
    FROM public.audit_logs
    WHERE store_id = 'c0000000-0000-0000-0000-000000000001'
      AND action = 'same_day_booking_lead_updated'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  '15',
  '稽核紀錄保存修改後門檻'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.create_booking_public_unchecked(text,text,uuid,uuid,timestamptz,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  '匿名角色不可直接呼叫未檢查門檻的舊實作'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'service_role',
    'public.create_line_booking_unchecked(text,text,uuid,uuid,timestamptz,uuid,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service_role 不可直接呼叫未檢查門檻的 LINE 舊實作'
);

SELECT extensions.ok(
  has_function_privilege(
    'anon',
    'public.create_booking_public(text,text,uuid,uuid,timestamptz,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  '匿名角色仍可呼叫受保護的一般公開預約入口'
);

RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
