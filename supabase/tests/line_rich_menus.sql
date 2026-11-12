BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(22);

INSERT INTO public.stores (id, name, booking_enabled, timezone)
VALUES
  ('c0000000-0000-0000-0000-000000000001', '圖文選單測試店家', TRUE, 'Asia/Taipei'),
  ('c0000000-0000-0000-0000-000000000002', '圖文選單隔離店家', TRUE, 'Asia/Taipei');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'rich-menu-admin@example.test', '{"full_name":"圖文選單管理員"}'::JSONB),
  ('c1000000-0000-0000-0000-000000000002', 'rich-menu-member@example.test', '{"full_name":"圖文選單一般成員"}'::JSONB),
  ('c1000000-0000-0000-0000-000000000003', 'rich-menu-other@example.test', '{"full_name":"隔離管理員"}'::JSONB);

UPDATE public.users
SET store_id = 'c0000000-0000-0000-0000-000000000001', role = 'admin'::public.user_role
WHERE id = 'c1000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = 'c0000000-0000-0000-0000-000000000001', role = 'member'::public.user_role
WHERE id = 'c1000000-0000-0000-0000-000000000002';

UPDATE public.users
SET store_id = 'c0000000-0000-0000-0000-000000000002', role = 'admin'::public.user_role
WHERE id = 'c1000000-0000-0000-0000-000000000003';

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public' AND class.relname = 'line_rich_menu_sets'
  ),
  'line_rich_menu_sets 已啟用 RLS'
);

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public' AND class.relname = 'line_rich_menu_publications'
  ),
  'line_rich_menu_publications 已啟用 RLS'
);

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public' AND class.relname = 'line_rich_menu_daily_metrics'
  ),
  'line_rich_menu_daily_metrics 已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.line_rich_menu_sets', 'SELECT'),
  '匿名角色不能讀取圖文選單草稿'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '一般成員不可儲存',
    '{"pages":[]}'::JSONB
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不能儲存圖文選單'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '主選單',
    '{
      "pages":[{
        "pageKey":"home",
        "name":"首頁",
        "layoutKey":"layout_2",
        "imagePath":null,
        "areas":[
          {"areaKey":"booking","x":0,"y":0,"width":1250,"height":1686,"action":{"type":"booking","value":""}},
          {"areaKey":"account","x":1250,"y":0,"width":1250,"height":1686,"action":{"type":"customer_center","value":""}}
        ]
      }]}
    '::JSONB
  ) ->> 'ok',
  'true',
  '管理員可儲存有效的兩格草稿'
);

SELECT extensions.is(
  (SELECT name FROM public.line_rich_menu_sets),
  '主選單',
  '草稿名稱已正規化並保存'
);

SELECT extensions.is(
  (SELECT status FROM public.line_rich_menu_sets),
  'draft',
  '儲存後狀態為草稿'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft('空白頁面', '{"pages":[]}'::JSONB) ->> 'error',
  'PAGE_COUNT_OUT_OF_RANGE',
  '至少需要一個頁面'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '不安全網址',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_1","imagePath":null,
        "areas":[{"areaKey":"link","x":0,"y":0,"width":2500,"height":1686,"action":{"type":"uri","value":"http://example.com"}}]
      }]}
    '::JSONB
  ) ->> 'error',
  'ACTION_URI_INVALID',
  '自訂網址只接受 HTTPS'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '錯誤頁面切換',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_1","imagePath":null,
        "areas":[{"areaKey":"next","x":0,"y":0,"width":2500,"height":1686,"action":{"type":"page_switch","value":"missing"}}]
      }]}
    '::JSONB
  ) ->> 'error',
  'ACTION_PAGE_TARGET_INVALID',
  '分頁切換目標必須存在'
);

SELECT extensions.is(
  public.queue_line_rich_menu_publication(
    (SELECT id FROM public.line_rich_menu_sets)
  ) ->> 'error',
  'IMAGE_REQUIRED',
  '沒有頁面圖片不能排入發布'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '可發布主選單',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_1","imagePath":"rich-menus/home.png",
        "areas":[{"areaKey":"booking","x":0,"y":0,"width":2500,"height":1686,"action":{"type":"booking","value":""}}]
      }]}
    '::JSONB
  ) ->> 'ok',
  'true',
  '管理員可補上圖片後更新草稿'
);

SELECT extensions.is(
  public.queue_line_rich_menu_publication(
    (SELECT id FROM public.line_rich_menu_sets)
  ) ->> 'ok',
  'true',
  '管理員可將完整草稿排入發布'
);

SELECT extensions.is(
  (SELECT version_number FROM public.line_rich_menu_publications),
  1,
  '第一次發布快照版本為 1'
);

SELECT extensions.is(
  (SELECT status FROM public.line_rich_menu_sets),
  'publishing',
  '排入發布後主設定顯示發布中'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'c0000000-0000-0000-0000-000000000001'
      AND table_name IN ('line_rich_menu_sets', 'line_rich_menu_publications')
  ),
  3::BIGINT,
  '草稿建立、更新與排入發布都有稽核紀錄'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '自訂版型',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_custom","imagePath":"rich-menus/home.png",
        "areas":[
          {"areaKey":"booking","x":0,"y":0,"width":1500,"height":1686,"action":{"type":"booking","value":""}},
          {"areaKey":"account","x":1500,"y":0,"width":1000,"height":1686,"action":{"type":"customer_center","value":""}}
        ]
      }]}
    '::JSONB
  ) ->> 'ok',
  'true',
  '管理員可儲存互不重疊的自訂格子'
);

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '重疊版型',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_custom","imagePath":"rich-menus/home.png",
        "areas":[
          {"areaKey":"booking","x":0,"y":0,"width":1500,"height":1686,"action":{"type":"booking","value":""}},
          {"areaKey":"account","x":1000,"y":0,"width":1500,"height":1686,"action":{"type":"customer_center","value":""}}
        ]
      }]}
    '::JSONB
  ) ->> 'error',
  'AREA_OVERLAP',
  '自訂格子不可彼此重疊'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.line_rich_menu_sets),
  1::BIGINT,
  '同店一般成員可查看圖文選單狀態'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c1000000-0000-0000-0000-000000000003"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.line_rich_menu_sets),
  0::BIGINT,
  '其他店家看不到圖文選單資料'
);

SELECT extensions.is(
  public.queue_line_rich_menu_publication(
    'c2000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'RICH_MENU_NOT_FOUND',
  '其他店家無法排入不屬於自己的圖文選單'
);

RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
