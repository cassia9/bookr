-- ============================================================
-- LINE 圖文選單執行期安全邊界
-- 1. 私有圖片桶依店家路徑隔離
-- 2. 發布工作僅由 service_role 領取，Token 只從 Vault 短暫回傳給 Edge Function
-- 3. 發布成功／失敗與每日統計透過固定 RPC 回寫
-- ============================================================

BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'line-rich-menu-images',
  'line-rich-menu-images',
  FALSE,
  1048576,
  ARRAY['image/png', 'image/jpeg']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS select_store_line_rich_menu_images
  ON storage.objects;
CREATE POLICY select_store_line_rich_menu_images
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'line-rich-menu-images'
    AND (storage.foldername(name))[1] = (SELECT public.current_store_id())::TEXT
  );

DROP POLICY IF EXISTS insert_admin_store_line_rich_menu_images
  ON storage.objects;
CREATE POLICY insert_admin_store_line_rich_menu_images
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'line-rich-menu-images'
    AND (storage.foldername(name))[1] = (SELECT public.current_store_id())::TEXT
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS update_admin_store_line_rich_menu_images
  ON storage.objects;
CREATE POLICY update_admin_store_line_rich_menu_images
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'line-rich-menu-images'
    AND (storage.foldername(name))[1] = (SELECT public.current_store_id())::TEXT
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'line-rich-menu-images'
    AND (storage.foldername(name))[1] = (SELECT public.current_store_id())::TEXT
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS delete_admin_store_line_rich_menu_images
  ON storage.objects;
CREATE POLICY delete_admin_store_line_rich_menu_images
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'line-rich-menu-images'
    AND (storage.foldername(name))[1] = (SELECT public.current_store_id())::TEXT
    AND (SELECT public.is_admin())
  );

CREATE OR REPLACE FUNCTION public.claim_line_rich_menu_publication(
  p_publication_id UUID
)
RETURNS TABLE (
  publication_id UUID,
  store_id UUID,
  set_id UUID,
  version_number INTEGER,
  config_snapshot JSONB,
  channel_access_token TEXT,
  store_code TEXT,
  liff_id TEXT,
  image_bucket TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.line_rich_menu_publications AS publication
    SET status = 'publishing'
    WHERE publication.id = p_publication_id
      AND publication.status = 'queued'
    RETURNING publication.*
  )
  SELECT
    claimed.id,
    claimed.store_id,
    claimed.set_id,
    claimed.version_number,
    claimed.config_snapshot,
    access_secret.decrypted_secret,
    COALESCE(store.store_code, store.booking_slug, store.id::TEXT),
    connection.liff_id,
    'line-rich-menu-images'::TEXT
  FROM claimed
  JOIN public.stores AS store
    ON store.id = claimed.store_id
  JOIN public.store_channel_connections AS connection
    ON connection.store_id = claimed.store_id
   AND connection.channel = 'line'
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.store_id = claimed.store_id
   AND credential.connection_id = connection.id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  JOIN vault.decrypted_secrets AS access_secret
    ON access_secret.id = credential.access_token_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_line_rich_menu_insight_job(
  p_publication_id UUID
)
RETURNS TABLE (
  publication_id UUID,
  store_id UUID,
  config_snapshot JSONB,
  line_resource_map JSONB,
  channel_access_token TEXT,
  published_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    publication.id,
    publication.store_id,
    publication.config_snapshot,
    publication.line_resource_map,
    access_secret.decrypted_secret,
    publication.published_at,
    publication.finished_at
  FROM public.line_rich_menu_publications AS publication
  JOIN public.store_channel_connections AS connection
    ON connection.store_id = publication.store_id
   AND connection.channel = 'line'
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.store_id = publication.store_id
   AND credential.connection_id = connection.id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  JOIN vault.decrypted_secrets AS access_secret
    ON access_secret.id = credential.access_token_secret_id
  WHERE publication.id = p_publication_id
    AND publication.status IN ('published', 'superseded')
    AND publication.line_resource_map <> '{}'::JSONB
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.complete_line_rich_menu_publication(
  p_publication_id UUID,
  p_line_resource_map JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication public.line_rich_menu_publications%ROWTYPE;
BEGIN
  IF p_line_resource_map IS NULL
    OR JSONB_TYPEOF(p_line_resource_map) <> 'object' THEN
    RETURN FALSE;
  END IF;

  SELECT publication.*
  INTO v_publication
  FROM public.line_rich_menu_publications AS publication
  WHERE publication.id = p_publication_id
    AND publication.status IN ('queued', 'publishing')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.line_rich_menu_publications
  SET
    status = 'superseded',
    finished_at = COALESCE(finished_at, NOW())
  WHERE set_id = v_publication.set_id
    AND id <> v_publication.id
    AND status = 'published';

  UPDATE public.line_rich_menu_publications
  SET
    status = 'published',
    line_resource_map = p_line_resource_map,
    error_code = NULL,
    error_message = NULL,
    published_at = NOW(),
    finished_at = NOW()
  WHERE id = v_publication.id;

  UPDATE public.line_rich_menu_sets
  SET
    status = 'published',
    active_publication_id = v_publication.id,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE id = v_publication.set_id
    AND store_id = v_publication.store_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    v_publication.requested_by,
    'line_rich_menu_published',
    'line_rich_menu_publications',
    v_publication.id,
    JSONB_BUILD_OBJECT(
      'set_id', v_publication.set_id,
      'version_number', v_publication.version_number,
      'resource_count', (
        SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_line_resource_map)
      )
    ),
    v_publication.store_id
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_line_rich_menu_publication(
  p_publication_id UUID,
  p_error_code TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication public.line_rich_menu_publications%ROWTYPE;
  v_error_code TEXT := LEFT(
    COALESCE(NULLIF(BTRIM(p_error_code), ''), 'UNKNOWN_ERROR'),
    80
  );
  v_error_message TEXT := LEFT(
    NULLIF(BTRIM(COALESCE(p_error_message, '')), ''),
    1000
  );
BEGIN
  UPDATE public.line_rich_menu_publications AS publication
  SET
    status = 'failed',
    error_code = v_error_code,
    error_message = v_error_message,
    finished_at = NOW()
  WHERE publication.id = p_publication_id
    AND publication.status IN ('queued', 'publishing')
  RETURNING publication.* INTO v_publication;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.line_rich_menu_sets
  SET
    status = 'failed',
    last_error_code = v_error_code,
    last_error_message = v_error_message
  WHERE id = v_publication.set_id
    AND store_id = v_publication.store_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    v_publication.requested_by,
    'line_rich_menu_publish_failed',
    'line_rich_menu_publications',
    v_publication.id,
    JSONB_BUILD_OBJECT(
      'set_id', v_publication.set_id,
      'version_number', v_publication.version_number,
      'error_code', v_error_code
    ),
    v_publication.store_id
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_line_rich_menu_daily_metric(
  p_publication_id UUID,
  p_metric_date DATE,
  p_page_key TEXT,
  p_area_key TEXT,
  p_impressions INTEGER,
  p_clicks INTEGER,
  p_unique_users INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID;
  v_page_key TEXT := NULLIF(BTRIM(COALESCE(p_page_key, '')), '');
  v_area_key TEXT := NULLIF(BTRIM(COALESCE(p_area_key, '')), '');
BEGIN
  IF p_publication_id IS NULL
    OR p_metric_date IS NULL
    OR p_metric_date > CURRENT_DATE
    OR p_metric_date < CURRENT_DATE - 400
    OR p_impressions < 0
    OR p_clicks < 0
    OR (p_unique_users IS NOT NULL AND p_unique_users < 0)
    OR CHAR_LENGTH(COALESCE(v_page_key, '')) > 40
    OR CHAR_LENGTH(COALESCE(v_area_key, '')) > 40 THEN
    RETURN FALSE;
  END IF;

  SELECT publication.store_id
  INTO v_store_id
  FROM public.line_rich_menu_publications AS publication
  WHERE publication.id = p_publication_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_publication_id::TEXT || ':' || p_metric_date::TEXT || ':'
        || COALESCE(v_page_key, '') || ':' || COALESCE(v_area_key, ''),
      0
    )
  );

  UPDATE public.line_rich_menu_daily_metrics AS metric
  SET
    impressions = p_impressions,
    clicks = p_clicks,
    unique_users = p_unique_users,
    synced_at = NOW()
  WHERE metric.publication_id = p_publication_id
    AND metric.metric_date = p_metric_date
    AND metric.page_key IS NOT DISTINCT FROM v_page_key
    AND metric.area_key IS NOT DISTINCT FROM v_area_key;

  IF NOT FOUND THEN
    INSERT INTO public.line_rich_menu_daily_metrics (
      store_id,
      publication_id,
      metric_date,
      page_key,
      area_key,
      impressions,
      clicks,
      unique_users
    ) VALUES (
      v_store_id,
      p_publication_id,
      p_metric_date,
      v_page_key,
      v_area_key,
      p_impressions,
      p_clicks,
      p_unique_users
    );
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_line_rich_menu_publication(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_line_rich_menu_insight_job(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_line_rich_menu_publication(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_line_rich_menu_publication(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_line_rich_menu_daily_metric(
  UUID, DATE, TEXT, TEXT, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_line_rich_menu_publication(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_line_rich_menu_insight_job(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_line_rich_menu_publication(UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_line_rich_menu_publication(UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_line_rich_menu_daily_metric(
  UUID, DATE, TEXT, TEXT, INTEGER, INTEGER, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.claim_line_rich_menu_publication(UUID) IS
  'service_role 專用：原子領取圖文選單發布工作，並從 Vault 取得短暫使用的 LINE Token。';

COMMENT ON FUNCTION public.get_line_rich_menu_insight_job(UUID) IS
  'service_role 專用：取得已發布圖文選單的匿名統計同步資料；LINE Token 不開放給前端角色。';

COMMIT;
