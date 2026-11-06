BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(15);

INSERT INTO public.stores (
  id, name, booking_enabled, timezone, store_code, liff_id
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '圖文選單執行期店家',
  TRUE,
  'Asia/Taipei',
  'rich-menu-runtime',
  '1234567890-richmenu'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'd1000000-0000-0000-0000-000000000001',
  'rich-menu-runtime-admin@example.test',
  '{"full_name":"圖文選單執行期管理員"}'::JSONB
);

UPDATE public.users
SET store_id = 'd0000000-0000-0000-0000-000000000001', role = 'admin'::public.user_role
WHERE id = 'd1000000-0000-0000-0000-000000000001';

INSERT INTO public.store_channel_connections (
  id,
  store_id,
  channel,
  provider_id,
  provider_name,
  official_account_name,
  login_channel_id,
  liff_id,
  status,
  created_by
) VALUES (
  'd2000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'line',
  '1234567890',
  '執行期 Provider',
  '執行期官方帳號',
  '1234567890',
  '1234567890-richmenu',
  'active',
  'd1000000-0000-0000-0000-000000000001'
);

WITH secret_ids AS (
  SELECT
    vault.create_secret(
      'runtime-test-channel-access-token-1234567890',
      'line_rich_menu_runtime_access_token'
    ) AS access_token_secret_id,
    vault.create_secret(
      'runtime-test-channel-secret-1234567890',
      'line_rich_menu_runtime_channel_secret'
    ) AS channel_secret_secret_id
)
INSERT INTO private.store_line_messaging_credentials (
  store_id,
  connection_id,
  provider_id,
  messaging_channel_id,
  bot_user_id,
  bot_basic_id,
  bot_display_name,
  access_token_secret_id,
  channel_secret_secret_id,
  status
)
SELECT
  'd0000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  '1234567890',
  '1234567890',
  'U1234567890abcdef1234567890abcdef',
  '@runtime',
  '執行期官方帳號',
  secret_ids.access_token_secret_id,
  secret_ids.channel_secret_secret_id,
  'active'
FROM secret_ids;

SELECT extensions.is(
  (SELECT public FROM storage.buckets WHERE id = 'line-rich-menu-images'),
  FALSE,
  '圖文選單圖片桶不是公開桶'
);

SELECT extensions.is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'line-rich-menu-images'),
  1048576::BIGINT,
  '圖文選單圖片限制為 1 MB'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_line_rich_menu_publication(uuid)',
    'EXECUTE'
  ),
  '登入前端不能領取含 Token 的發布工作'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.claim_line_rich_menu_publication(uuid)',
    'EXECUTE'
  ),
  '僅 service_role 可領取發布工作'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_line_rich_menu_draft(
    '執行期主選單',
    '{
      "pages":[{
        "pageKey":"home","name":"首頁","layoutKey":"layout_1",
        "imagePath":"d0000000-0000-0000-0000-000000000001/home.png",
        "areas":[{"areaKey":"booking","x":0,"y":0,"width":2500,"height":1686,"action":{"type":"booking","value":""}}]
      }]}
    '::JSONB
  ) ->> 'ok',
  'true',
  '管理員可建立含私有圖片路徑的草稿'
);

SELECT extensions.is(
  public.queue_line_rich_menu_publication(
    (SELECT id FROM public.line_rich_menu_sets WHERE store_id = 'd0000000-0000-0000-0000-000000000001')
  ) ->> 'ok',
  'true',
  '完整草稿可排入發布'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT extensions.is(
  (
    SELECT channel_access_token
    FROM public.claim_line_rich_menu_publication(
      (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001')
    )
  ),
  'runtime-test-channel-access-token-1234567890',
  '發布服務可從 Vault 短暫取得正確 Token'
);

SELECT extensions.is(
  (
    SELECT store_code
    FROM public.claim_line_rich_menu_publication(
      (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001')
    )
  ),
  NULL,
  '同一發布工作不能被重複領取'
);

SELECT extensions.ok(
  public.complete_line_rich_menu_publication(
    (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001'),
    '{"home":{"richMenuId":"richmenu-test","aliasId":"bookr-home"}}'::JSONB
  ),
  '發布服務可完成已領取工作'
);

SELECT extensions.is(
  (SELECT status FROM public.line_rich_menu_sets WHERE store_id = 'd0000000-0000-0000-0000-000000000001'),
  'published',
  '完成後主設定狀態為已發布'
);

SELECT extensions.ok(
  public.upsert_line_rich_menu_daily_metric(
    (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001'),
    CURRENT_DATE - 1,
    'home',
    'booking',
    100,
    20,
    18
  ),
  '發布服務可寫入每日格子統計'
);

SELECT extensions.ok(
  public.upsert_line_rich_menu_daily_metric(
    (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001'),
    CURRENT_DATE - 1,
    'home',
    'booking',
    120,
    24,
    21
  ),
  '同一日同一格統計可安全覆寫'
);

SELECT extensions.is(
  (
    SELECT clicks
    FROM public.line_rich_menu_daily_metrics
    WHERE publication_id = (
      SELECT id FROM public.line_rich_menu_publications
      WHERE store_id = 'd0000000-0000-0000-0000-000000000001'
    )
      AND page_key = 'home'
      AND area_key = 'booking'
  ),
  24,
  '每日統計覆寫後不產生重複資料'
);

SELECT extensions.ok(
  NOT public.upsert_line_rich_menu_daily_metric(
    (SELECT id FROM public.line_rich_menu_publications WHERE store_id = 'd0000000-0000-0000-0000-000000000001'),
    CURRENT_DATE + 1,
    'home',
    'booking',
    1,
    1,
    1
  ),
  '未來日期的統計資料會被拒絕'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'd0000000-0000-0000-0000-000000000001'
      AND action = 'line_rich_menu_published'
  ),
  1::BIGINT,
  '發布成功會留下稽核紀錄'
);

RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
