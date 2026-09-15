BEGIN;

-- 後台站內即時通知：保存建立者，避免後台人工新增被誤判為客戶預約。
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_created_by_user_id_fkey'
      AND conrelid = 'public.bookings'::REGCLASS
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bookings_created_by_user
  ON public.bookings (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL
    REFERENCES public.stores(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  booking_id UUID
    REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  action_required BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  deduplication_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT in_app_notifications_event_type_check
    CHECK (event_type IN ('booking_created_pending', 'booking_created_confirmed')),
  CONSTRAINT in_app_notifications_title_length_check
    CHECK (CHAR_LENGTH(BTRIM(title)) BETWEEN 1 AND 120),
  CONSTRAINT in_app_notifications_message_length_check
    CHECK (CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 500),
  CONSTRAINT in_app_notifications_payload_object_check
    CHECK (JSONB_TYPEOF(payload_snapshot) = 'object'),
  CONSTRAINT in_app_notifications_deduplication_key_length_check
    CHECK (CHAR_LENGTH(deduplication_key) BETWEEN 1 AND 255),
  CONSTRAINT in_app_notifications_recipient_event_unique
    UNIQUE (recipient_user_id, deduplication_key)
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_recipient_created
  ON public.in_app_notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_recipient_unread
  ON public.in_app_notifications (recipient_user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_recipient_pending
  ON public.in_app_notifications (recipient_user_id, created_at DESC, id DESC)
  WHERE action_required AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_booking
  ON public.in_app_notifications (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_in_app_notifications"
  ON public.in_app_notifications;

CREATE POLICY "select_own_in_app_notifications"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    AND store_id = (SELECT public.current_store_id())
  );

REVOKE ALL ON TABLE public.in_app_notifications
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.in_app_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_in_app_notification_read(
  p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.in_app_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id
    AND recipient_user_id = (SELECT auth.uid())
    AND store_id = (SELECT public.current_store_id())
  RETURNING TRUE INTO v_updated;

  RETURN COALESCE(v_updated, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_in_app_notification_read(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_in_app_notification_read(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_in_app_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.in_app_notifications
  SET read_at = NOW()
  WHERE recipient_user_id = (SELECT auth.uid())
    AND store_id = (SELECT public.current_store_id())
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_in_app_notifications_read()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_in_app_notifications_read()
  TO authenticated;

CREATE OR REPLACE FUNCTION private.capture_booking_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := (SELECT auth.uid());
BEGIN
  IF NEW.created_by_user_id IS NULL
    AND v_actor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = v_actor_id
        AND app_user.deleted_at IS NULL
    ) THEN
    NEW.created_by_user_id := v_actor_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_booking_creator()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_capture_creator ON public.bookings;
CREATE TRIGGER bookings_capture_creator
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_booking_creator();

CREATE OR REPLACE FUNCTION private.create_booking_in_app_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_name TEXT;
  v_service_name TEXT;
  v_practitioner_name TEXT;
  v_event_type TEXT;
  v_title TEXT;
  v_action_required BOOLEAN;
BEGIN
  -- 只有客戶端建立的預約要通知後台；登入員工建立時已有建立者。
  IF NEW.created_by_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT client.full_name
  INTO v_client_name
  FROM public.clients AS client
  WHERE client.id = NEW.client_id
    AND client.store_id = NEW.store_id;

  SELECT service.name
  INTO v_service_name
  FROM public.services AS service
  WHERE service.id = NEW.service_id
    AND service.store_id = NEW.store_id;

  SELECT practitioner.full_name
  INTO v_practitioner_name
  FROM public.practitioners AS practitioner
  WHERE practitioner.id = NEW.practitioner_id
    AND practitioner.store_id = NEW.store_id;

  v_action_required := NEW.status = 'pending'::public.booking_status;
  v_event_type := CASE
    WHEN v_action_required THEN 'booking_created_pending'
    ELSE 'booking_created_confirmed'
  END;
  v_title := CASE
    WHEN v_action_required THEN '新預約待確認'
    ELSE '新預約已自動確認'
  END;

  INSERT INTO public.in_app_notifications (
    store_id,
    recipient_user_id,
    booking_id,
    event_type,
    title,
    message,
    payload_snapshot,
    action_required,
    resolved_at,
    deduplication_key
  )
  SELECT
    NEW.store_id,
    recipient.id,
    NEW.id,
    v_event_type,
    v_title,
    FORMAT('%s預約了%s', COALESCE(v_client_name, '客戶'), COALESCE(v_service_name, '課程')),
    JSONB_BUILD_OBJECT(
      'customer_name', COALESCE(v_client_name, '客戶'),
      'service_name', COALESCE(v_service_name, '課程'),
      'practitioner_name', COALESCE(v_practitioner_name, '未指定'),
      'start_time', NEW.start_time,
      'booking_status', NEW.status,
      'source', NEW.source
    ),
    v_action_required,
    CASE WHEN v_action_required THEN NULL ELSE NOW() END,
    FORMAT('booking:%s:created', NEW.id)
  FROM public.users AS recipient
  WHERE recipient.store_id = NEW.store_id
    AND recipient.deleted_at IS NULL
    AND (
      recipient.role = 'admin'::public.user_role
      OR recipient.practitioner_id = NEW.practitioner_id
    )
  ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_booking_in_app_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_create_in_app_notifications ON public.bookings;
CREATE TRIGGER bookings_create_in_app_notifications
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION private.create_booking_in_app_notifications();

CREATE OR REPLACE FUNCTION private.resolve_booking_in_app_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE public.in_app_notifications
  SET resolved_at = CASE
    WHEN NEW.status = 'pending'::public.booking_status THEN NULL
    ELSE COALESCE(resolved_at, NOW())
  END
  WHERE booking_id = NEW.id
    AND action_required;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_booking_in_app_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_resolve_in_app_notifications ON public.bookings;
CREATE TRIGGER bookings_resolve_in_app_notifications
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION private.resolve_booking_in_app_notifications();

CREATE OR REPLACE FUNCTION private.broadcast_in_app_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event TEXT := CASE
    WHEN TG_OP = 'INSERT' THEN 'notification_created'
    ELSE 'notification_updated'
  END;
BEGIN
  BEGIN
    PERFORM realtime.send(
      JSONB_BUILD_OBJECT(
        'notification_id', NEW.id,
        'change', LOWER(TG_OP)
      ),
      v_event,
      'notifications:user:' || NEW.recipient_user_id::TEXT,
      TRUE
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- 即時服務異常不能使客戶預約或後台已讀操作失敗；資料仍已持久保存。
      RAISE WARNING 'In-app notification broadcast failed [%]', SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_in_app_notification()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS in_app_notifications_broadcast_changes
  ON public.in_app_notifications;
CREATE TRIGGER in_app_notifications_broadcast_changes
  AFTER INSERT OR UPDATE ON public.in_app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION private.broadcast_in_app_notification();

DROP POLICY IF EXISTS "select_own_in_app_notification_broadcasts"
  ON realtime.messages;

CREATE POLICY "select_own_in_app_notification_broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (SELECT realtime.topic()) =
      'notifications:user:' || (SELECT auth.uid())::TEXT
  );

COMMENT ON TABLE public.in_app_notifications
  IS '每位後台使用者的持久化站內通知；即時廣播只傳遞通知 ID';
COMMENT ON COLUMN public.bookings.created_by_user_id
  IS '後台建立預約的登入使用者；客戶 Web/LINE 預約保持 NULL';

COMMIT;
