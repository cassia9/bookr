-- ============================================================
-- LINE 圖文選單 Phase 1
-- 1. 每店一份可編輯草稿與目前發布版本
-- 2. 發布時保留不可變快照，支援失敗回復與稽核
-- 3. 每日彙整曝光與點擊資料，保留頁面／格子維度
-- 4. 同店成員可查看，僅管理員可儲存與排入發布
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.line_rich_menu_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'LINE 圖文選單',
  status TEXT NOT NULL DEFAULT 'draft',
  draft_config JSONB NOT NULL,
  active_publication_id UUID,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_rich_menu_sets_name_check CHECK (
    CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT line_rich_menu_sets_status_check CHECK (
    status IN ('draft', 'publishing', 'published', 'failed')
  ),
  CONSTRAINT line_rich_menu_sets_draft_config_object_check CHECK (
    JSONB_TYPEOF(draft_config) = 'object'
  ),
  CONSTRAINT line_rich_menu_sets_error_code_check CHECK (
    last_error_code IS NULL OR CHAR_LENGTH(last_error_code) <= 80
  ),
  CONSTRAINT line_rich_menu_sets_error_message_check CHECK (
    last_error_message IS NULL OR CHAR_LENGTH(last_error_message) <= 1000
  )
);

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_sets_created_by
  ON public.line_rich_menu_sets (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_sets_updated_by
  ON public.line_rich_menu_sets (updated_by)
  WHERE updated_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.line_rich_menu_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES public.line_rich_menu_sets(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  config_snapshot JSONB NOT NULL,
  line_resource_map JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_code TEXT,
  error_message TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT line_rich_menu_publications_version_check CHECK (version_number > 0),
  CONSTRAINT line_rich_menu_publications_status_check CHECK (
    status IN ('queued', 'publishing', 'published', 'failed', 'superseded')
  ),
  CONSTRAINT line_rich_menu_publications_config_object_check CHECK (
    JSONB_TYPEOF(config_snapshot) = 'object'
  ),
  CONSTRAINT line_rich_menu_publications_resource_map_object_check CHECK (
    JSONB_TYPEOF(line_resource_map) = 'object'
  ),
  CONSTRAINT line_rich_menu_publications_error_code_check CHECK (
    error_code IS NULL OR CHAR_LENGTH(error_code) <= 80
  ),
  CONSTRAINT line_rich_menu_publications_error_message_check CHECK (
    error_message IS NULL OR CHAR_LENGTH(error_message) <= 1000
  ),
  CONSTRAINT line_rich_menu_publications_set_version_unique UNIQUE (set_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_publications_store_requested
  ON public.line_rich_menu_publications (store_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_publications_store_status
  ON public.line_rich_menu_publications (store_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_publications_requested_by
  ON public.line_rich_menu_publications (requested_by)
  WHERE requested_by IS NOT NULL;

ALTER TABLE public.line_rich_menu_sets
  DROP CONSTRAINT IF EXISTS line_rich_menu_sets_active_publication_id_fkey;

ALTER TABLE public.line_rich_menu_sets
  ADD CONSTRAINT line_rich_menu_sets_active_publication_id_fkey
  FOREIGN KEY (active_publication_id)
  REFERENCES public.line_rich_menu_publications(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_sets_active_publication
  ON public.line_rich_menu_sets (active_publication_id)
  WHERE active_publication_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.line_rich_menu_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES public.line_rich_menu_publications(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  page_key TEXT,
  area_key TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_rich_menu_daily_metrics_page_key_check CHECK (
    page_key IS NULL OR CHAR_LENGTH(page_key) BETWEEN 1 AND 40
  ),
  CONSTRAINT line_rich_menu_daily_metrics_area_key_check CHECK (
    area_key IS NULL OR CHAR_LENGTH(area_key) BETWEEN 1 AND 40
  ),
  CONSTRAINT line_rich_menu_daily_metrics_counts_check CHECK (
    impressions >= 0
    AND clicks >= 0
    AND (unique_users IS NULL OR unique_users >= 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_rich_menu_daily_metrics_identity
  ON public.line_rich_menu_daily_metrics (
    publication_id,
    metric_date,
    COALESCE(page_key, ''),
    COALESCE(area_key, '')
  );

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_daily_metrics_store_date
  ON public.line_rich_menu_daily_metrics (store_id, metric_date DESC);

ALTER TABLE public.line_rich_menu_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_rich_menu_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_rich_menu_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_store_line_rich_menu_sets
  ON public.line_rich_menu_sets;
CREATE POLICY select_store_line_rich_menu_sets
  ON public.line_rich_menu_sets
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS select_store_line_rich_menu_publications
  ON public.line_rich_menu_publications;
CREATE POLICY select_store_line_rich_menu_publications
  ON public.line_rich_menu_publications
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS select_store_line_rich_menu_daily_metrics
  ON public.line_rich_menu_daily_metrics;
CREATE POLICY select_store_line_rich_menu_daily_metrics
  ON public.line_rich_menu_daily_metrics
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL ON TABLE public.line_rich_menu_sets
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.line_rich_menu_publications
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.line_rich_menu_daily_metrics
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.line_rich_menu_sets TO authenticated;
GRANT SELECT ON TABLE public.line_rich_menu_publications TO authenticated;
GRANT SELECT ON TABLE public.line_rich_menu_daily_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.line_rich_menu_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.line_rich_menu_publications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.line_rich_menu_daily_metrics TO service_role;

CREATE OR REPLACE FUNCTION private.line_rich_menu_config_error(
  p_config JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_page JSONB;
  v_area JSONB;
  v_page_count INTEGER;
  v_area_count INTEGER;
  v_expected_area_count INTEGER;
  v_action_type TEXT;
  v_action_value TEXT;
BEGIN
  IF p_config IS NULL OR JSONB_TYPEOF(p_config) <> 'object' THEN
    RETURN 'CONFIG_NOT_OBJECT';
  END IF;

  IF JSONB_TYPEOF(p_config -> 'pages') <> 'array' THEN
    RETURN 'PAGES_NOT_ARRAY';
  END IF;

  v_page_count := JSONB_ARRAY_LENGTH(p_config -> 'pages');
  IF v_page_count < 1 OR v_page_count > 3 THEN
    RETURN 'PAGE_COUNT_OUT_OF_RANGE';
  END IF;

  IF (
    SELECT COUNT(DISTINCT page ->> 'pageKey')
    FROM JSONB_ARRAY_ELEMENTS(p_config -> 'pages') AS page
  ) <> v_page_count THEN
    RETURN 'PAGE_KEY_DUPLICATED';
  END IF;

  FOR v_page IN
    SELECT page FROM JSONB_ARRAY_ELEMENTS(p_config -> 'pages') AS page
  LOOP
    IF JSONB_TYPEOF(v_page) <> 'object'
      OR COALESCE(CHAR_LENGTH(v_page ->> 'pageKey'), 0) NOT BETWEEN 1 AND 40
      OR COALESCE(CHAR_LENGTH(v_page ->> 'name'), 0) NOT BETWEEN 1 AND 40 THEN
      RETURN 'PAGE_INVALID';
    END IF;

    IF COALESCE(v_page ->> 'layoutKey', '') !~ '^layout_[1-6]$' THEN
      RETURN 'LAYOUT_INVALID';
    END IF;

    IF v_page ? 'imagePath'
      AND v_page -> 'imagePath' <> 'null'::JSONB
      AND (
        JSONB_TYPEOF(v_page -> 'imagePath') <> 'string'
        OR CHAR_LENGTH(v_page ->> 'imagePath') > 500
      ) THEN
      RETURN 'IMAGE_PATH_INVALID';
    END IF;

    IF JSONB_TYPEOF(v_page -> 'areas') <> 'array' THEN
      RETURN 'AREAS_NOT_ARRAY';
    END IF;

    v_area_count := JSONB_ARRAY_LENGTH(v_page -> 'areas');
    v_expected_area_count := RIGHT(v_page ->> 'layoutKey', 1)::INTEGER;
    IF v_area_count <> v_expected_area_count THEN
      RETURN 'AREA_COUNT_MISMATCH';
    END IF;

    IF (
      SELECT COUNT(DISTINCT area ->> 'areaKey')
      FROM JSONB_ARRAY_ELEMENTS(v_page -> 'areas') AS area
    ) <> v_area_count THEN
      RETURN 'AREA_KEY_DUPLICATED';
    END IF;

    FOR v_area IN
      SELECT area FROM JSONB_ARRAY_ELEMENTS(v_page -> 'areas') AS area
    LOOP
      IF JSONB_TYPEOF(v_area) <> 'object'
        OR COALESCE(CHAR_LENGTH(v_area ->> 'areaKey'), 0) NOT BETWEEN 1 AND 40
        OR COALESCE(v_area ->> 'x', '') !~ '^[0-9]+$'
        OR COALESCE(v_area ->> 'y', '') !~ '^[0-9]+$'
        OR COALESCE(v_area ->> 'width', '') !~ '^[0-9]+$'
        OR COALESCE(v_area ->> 'height', '') !~ '^[0-9]+$' THEN
        RETURN 'AREA_BOUNDS_INVALID';
      END IF;

      IF (v_area ->> 'width')::INTEGER < 1
        OR (v_area ->> 'height')::INTEGER < 1
        OR (v_area ->> 'x')::INTEGER + (v_area ->> 'width')::INTEGER > 2500
        OR (v_area ->> 'y')::INTEGER + (v_area ->> 'height')::INTEGER > 1686 THEN
        RETURN 'AREA_BOUNDS_INVALID';
      END IF;

      v_action_type := COALESCE(v_area #>> '{action,type}', '');
      v_action_value := BTRIM(COALESCE(v_area #>> '{action,value}', ''));

      IF v_action_type NOT IN (
        'booking', 'customer_center', 'uri', 'message', 'page_switch', 'none'
      ) THEN
        RETURN 'ACTION_TYPE_INVALID';
      END IF;

      IF v_action_type = 'uri'
        AND (v_action_value !~ '^https://' OR CHAR_LENGTH(v_action_value) > 2048) THEN
        RETURN 'ACTION_URI_INVALID';
      END IF;

      IF v_action_type = 'message'
        AND CHAR_LENGTH(v_action_value) NOT BETWEEN 1 AND 300 THEN
        RETURN 'ACTION_MESSAGE_INVALID';
      END IF;

      IF v_action_type = 'page_switch'
        AND NOT EXISTS (
          SELECT 1
          FROM JSONB_ARRAY_ELEMENTS(p_config -> 'pages') AS target_page
          WHERE target_page ->> 'pageKey' = v_action_value
        ) THEN
        RETURN 'ACTION_PAGE_TARGET_INVALID';
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.line_rich_menu_config_error(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.set_line_rich_menu_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_line_rich_menu_set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS set_line_rich_menu_sets_updated_at
  ON public.line_rich_menu_sets;
CREATE TRIGGER set_line_rich_menu_sets_updated_at
  BEFORE UPDATE ON public.line_rich_menu_sets
  FOR EACH ROW
  EXECUTE FUNCTION private.set_line_rich_menu_set_updated_at();

CREATE OR REPLACE FUNCTION public.save_line_rich_menu_draft(
  p_name TEXT,
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := (SELECT auth.uid());
  v_store_id UUID := public.current_store_id();
  v_name TEXT := NULLIF(BTRIM(COALESCE(p_name, '')), '');
  v_config_error TEXT;
  v_set public.line_rich_menu_sets%ROWTYPE;
  v_previous public.line_rich_menu_sets%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF v_name IS NULL OR CHAR_LENGTH(v_name) > 80 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_NAME');
  END IF;

  v_config_error := private.line_rich_menu_config_error(p_config);
  IF v_config_error IS NOT NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', v_config_error);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_store_id::TEXT || ':line-rich-menu', 0)
  );

  SELECT rich_menu.*
  INTO v_previous
  FROM public.line_rich_menu_sets AS rich_menu
  WHERE rich_menu.store_id = v_store_id
  FOR UPDATE;

  INSERT INTO public.line_rich_menu_sets (
    store_id,
    name,
    status,
    draft_config,
    created_by,
    updated_by
  ) VALUES (
    v_store_id,
    v_name,
    'draft',
    p_config,
    v_actor_id,
    v_actor_id
  )
  ON CONFLICT (store_id) DO UPDATE
  SET
    name = EXCLUDED.name,
    status = 'draft',
    draft_config = EXCLUDED.draft_config,
    last_error_code = NULL,
    last_error_message = NULL,
    updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_set;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    store_id
  ) VALUES (
    v_actor_id,
    CASE WHEN v_previous.id IS NULL
      THEN 'line_rich_menu_draft_created'
      ELSE 'line_rich_menu_draft_updated'
    END,
    'line_rich_menu_sets',
    v_set.id,
    CASE WHEN v_previous.id IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
      'name', v_previous.name,
      'status', v_previous.status,
      'page_count', JSONB_ARRAY_LENGTH(v_previous.draft_config -> 'pages'),
      'config_digest', MD5(v_previous.draft_config::TEXT)
    ) END,
    JSONB_BUILD_OBJECT(
      'name', v_set.name,
      'status', v_set.status,
      'page_count', JSONB_ARRAY_LENGTH(v_set.draft_config -> 'pages'),
      'config_digest', MD5(v_set.draft_config::TEXT)
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_set.id,
    'status', v_set.status,
    'updated_at', v_set.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_line_rich_menu_publication(
  p_set_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := (SELECT auth.uid());
  v_store_id UUID := public.current_store_id();
  v_set public.line_rich_menu_sets%ROWTYPE;
  v_publication_id UUID;
  v_version_number INTEGER;
BEGIN
  IF v_actor_id IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_store_id::TEXT || ':line-rich-menu', 0)
  );

  SELECT rich_menu.*
  INTO v_set
  FROM public.line_rich_menu_sets AS rich_menu
  WHERE rich_menu.id = p_set_id
    AND rich_menu.store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'RICH_MENU_NOT_FOUND');
  END IF;

  IF private.line_rich_menu_config_error(v_set.draft_config) IS NOT NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_DRAFT');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(v_set.draft_config -> 'pages') AS page
    WHERE NULLIF(BTRIM(COALESCE(page ->> 'imagePath', '')), '') IS NULL
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'IMAGE_REQUIRED');
  END IF;

  SELECT COALESCE(MAX(publication.version_number), 0) + 1
  INTO v_version_number
  FROM public.line_rich_menu_publications AS publication
  WHERE publication.set_id = v_set.id;

  INSERT INTO public.line_rich_menu_publications (
    set_id,
    store_id,
    version_number,
    status,
    config_snapshot,
    requested_by
  ) VALUES (
    v_set.id,
    v_store_id,
    v_version_number,
    'queued',
    v_set.draft_config,
    v_actor_id
  )
  RETURNING id INTO v_publication_id;

  UPDATE public.line_rich_menu_sets
  SET
    status = 'publishing',
    last_error_code = NULL,
    last_error_message = NULL,
    updated_by = v_actor_id
  WHERE id = v_set.id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    v_actor_id,
    'line_rich_menu_publication_queued',
    'line_rich_menu_publications',
    v_publication_id,
    JSONB_BUILD_OBJECT(
      'set_id', v_set.id,
      'version_number', v_version_number,
      'page_count', JSONB_ARRAY_LENGTH(v_set.draft_config -> 'pages')
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'publication_id', v_publication_id,
    'version_number', v_version_number,
    'status', 'queued'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_line_rich_menu_draft(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_line_rich_menu_draft(TEXT, JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.queue_line_rich_menu_publication(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_line_rich_menu_publication(UUID)
  TO authenticated;

COMMIT;
