-- ============================================================
-- 店家官方 LINE 串接生命週期
--
-- 原則：
-- 1. stores 只保存目前有效的 LIFF／Channel 快取，歷史放在連線表。
-- 2. 只有店家管理員可透過受控 RPC 串接、補齊或解除。
-- 3. 同 Provider 重綁延續身分；跨 Provider 軟封存舊身分。
-- 4. 一般網頁預約與既有預約歷史永遠不因解除 LINE 而刪除。
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  provider_id TEXT,
  provider_name TEXT,
  official_account_name TEXT,
  official_account_basic_id TEXT,
  login_channel_id TEXT NOT NULL,
  liff_id TEXT NOT NULL,
  connection_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  disconnected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_channel_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_channel_check
      CHECK (channel IN ('line', 'messenger', 'instagram'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_provider_id_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_provider_id_check
      CHECK (provider_id IS NULL OR provider_id ~ '^[0-9]{1,32}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_login_channel_id_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_login_channel_id_check
      CHECK (login_channel_id ~ '^[0-9]{5,32}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_liff_id_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_liff_id_check
      CHECK (liff_id ~ '^[0-9]+-[A-Za-z0-9_-]+$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_text_length_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_text_length_check
      CHECK (
        (provider_name IS NULL OR CHAR_LENGTH(provider_name) BETWEEN 1 AND 100)
        AND (official_account_name IS NULL OR CHAR_LENGTH(official_account_name) BETWEEN 1 AND 100)
        AND (official_account_basic_id IS NULL OR CHAR_LENGTH(official_account_basic_id) BETWEEN 1 AND 100)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_version_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_version_check
      CHECK (connection_version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'store_channel_connections_status_check'
      AND conrelid = 'public.store_channel_connections'::REGCLASS
  ) THEN
    ALTER TABLE public.store_channel_connections
      ADD CONSTRAINT store_channel_connections_status_check
      CHECK (
        (
          status = 'active'
          AND disconnected_at IS NULL
          AND disconnected_by IS NULL
        )
        OR (
          status = 'disconnected'
          AND disconnected_at IS NOT NULL
        )
      );
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_channel_connections_active
  ON public.store_channel_connections (store_id, channel)
  WHERE status = 'active' AND disconnected_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_channel_connections_version
  ON public.store_channel_connections (store_id, channel, connection_version);

CREATE INDEX IF NOT EXISTS idx_store_channel_connections_history
  ON public.store_channel_connections (store_id, channel, connection_version DESC);

CREATE INDEX IF NOT EXISTS idx_store_channel_connections_created_by
  ON public.store_channel_connections (created_by);

CREATE INDEX IF NOT EXISTS idx_store_channel_connections_disconnected_by
  ON public.store_channel_connections (disconnected_by)
  WHERE disconnected_by IS NOT NULL;

ALTER TABLE public.store_channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_admin_store_channel_connections"
  ON public.store_channel_connections;

CREATE POLICY "select_admin_store_channel_connections"
  ON public.store_channel_connections
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

REVOKE ALL PRIVILEGES ON TABLE public.store_channel_connections
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.store_channel_connections TO authenticated;

-- 將第一階段既有設定轉成歷史起點。Provider／官方帳號資料未知時保留 NULL，
-- 後台會標示「資料待補」，不會覆蓋或遺失原本有效設定。
INSERT INTO public.store_channel_connections (
  store_id,
  channel,
  login_channel_id,
  liff_id,
  connection_version,
  status,
  connected_at,
  created_at,
  updated_at
)
SELECT
  store.id,
  'line',
  store.line_login_channel_id,
  store.liff_id,
  1,
  'active',
  NOW(),
  NOW(),
  NOW()
FROM public.stores AS store
WHERE store.line_login_channel_id IS NOT NULL
  AND store.liff_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.store_channel_connections AS existing
    WHERE existing.store_id = store.id
      AND existing.channel = 'line'
      AND existing.status = 'active'
      AND existing.disconnected_at IS NULL
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.manage_store_line_connection(
  p_action TEXT,
  p_provider_id TEXT DEFAULT NULL,
  p_provider_name TEXT DEFAULT NULL,
  p_official_account_name TEXT DEFAULT NULL,
  p_official_account_basic_id TEXT DEFAULT NULL,
  p_line_login_channel_id TEXT DEFAULT NULL,
  p_liff_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action TEXT := LOWER(BTRIM(COALESCE(p_action, '')));
  v_actor_id UUID := (SELECT auth.uid());
  v_store_id UUID := public.current_store_id();
  v_provider_id TEXT := NULLIF(BTRIM(p_provider_id), '');
  v_provider_name TEXT := NULLIF(BTRIM(p_provider_name), '');
  v_official_account_name TEXT := NULLIF(BTRIM(p_official_account_name), '');
  v_official_account_basic_id TEXT := NULLIF(BTRIM(p_official_account_basic_id), '');
  v_login_channel_id TEXT := NULLIF(BTRIM(p_line_login_channel_id), '');
  v_liff_id TEXT := NULLIF(BTRIM(p_liff_id), '');
  v_active public.store_channel_connections%ROWTYPE;
  v_previous public.store_channel_connections%ROWTYPE;
  v_connection public.store_channel_connections%ROWTYPE;
  v_old_values JSONB;
  v_new_values JSONB;
  v_same_provider BOOLEAN := FALSE;
  v_archived_count INTEGER := 0;
  v_migrated_count INTEGER := 0;
  v_next_version INTEGER := 1;
BEGIN
  IF v_actor_id IS NULL OR v_store_id IS NULL OR NOT public.is_admin() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF v_action NOT IN ('connect', 'disconnect') THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_ACTION');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_store_id::TEXT || ':line-connection', 3)
  );

  SELECT connection.*
  INTO v_active
  FROM public.store_channel_connections AS connection
  WHERE connection.store_id = v_store_id
    AND connection.channel = 'line'
    AND connection.status = 'active'
    AND connection.disconnected_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_action = 'disconnect' THEN
    IF v_active.id IS NULL THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'NOT_CONNECTED');
    END IF;

    v_old_values := JSONB_BUILD_OBJECT(
      'provider_id', v_active.provider_id,
      'provider_name', v_active.provider_name,
      'official_account_name', v_active.official_account_name,
      'official_account_basic_id', v_active.official_account_basic_id,
      'line_login_channel_id', v_active.login_channel_id,
      'liff_id', v_active.liff_id,
      'connection_version', v_active.connection_version,
      'status', v_active.status
    );

    UPDATE public.store_channel_connections
    SET
      status = 'disconnected',
      disconnected_at = NOW(),
      disconnected_by = v_actor_id,
      updated_at = NOW()
    WHERE id = v_active.id
    RETURNING * INTO v_connection;

    UPDATE public.stores
    SET
      liff_id = NULL,
      line_login_channel_id = NULL
    WHERE id = v_store_id;

    v_new_values := v_old_values || JSONB_BUILD_OBJECT(
      'status', 'disconnected',
      'disconnected_at', v_connection.disconnected_at
    );

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
      'line_connection_disconnected',
      'store_channel_connections',
      v_connection.id,
      v_old_values,
      v_new_values,
      v_store_id
    );

    RETURN JSONB_BUILD_OBJECT(
      'ok', TRUE,
      'mode', 'disconnected',
      'connection_id', v_connection.id,
      'web_booking_preserved', TRUE
    );
  END IF;

  IF v_provider_id IS NULL
    OR v_provider_id !~ '^[0-9]{1,32}$'
    OR v_provider_name IS NULL
    OR CHAR_LENGTH(v_provider_name) > 100
    OR v_provider_name ~ '[[:cntrl:]]'
    OR v_official_account_name IS NULL
    OR CHAR_LENGTH(v_official_account_name) > 100
    OR v_official_account_name ~ '[[:cntrl:]]'
    OR v_login_channel_id IS NULL
    OR v_login_channel_id !~ '^[0-9]{5,32}$'
    OR v_liff_id IS NULL
    OR v_liff_id !~ '^[0-9]+-[A-Za-z0-9_-]+$'
    OR (
      v_official_account_basic_id IS NOT NULL
      AND (
        CHAR_LENGTH(v_official_account_basic_id) > 100
        OR v_official_account_basic_id ~ '[[:cntrl:]]'
      )
    )
  THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  -- 相同有效 Channel／LIFF 可補齊或更新公開顯示資料；更換識別值必須先解除。
  IF v_active.id IS NOT NULL THEN
    IF v_active.login_channel_id <> v_login_channel_id
      OR v_active.liff_id <> v_liff_id
      OR (v_active.provider_id IS NOT NULL AND v_active.provider_id <> v_provider_id)
    THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'DISCONNECT_REQUIRED');
    END IF;

    v_old_values := JSONB_BUILD_OBJECT(
      'provider_id', v_active.provider_id,
      'provider_name', v_active.provider_name,
      'official_account_name', v_active.official_account_name,
      'official_account_basic_id', v_active.official_account_basic_id,
      'line_login_channel_id', v_active.login_channel_id,
      'liff_id', v_active.liff_id,
      'connection_version', v_active.connection_version,
      'status', v_active.status
    );

    UPDATE public.store_channel_connections
    SET
      provider_id = v_provider_id,
      provider_name = v_provider_name,
      official_account_name = v_official_account_name,
      official_account_basic_id = v_official_account_basic_id,
      updated_at = NOW()
    WHERE id = v_active.id
    RETURNING * INTO v_connection;

    UPDATE public.stores
    SET
      liff_id = v_liff_id,
      line_login_channel_id = v_login_channel_id
    WHERE id = v_store_id;

    v_new_values := JSONB_BUILD_OBJECT(
      'provider_id', v_connection.provider_id,
      'provider_name', v_connection.provider_name,
      'official_account_name', v_connection.official_account_name,
      'official_account_basic_id', v_connection.official_account_basic_id,
      'line_login_channel_id', v_connection.login_channel_id,
      'liff_id', v_connection.liff_id,
      'connection_version', v_connection.connection_version,
      'status', v_connection.status
    );

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
      'line_connection_updated',
      'store_channel_connections',
      v_connection.id,
      v_old_values,
      v_new_values,
      v_store_id
    );

    RETURN JSONB_BUILD_OBJECT(
      'ok', TRUE,
      'mode', 'updated',
      'connection_id', v_connection.id,
      'same_provider', TRUE
    );
  END IF;

  SELECT connection.*
  INTO v_previous
  FROM public.store_channel_connections AS connection
  WHERE connection.store_id = v_store_id
    AND connection.channel = 'line'
  ORDER BY connection.connection_version DESC
  LIMIT 1
  FOR UPDATE;

  SELECT COALESCE(MAX(connection.connection_version), 0) + 1
  INTO v_next_version
  FROM public.store_channel_connections AS connection
  WHERE connection.store_id = v_store_id
    AND connection.channel = 'line';

  v_same_provider := v_previous.id IS NOT NULL
    AND v_previous.provider_id IS NOT NULL
    AND v_previous.provider_id = v_provider_id;

  IF v_same_provider THEN
    -- 防禦性封存非最近連線留下的有效身分，避免唯一值或電話判斷衝突。
    UPDATE public.customer_channel_identities
    SET
      deleted_at = NOW(),
      updated_at = NOW()
    WHERE store_id = v_store_id
      AND channel = 'line'
      AND deleted_at IS NULL
      AND provider_account_id <> v_previous.login_channel_id;
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    UPDATE public.customer_channel_identities
    SET
      provider_account_id = v_login_channel_id,
      updated_at = NOW()
    WHERE store_id = v_store_id
      AND channel = 'line'
      AND provider_account_id = v_previous.login_channel_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  ELSE
    -- LINE user ID 以 Provider 為單位；無法證明相同 Provider 時採安全封存。
    UPDATE public.customer_channel_identities
    SET
      deleted_at = NOW(),
      updated_at = NOW()
    WHERE store_id = v_store_id
      AND channel = 'line'
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  END IF;

  INSERT INTO public.store_channel_connections (
    store_id,
    channel,
    provider_id,
    provider_name,
    official_account_name,
    official_account_basic_id,
    login_channel_id,
    liff_id,
    connection_version,
    status,
    connected_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_store_id,
    'line',
    v_provider_id,
    v_provider_name,
    v_official_account_name,
    v_official_account_basic_id,
    v_login_channel_id,
    v_liff_id,
    v_next_version,
    'active',
    NOW(),
    v_actor_id,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_connection;

  UPDATE public.stores
  SET
    liff_id = v_liff_id,
    line_login_channel_id = v_login_channel_id
  WHERE id = v_store_id;

  IF v_previous.id IS NOT NULL THEN
    v_old_values := JSONB_BUILD_OBJECT(
      'provider_id', v_previous.provider_id,
      'provider_name', v_previous.provider_name,
      'official_account_name', v_previous.official_account_name,
      'official_account_basic_id', v_previous.official_account_basic_id,
      'line_login_channel_id', v_previous.login_channel_id,
      'liff_id', v_previous.liff_id,
      'connection_version', v_previous.connection_version,
      'status', v_previous.status
    );
  END IF;

  v_new_values := JSONB_BUILD_OBJECT(
    'provider_id', v_connection.provider_id,
    'provider_name', v_connection.provider_name,
    'official_account_name', v_connection.official_account_name,
    'official_account_basic_id', v_connection.official_account_basic_id,
    'line_login_channel_id', v_connection.login_channel_id,
    'liff_id', v_connection.liff_id,
    'connection_version', v_connection.connection_version,
    'status', v_connection.status,
    'same_provider', v_same_provider,
    'migrated_identity_count', v_migrated_count,
    'archived_identity_count', v_archived_count
  );

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
    CASE
      WHEN v_previous.id IS NULL THEN 'line_connection_connected'
      ELSE 'line_connection_reconnected'
    END,
    'store_channel_connections',
    v_connection.id,
    v_old_values,
    v_new_values,
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'mode', CASE WHEN v_previous.id IS NULL THEN 'connected' ELSE 'reconnected' END,
    'connection_id', v_connection.id,
    'connection_version', v_connection.connection_version,
    'same_provider', v_same_provider,
    'migrated_identity_count', v_migrated_count,
    'archived_identity_count', v_archived_count
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.manage_store_line_connection(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.manage_store_line_connection(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON TABLE public.store_channel_connections IS
  '店家渠道串接版本歷史；同一店家／渠道同時只能有一筆有效連線。';

COMMENT ON FUNCTION public.manage_store_line_connection(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  '僅店家管理員可執行的 LINE 串接、補齊與解除操作；包含 Provider 身分遷移及審計。';

COMMIT;
