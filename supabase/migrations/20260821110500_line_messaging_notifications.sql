-- ============================================================
-- LINE Messaging API 預約通知基礎設施
--
-- 原則：
-- 1. 預約交易只寫入 outbox，不在交易內呼叫 LINE API。
-- 2. 店家秘密保存於 Supabase Vault，公開 schema 只保存去敏結果。
-- 3. 佇列採原子領取、短交易與 SKIP LOCKED，避免多 Worker 重複處理。
-- 4. 所有服務端 RPC 明確收緊為 service_role，管理查詢受店家 RLS 隔離。
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 既有通知設定與渠道身分的相容擴充
-- ------------------------------------------------------------

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Taipei';

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS booking_received_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS booking_cancelled_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS booking_rescheduled_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE public.customer_channel_identities
  ADD COLUMN IF NOT EXISTS friend_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS friend_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notifications_reachable BOOLEAN;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'stores_timezone_length_check'
      AND conrelid = 'public.stores'::REGCLASS
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_timezone_length_check
      CHECK (CHAR_LENGTH(timezone) BETWEEN 1 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'notification_settings_reminder_minutes_check'
      AND conrelid = 'public.notification_settings'::REGCLASS
  ) THEN
    ALTER TABLE public.notification_settings
      ADD CONSTRAINT notification_settings_reminder_minutes_check
      CHECK (reminder_minutes_before BETWEEN 15 AND 10080);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'customer_channel_identities_friend_status_check'
      AND conrelid = 'public.customer_channel_identities'::REGCLASS
  ) THEN
    ALTER TABLE public.customer_channel_identities
      ADD CONSTRAINT customer_channel_identities_friend_status_check
      CHECK (friend_status IN ('unknown', 'friend', 'not_friend'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'customer_channel_identities_friend_consistency_check'
      AND conrelid = 'public.customer_channel_identities'::REGCLASS
  ) THEN
    ALTER TABLE public.customer_channel_identities
      ADD CONSTRAINT customer_channel_identities_friend_consistency_check
      CHECK (
        notifications_reachable IS NULL
        OR (friend_status = 'friend' AND notifications_reachable)
        OR (friend_status = 'not_friend' AND NOT notifications_reachable)
      );
  END IF;
END
$migration$;

INSERT INTO public.notification_settings (store_id)
SELECT store.id
FROM public.stores AS store
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO public.notification_templates (store_id, type, content)
SELECT
  store.id,
  template.type::public.notification_type,
  template.content
FROM public.stores AS store
CROSS JOIN (
  VALUES
    (
      'booking_received',
      '您好 {{customer_name}}，我們已收到您的預約申請。\n課程：{{service_name}}\n老師：{{practitioner_name}}\n時間：{{start_time}}\n確認後會再通知您。'
    ),
    (
      'booking_cancelled',
      '您好 {{customer_name}}，您的預約已取消。\n課程：{{service_name}}\n原預約時間：{{start_time}}\n如需重新預約，歡迎再次使用預約連結。'
    ),
    (
      'booking_rescheduled',
      '您好 {{customer_name}}，您的預約資料已更新。\n課程：{{service_name}}\n老師：{{practitioner_name}}\n新時間：{{start_time}}'
    )
) AS template(type, content)
ON CONFLICT (store_id, type) DO NOTHING;

-- ------------------------------------------------------------
-- 私有憑證參照：秘密本體只存在 Vault
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.store_line_messaging_credentials (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL UNIQUE
    REFERENCES public.store_channel_connections(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  messaging_channel_id TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  bot_basic_id TEXT,
  bot_display_name TEXT NOT NULL,
  access_token_secret_id UUID NOT NULL,
  channel_secret_secret_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_line_messaging_provider_id_check
    CHECK (provider_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT store_line_messaging_channel_id_check
    CHECK (messaging_channel_id ~ '^[0-9]{5,32}$'),
  CONSTRAINT store_line_messaging_bot_user_id_check
    CHECK (bot_user_id ~ '^U[0-9A-Fa-f]{32}$'),
  CONSTRAINT store_line_messaging_bot_basic_id_check
    CHECK (
      bot_basic_id IS NULL
      OR bot_basic_id ~ '^@[A-Za-z0-9._-]{5,100}$'
    ),
  CONSTRAINT store_line_messaging_name_check
    CHECK (CHAR_LENGTH(bot_display_name) BETWEEN 1 AND 100),
  CONSTRAINT store_line_messaging_status_check
    CHECK (
      (status = 'active' AND disconnected_at IS NULL)
      OR (status IN ('disconnected', 'error') AND disconnected_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_store_line_messaging_connection
  ON private.store_line_messaging_credentials (connection_id);

ALTER TABLE private.store_line_messaging_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.store_line_messaging_credentials
  FROM PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 可稽核 outbox 與 Webhook 去重
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.line_notification_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL
    REFERENCES public.store_channel_connections(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL
    REFERENCES public.customer_channel_identities(id) ON DELETE RESTRICT,
  event_type public.notification_type NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  error_code TEXT,
  http_status INTEGER,
  line_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_notification_outbox_idempotency_length_check
    CHECK (CHAR_LENGTH(idempotency_key) BETWEEN 1 AND 255),
  CONSTRAINT line_notification_outbox_payload_object_check
    CHECK (JSONB_TYPEOF(payload_snapshot) = 'object'),
  CONSTRAINT line_notification_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'skipped', 'dead')),
  CONSTRAINT line_notification_outbox_attempt_check
    CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 10),
  CONSTRAINT line_notification_outbox_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT line_notification_outbox_error_code_length_check
    CHECK (error_code IS NULL OR CHAR_LENGTH(error_code) <= 100),
  CONSTRAINT line_notification_outbox_request_id_length_check
    CHECK (line_request_id IS NULL OR CHAR_LENGTH(line_request_id) <= 255),
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_store_created
  ON public.line_notification_outbox (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_booking
  ON public.line_notification_outbox (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_client
  ON public.line_notification_outbox (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_identity
  ON public.line_notification_outbox (identity_id);

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_connection
  ON public.line_notification_outbox (connection_id);

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_ready
  ON public.line_notification_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'retry', 'processing');

ALTER TABLE public.line_notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_store_line_notification_outbox"
  ON public.line_notification_outbox;

CREATE POLICY "select_store_line_notification_outbox"
  ON public.line_notification_outbox
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL ON TABLE public.line_notification_outbox
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.line_notification_outbox TO authenticated;

CREATE TABLE IF NOT EXISTS private.line_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL
    REFERENCES public.store_channel_connections(id) ON DELETE CASCADE,
  webhook_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_user_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_webhook_event_id_length_check
    CHECK (CHAR_LENGTH(webhook_event_id) BETWEEN 1 AND 255),
  CONSTRAINT line_webhook_event_type_check
    CHECK (event_type IN ('follow', 'unfollow')),
  CONSTRAINT line_webhook_provider_user_length_check
    CHECK (
      provider_user_id IS NULL
      OR CHAR_LENGTH(provider_user_id) BETWEEN 1 AND 255
    ),
  UNIQUE (connection_id, webhook_event_id)
);

CREATE INDEX IF NOT EXISTS idx_line_webhook_events_store_received
  ON private.line_webhook_events (store_id, received_at DESC);

ALTER TABLE private.line_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.line_webhook_events
  FROM PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 內部通知判斷與預約 trigger
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.line_notification_enabled(
  p_store_id UUID,
  p_event_type public.notification_type
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_event_type
    WHEN 'booking_received'::public.notification_type
      THEN setting.booking_received_enabled
    WHEN 'booking_confirmed'::public.notification_type
      THEN setting.booking_confirmed_enabled
    WHEN 'booking_cancelled'::public.notification_type
      THEN setting.booking_cancelled_enabled
    WHEN 'booking_rescheduled'::public.notification_type
      THEN setting.booking_rescheduled_enabled
    WHEN 'reminder'::public.notification_type
      THEN setting.reminder_enabled
    ELSE FALSE
  END
  FROM public.notification_settings AS setting
  WHERE setting.store_id = p_store_id;
$$;

CREATE OR REPLACE FUNCTION private.enqueue_line_booking_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type public.notification_type;
  v_identity_id UUID;
  v_connection_id UUID;
  v_idempotency_key TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending'::public.booking_status THEN
      v_event_type := 'booking_received'::public.notification_type;
    ELSIF NEW.status = 'confirmed'::public.booking_status THEN
      v_event_type := 'booking_confirmed'::public.notification_type;
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled'::public.booking_status
       AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'booking_cancelled'::public.notification_type;
    ELSIF NEW.status = 'confirmed'::public.booking_status
       AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'booking_confirmed'::public.notification_type;
    ELSIF NEW.status <> 'cancelled'::public.booking_status
       AND (
         OLD.start_time IS DISTINCT FROM NEW.start_time
         OR OLD.service_id IS DISTINCT FROM NEW.service_id
         OR OLD.practitioner_id IS DISTINCT FROM NEW.practitioner_id
       ) THEN
      v_event_type := 'booking_rescheduled'::public.notification_type;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT COALESCE(
    private.line_notification_enabled(NEW.store_id, v_event_type),
    FALSE
  ) THEN
    RETURN NEW;
  END IF;

  SELECT identity.id, connection.id
  INTO v_identity_id, v_connection_id
  FROM public.customer_channel_identities AS identity
  JOIN public.store_channel_connections AS connection
    ON connection.store_id = identity.store_id
   AND connection.channel = 'line'
   AND connection.login_channel_id = identity.provider_account_id
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.connection_id = connection.id
   AND credential.store_id = connection.store_id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  WHERE identity.store_id = NEW.store_id
    AND identity.client_id = NEW.client_id
    AND identity.channel = 'line'
    AND identity.deleted_at IS NULL
    AND identity.friend_status <> 'not_friend'
  ORDER BY identity.last_seen_at DESC, identity.created_at DESC
  LIMIT 1;

  IF v_identity_id IS NULL OR v_connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_idempotency_key := CONCAT_WS(
    ':',
    'booking',
    NEW.id::TEXT,
    v_event_type::TEXT,
    CASE
      WHEN v_event_type = 'booking_rescheduled'::public.notification_type
        THEN NEW.updated_at::TEXT
      ELSE COALESCE(NEW.status::TEXT, 'unknown')
    END
  );

  INSERT INTO public.line_notification_outbox (
    store_id,
    connection_id,
    booking_id,
    client_id,
    identity_id,
    event_type,
    idempotency_key,
    payload_snapshot
  ) VALUES (
    NEW.store_id,
    v_connection_id,
    NEW.id,
    NEW.client_id,
    v_identity_id,
    v_event_type,
    v_idempotency_key,
    JSONB_BUILD_OBJECT(
      'booking_id', NEW.id,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'service_id', NEW.service_id,
      'practitioner_id', NEW.practitioner_id,
      'status', NEW.status
    )
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.line_notification_enabled(
  UUID, public.notification_type
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.enqueue_line_booking_notification()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enqueue_line_booking_notification
  ON public.bookings;

CREATE TRIGGER trg_enqueue_line_booking_notification
AFTER INSERT OR UPDATE OF status, start_time, service_id, practitioner_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_line_booking_notification();

-- 解除 LINE 連線時停用秘密並略過尚未發送的工作。
CREATE OR REPLACE FUNCTION private.disable_line_messaging_on_disconnect()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'active'
     AND NEW.status = 'disconnected'
     AND NEW.channel = 'line' THEN
    UPDATE private.store_line_messaging_credentials
    SET
      status = 'disconnected',
      disconnected_at = COALESCE(NEW.disconnected_at, NOW()),
      updated_at = NOW()
    WHERE connection_id = NEW.id
      AND status = 'active';

    UPDATE public.line_notification_outbox
    SET
      status = 'skipped',
      skipped_at = NOW(),
      error_code = 'connection_disconnected',
      locked_at = NULL,
      updated_at = NOW()
    WHERE connection_id = NEW.id
      AND status IN ('pending', 'retry', 'processing');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.disable_line_messaging_on_disconnect()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_disable_line_messaging_on_disconnect
  ON public.store_channel_connections;

CREATE TRIGGER trg_disable_line_messaging_on_disconnect
AFTER UPDATE OF status, disconnected_at
ON public.store_channel_connections
FOR EACH ROW
EXECUTE FUNCTION private.disable_line_messaging_on_disconnect();

-- 店家關閉某類通知時，既有待送工作也必須立即失效。
CREATE OR REPLACE FUNCTION private.skip_disabled_line_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.line_notification_outbox AS job
  SET
    status = 'skipped',
    skipped_at = NOW(),
    error_code = 'notification_disabled',
    locked_at = NULL,
    updated_at = NOW()
  WHERE job.store_id = NEW.store_id
    AND job.status IN ('pending', 'retry', 'processing')
    AND (
      (job.event_type = 'booking_received'::public.notification_type
        AND OLD.booking_received_enabled AND NOT NEW.booking_received_enabled)
      OR (job.event_type = 'booking_confirmed'::public.notification_type
        AND OLD.booking_confirmed_enabled AND NOT NEW.booking_confirmed_enabled)
      OR (job.event_type = 'booking_cancelled'::public.notification_type
        AND OLD.booking_cancelled_enabled AND NOT NEW.booking_cancelled_enabled)
      OR (job.event_type = 'booking_rescheduled'::public.notification_type
        AND OLD.booking_rescheduled_enabled AND NOT NEW.booking_rescheduled_enabled)
      OR (job.event_type = 'reminder'::public.notification_type
        AND OLD.reminder_enabled AND NOT NEW.reminder_enabled)
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.skip_disabled_line_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_skip_disabled_line_notifications
  ON public.notification_settings;

CREATE TRIGGER trg_skip_disabled_line_notifications
AFTER UPDATE OF
  booking_received_enabled,
  booking_confirmed_enabled,
  booking_cancelled_enabled,
  booking_rescheduled_enabled,
  reminder_enabled
ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION private.skip_disabled_line_notifications();

-- ------------------------------------------------------------
-- 憑證設定與去敏狀態 RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.configure_store_line_messaging(
  p_actor_id UUID,
  p_store_id UUID,
  p_connection_id UUID,
  p_provider_id TEXT,
  p_messaging_channel_id TEXT,
  p_bot_user_id TEXT,
  p_bot_basic_id TEXT,
  p_bot_display_name TEXT,
  p_channel_access_token TEXT,
  p_channel_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connection public.store_channel_connections%ROWTYPE;
  v_existing private.store_line_messaging_credentials%ROWTYPE;
  v_access_secret_id UUID;
  v_channel_secret_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS actor
    WHERE actor.id = p_actor_id
      AND actor.store_id = p_store_id
      AND actor.role = 'admin'::public.user_role
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT connection.*
  INTO v_connection
  FROM public.store_channel_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.store_id = p_store_id
    AND connection.channel = 'line'
    AND connection.status = 'active'
    AND connection.disconnected_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVE_LINE_CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_connection.provider_id IS NULL
     OR v_connection.provider_id <> BTRIM(COALESCE(p_provider_id, '')) THEN
    RAISE EXCEPTION 'LINE_PROVIDER_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF BTRIM(COALESCE(p_messaging_channel_id, '')) !~ '^[0-9]{5,32}$'
     OR BTRIM(COALESCE(p_bot_user_id, '')) !~ '^U[0-9A-Fa-f]{32}$'
     OR CHAR_LENGTH(BTRIM(COALESCE(p_bot_display_name, ''))) NOT BETWEEN 1 AND 100
     OR CHAR_LENGTH(COALESCE(p_channel_access_token, '')) NOT BETWEEN 20 AND 4096
     OR CHAR_LENGTH(COALESCE(p_channel_secret, '')) NOT BETWEEN 20 AND 255 THEN
    RAISE EXCEPTION 'INVALID_LINE_MESSAGING_CONFIGURATION' USING ERRCODE = '22023';
  END IF;

  SELECT credential.*
  INTO v_existing
  FROM private.store_line_messaging_credentials AS credential
  WHERE credential.store_id = p_store_id
  FOR UPDATE;

  IF FOUND THEN
    v_access_secret_id := v_existing.access_token_secret_id;
    v_channel_secret_id := v_existing.channel_secret_secret_id;

    PERFORM vault.update_secret(v_access_secret_id, p_channel_access_token);
    PERFORM vault.update_secret(v_channel_secret_id, p_channel_secret);
  ELSE
    v_access_secret_id := vault.create_secret(
      p_channel_access_token,
      'line_access_token_' || p_store_id::TEXT || '_' || p_connection_id::TEXT,
      'LINE Messaging API access token for store ' || p_store_id::TEXT
    );
    v_channel_secret_id := vault.create_secret(
      p_channel_secret,
      'line_channel_secret_' || p_store_id::TEXT || '_' || p_connection_id::TEXT,
      'LINE Messaging API channel secret for store ' || p_store_id::TEXT
    );
  END IF;

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
    status,
    verified_at,
    disconnected_at,
    updated_at
  ) VALUES (
    p_store_id,
    p_connection_id,
    BTRIM(p_provider_id),
    BTRIM(p_messaging_channel_id),
    BTRIM(p_bot_user_id),
    NULLIF(BTRIM(COALESCE(p_bot_basic_id, '')), ''),
    BTRIM(p_bot_display_name),
    v_access_secret_id,
    v_channel_secret_id,
    'active',
    NOW(),
    NULL,
    NOW()
  )
  ON CONFLICT (store_id) DO UPDATE
  SET
    connection_id = EXCLUDED.connection_id,
    provider_id = EXCLUDED.provider_id,
    messaging_channel_id = EXCLUDED.messaging_channel_id,
    bot_user_id = EXCLUDED.bot_user_id,
    bot_basic_id = EXCLUDED.bot_basic_id,
    bot_display_name = EXCLUDED.bot_display_name,
    access_token_secret_id = EXCLUDED.access_token_secret_id,
    channel_secret_secret_id = EXCLUDED.channel_secret_secret_id,
    status = 'active',
    verified_at = NOW(),
    disconnected_at = NULL,
    updated_at = NOW();

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    p_actor_id,
    CASE WHEN v_existing.store_id IS NULL THEN 'CONNECT' ELSE 'REPLACE' END,
    'store_line_messaging_credentials',
    p_connection_id,
    JSONB_BUILD_OBJECT(
      'provider_id', BTRIM(p_provider_id),
      'messaging_channel_id', BTRIM(p_messaging_channel_id),
      'bot_user_id_masked', LEFT(BTRIM(p_bot_user_id), 5) || '***',
      'bot_basic_id', NULLIF(BTRIM(COALESCE(p_bot_basic_id, '')), ''),
      'bot_display_name', BTRIM(p_bot_display_name),
      'status', 'active'
    ),
    p_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'connection_id', p_connection_id,
    'messaging_channel_id', BTRIM(p_messaging_channel_id),
    'bot_basic_id', NULLIF(BTRIM(COALESCE(p_bot_basic_id, '')), ''),
    'bot_display_name', BTRIM(p_bot_display_name),
    'status', 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_line_messaging_status()
RETURNS TABLE (
  connection_id UUID,
  provider_id TEXT,
  messaging_channel_id TEXT,
  bot_basic_id TEXT,
  bot_display_name TEXT,
  status TEXT,
  verified_at TIMESTAMPTZ,
  webhook_path TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    credential.connection_id,
    credential.provider_id,
    credential.messaging_channel_id,
    credential.bot_basic_id,
    credential.bot_display_name,
    credential.status,
    credential.verified_at,
    '/functions/v1/line-webhook?connection_id=' || credential.connection_id::TEXT
  FROM private.store_line_messaging_credentials AS credential
  WHERE credential.store_id = public.current_store_id();
$$;

REVOKE ALL ON FUNCTION public.configure_store_line_messaging(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_store_line_messaging(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.get_store_line_messaging_status()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_line_messaging_status()
  TO authenticated;

-- ------------------------------------------------------------
-- Reminder 掃描與 Worker RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_line_reminders(
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_window_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_window_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'INVALID_REMINDER_WINDOW' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.line_notification_outbox (
    store_id,
    connection_id,
    booking_id,
    client_id,
    identity_id,
    event_type,
    idempotency_key,
    payload_snapshot
  )
  SELECT
    booking.store_id,
    connection.id,
    booking.id,
    booking.client_id,
    identity.id,
    'reminder'::public.notification_type,
    CONCAT_WS(
      ':',
      'booking',
      booking.id::TEXT,
      'reminder',
      booking.start_time::TEXT
    ),
    JSONB_BUILD_OBJECT(
      'booking_id', booking.id,
      'start_time', booking.start_time,
      'end_time', booking.end_time,
      'service_id', booking.service_id,
      'practitioner_id', booking.practitioner_id,
      'status', booking.status
    )
  FROM public.bookings AS booking
  JOIN public.notification_settings AS setting
    ON setting.store_id = booking.store_id
   AND setting.reminder_enabled
  JOIN public.customer_channel_identities AS identity
    ON identity.store_id = booking.store_id
   AND identity.client_id = booking.client_id
   AND identity.channel = 'line'
   AND identity.deleted_at IS NULL
   AND identity.friend_status <> 'not_friend'
  JOIN public.store_channel_connections AS connection
    ON connection.store_id = booking.store_id
   AND connection.channel = 'line'
   AND connection.login_channel_id = identity.provider_account_id
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.store_id = booking.store_id
   AND credential.connection_id = connection.id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  WHERE booking.status = 'confirmed'::public.booking_status
    AND booking.deleted_at IS NULL
    AND booking.start_time >= p_now + MAKE_INTERVAL(mins => setting.reminder_minutes_before)
    AND booking.start_time < p_now + MAKE_INTERVAL(
      mins => setting.reminder_minutes_before + p_window_minutes
    )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_line_notification_jobs(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  job_id UUID,
  store_id UUID,
  booking_id UUID,
  event_type public.notification_type,
  idempotency_key TEXT,
  attempt_count INTEGER,
  channel_access_token TEXT,
  provider_user_id TEXT,
  friend_status TEXT,
  template_content TEXT,
  customer_name TEXT,
  service_name TEXT,
  practitioner_name TEXT,
  start_time TIMESTAMPTZ,
  booking_status public.booking_status,
  store_name TEXT,
  store_timezone TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH picked AS (
    SELECT candidate.id
    FROM public.line_notification_outbox AS candidate
    WHERE (
        candidate.status IN ('pending', 'retry')
        AND candidate.available_at <= NOW()
      )
      OR (
        candidate.status = 'processing'
        AND candidate.locked_at < NOW() - INTERVAL '10 minutes'
      )
    ORDER BY candidate.available_at, candidate.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.line_notification_outbox AS job
    SET
      status = 'processing',
      locked_at = NOW(),
      attempt_count = job.attempt_count + 1,
      error_code = NULL,
      http_status = NULL,
      updated_at = NOW()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.store_id,
    claimed.booking_id,
    claimed.event_type,
    claimed.idempotency_key,
    claimed.attempt_count,
    access_secret.decrypted_secret,
    identity.provider_user_id,
    identity.friend_status,
    template.content,
    client.full_name,
    service.name,
    practitioner.full_name,
    booking.start_time,
    booking.status,
    store.name,
    store.timezone
  FROM claimed
  LEFT JOIN private.store_line_messaging_credentials AS credential
    ON credential.store_id = claimed.store_id
    AND credential.connection_id = claimed.connection_id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  LEFT JOIN vault.decrypted_secrets AS access_secret
    ON access_secret.id = credential.access_token_secret_id
  LEFT JOIN public.customer_channel_identities AS identity
    ON identity.id = claimed.identity_id
    AND identity.store_id = claimed.store_id
   AND identity.deleted_at IS NULL
  LEFT JOIN public.clients AS client
    ON client.id = claimed.client_id
    AND client.store_id = claimed.store_id
   AND client.deleted_at IS NULL
  LEFT JOIN public.bookings AS booking
    ON booking.id = claimed.booking_id
    AND booking.store_id = claimed.store_id
   AND booking.deleted_at IS NULL
  LEFT JOIN public.services AS service
    ON service.id = booking.service_id
   AND service.store_id = claimed.store_id
  LEFT JOIN public.practitioners AS practitioner
    ON practitioner.id = booking.practitioner_id
   AND practitioner.store_id = claimed.store_id
  JOIN public.stores AS store
    ON store.id = claimed.store_id
  LEFT JOIN public.notification_templates AS template
    ON template.store_id = claimed.store_id
    AND template.type = claimed.event_type;
$$;

CREATE OR REPLACE FUNCTION public.complete_line_notification_job(
  p_job_id UUID,
  p_line_request_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.line_notification_outbox
    SET
      status = 'sent',
      sent_at = NOW(),
      locked_at = NULL,
      line_request_id = LEFT(NULLIF(BTRIM(p_line_request_id), ''), 255),
      error_code = NULL,
      http_status = 200,
      updated_at = NOW()
    WHERE id = p_job_id
      AND status = 'processing'
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.retry_line_notification_job(
  p_job_id UUID,
  p_error_code TEXT,
  p_http_status INTEGER DEFAULT NULL,
  p_retry_after_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_retry_after_seconds NOT BETWEEN 1 AND 86400
     OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) THEN
    RAISE EXCEPTION 'INVALID_RETRY_ARGUMENTS' USING ERRCODE = '22023';
  END IF;

  UPDATE public.line_notification_outbox
  SET
    status = CASE WHEN attempt_count >= max_attempts THEN 'dead' ELSE 'retry' END,
    available_at = CASE
      WHEN attempt_count >= max_attempts THEN available_at
      ELSE NOW() + MAKE_INTERVAL(secs => p_retry_after_seconds)
    END,
    locked_at = NULL,
    error_code = LEFT(COALESCE(NULLIF(BTRIM(p_error_code), ''), 'unknown_error'), 100),
    http_status = p_http_status,
    updated_at = NOW()
  WHERE id = p_job_id
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_line_notification_job(
  p_job_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.line_notification_outbox
    SET
      status = 'skipped',
      skipped_at = NOW(),
      locked_at = NULL,
      error_code = LEFT(COALESCE(NULLIF(BTRIM(p_reason), ''), 'skipped'), 100),
      updated_at = NOW()
    WHERE id = p_job_id
      AND status = 'processing'
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

-- ------------------------------------------------------------
-- Webhook 簽章驗證所需秘密與 follow／unfollow 寫入 RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_line_webhook_config(
  p_connection_id UUID
)
RETURNS TABLE (
  store_id UUID,
  connection_id UUID,
  channel_secret TEXT,
  login_channel_id TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    credential.store_id,
    credential.connection_id,
    channel_secret.decrypted_secret,
    connection.login_channel_id
  FROM private.store_line_messaging_credentials AS credential
  JOIN public.store_channel_connections AS connection
    ON connection.id = credential.connection_id
   AND connection.store_id = credential.store_id
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN vault.decrypted_secrets AS channel_secret
    ON channel_secret.id = credential.channel_secret_secret_id
  WHERE credential.connection_id = p_connection_id
    AND credential.status = 'active'
    AND credential.disconnected_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.record_line_webhook_event(
  p_connection_id UUID,
  p_webhook_event_id TEXT,
  p_event_type TEXT,
  p_provider_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID;
  v_login_channel_id TEXT;
  v_inserted INTEGER;
  v_updated INTEGER := 0;
BEGIN
  IF p_event_type NOT IN ('follow', 'unfollow')
     OR CHAR_LENGTH(COALESCE(p_webhook_event_id, '')) NOT BETWEEN 1 AND 255
     OR CHAR_LENGTH(COALESCE(p_provider_user_id, '')) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'INVALID_LINE_WEBHOOK_EVENT' USING ERRCODE = '22023';
  END IF;

  SELECT connection.store_id, connection.login_channel_id
  INTO v_store_id, v_login_channel_id
  FROM public.store_channel_connections AS connection
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.connection_id = connection.id
   AND credential.store_id = connection.store_id
   AND credential.status = 'active'
  WHERE connection.id = p_connection_id
    AND connection.status = 'active'
    AND connection.disconnected_at IS NULL;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_LINE_CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO private.line_webhook_events (
    store_id,
    connection_id,
    webhook_event_id,
    event_type,
    provider_user_id
  ) VALUES (
    v_store_id,
    p_connection_id,
    p_webhook_event_id,
    p_event_type,
    p_provider_user_id
  )
  ON CONFLICT (connection_id, webhook_event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    UPDATE public.customer_channel_identities
    SET
      friend_status = CASE WHEN p_event_type = 'follow' THEN 'friend' ELSE 'not_friend' END,
      notifications_reachable = (p_event_type = 'follow'),
      friend_status_updated_at = NOW(),
      updated_at = NOW()
    WHERE store_id = v_store_id
      AND channel = 'line'
      AND provider_account_id = v_login_channel_id
      AND provider_user_id = p_provider_user_id
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'duplicate', v_inserted = 0,
    'identities_updated', v_updated
  );
END;
$$;

-- 所有背景與秘密 RPC 僅允許 service_role。
REVOKE ALL ON FUNCTION public.enqueue_line_reminders(TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_line_notification_jobs(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_line_notification_job(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_line_notification_job(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_line_notification_job(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_line_webhook_config(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_line_webhook_event(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_line_reminders(TIMESTAMPTZ, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_line_notification_jobs(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_line_notification_job(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_line_notification_job(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.skip_line_notification_job(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_line_webhook_config(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_line_webhook_event(UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.line_notification_outbox IS
  'LINE 交易通知 outbox；不含 Token／Secret，僅同店登入者可讀去敏結果。';
COMMENT ON TABLE private.store_line_messaging_credentials IS
  'LINE Messaging API 私有 metadata 與 Vault secret references；不可由 Data API 直接存取。';
COMMENT ON FUNCTION public.claim_line_notification_jobs(INTEGER) IS
  'service_role 專用：以 SKIP LOCKED 原子領取通知並回傳發送所需資料。';

COMMIT;
