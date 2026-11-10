-- ============================================================
-- LINE 圖文選單 Phase 2：自訂格子
-- 1. 允許 layout_custom，維持每頁 1～6 個矩形熱區
-- 2. 驗證所有熱區位於 2500 × 1686 畫布內且互不重疊
-- 3. 不新增公開權限，沿用既有管理員儲存與發布流程
-- ============================================================

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('bookr_line_rich_menu_custom_layouts'));

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
  v_layout_key TEXT;
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

    v_layout_key := COALESCE(v_page ->> 'layoutKey', '');
    IF v_layout_key !~ '^layout_([1-6]|custom)$' THEN
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
    IF v_layout_key = 'layout_custom' THEN
      IF v_area_count < 1 OR v_area_count > 6 THEN
        RETURN 'AREA_COUNT_OUT_OF_RANGE';
      END IF;
    ELSE
      v_expected_area_count := RIGHT(v_layout_key, 1)::INTEGER;
      IF v_area_count <> v_expected_area_count THEN
        RETURN 'AREA_COUNT_MISMATCH';
      END IF;
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

    IF EXISTS (
      SELECT 1
      FROM JSONB_ARRAY_ELEMENTS(v_page -> 'areas') WITH ORDINALITY AS left_area(area, position)
      JOIN JSONB_ARRAY_ELEMENTS(v_page -> 'areas') WITH ORDINALITY AS right_area(area, position)
        ON left_area.position < right_area.position
      WHERE (left_area.area ->> 'x')::INTEGER
          < (right_area.area ->> 'x')::INTEGER + (right_area.area ->> 'width')::INTEGER
        AND (left_area.area ->> 'x')::INTEGER + (left_area.area ->> 'width')::INTEGER
          > (right_area.area ->> 'x')::INTEGER
        AND (left_area.area ->> 'y')::INTEGER
          < (right_area.area ->> 'y')::INTEGER + (right_area.area ->> 'height')::INTEGER
        AND (left_area.area ->> 'y')::INTEGER + (left_area.area ->> 'height')::INTEGER
          > (right_area.area ->> 'y')::INTEGER
    ) THEN
      RETURN 'AREA_OVERLAP';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.line_rich_menu_config_error(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
