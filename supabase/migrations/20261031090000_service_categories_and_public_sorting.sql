-- ============================================================
-- C 端課程分類與穩定排序
-- 1. 新增店家隔離的課程類別
-- 2. 課程可選擇單一類別；未分類課程安全保留
-- 3. 公開目錄僅回傳必要類別欄位並採穩定排序
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'service_categories_name_check'
      AND conrelid = 'public.service_categories'::REGCLASS
  ) THEN
    ALTER TABLE public.service_categories
      ADD CONSTRAINT service_categories_name_check
      CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'service_categories_sort_order_check'
      AND conrelid = 'public.service_categories'::REGCLASS
  ) THEN
    ALTER TABLE public.service_categories
      ADD CONSTRAINT service_categories_sort_order_check
      CHECK (sort_order >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'service_categories_store_id_id_key'
      AND conrelid = 'public.service_categories'::REGCLASS
  ) THEN
    ALTER TABLE public.service_categories
      ADD CONSTRAINT service_categories_store_id_id_key
      UNIQUE (store_id, id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS service_categories_store_name_active_uidx
  ON public.service_categories (store_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS service_categories_store_sort_idx
  ON public.service_categories (store_id, sort_order, name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'services_store_category_fkey'
      AND conrelid = 'public.services'::REGCLASS
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_store_category_fkey
      FOREIGN KEY (store_id, category_id)
      REFERENCES public.service_categories(store_id, id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS services_store_category_active_idx
  ON public.services (store_id, category_id)
  WHERE active = TRUE AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION private.set_service_category_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.name := BTRIM(NEW.name);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_service_category_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS set_service_category_updated_at
  ON public.service_categories;
CREATE TRIGGER set_service_category_updated_at
  BEFORE INSERT OR UPDATE
  ON public.service_categories
  FOR EACH ROW
  EXECUTE FUNCTION private.set_service_category_updated_at();

CREATE OR REPLACE FUNCTION private.audit_service_category_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_values, store_id
    ) VALUES (
      (SELECT auth.uid()),
      'service_category_created',
      'service_categories',
      NEW.id,
      TO_JSONB(NEW),
      NEW.store_id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_values, new_values, store_id
    ) VALUES (
      (SELECT auth.uid()),
      'service_category_updated',
      'service_categories',
      NEW.id,
      TO_JSONB(OLD),
      TO_JSONB(NEW),
      NEW.store_id
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'service_category_deleted',
    'service_categories',
    OLD.id,
    TO_JSONB(OLD),
    OLD.store_id
  );
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_service_category_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_service_category_change
  ON public.service_categories;
CREATE TRIGGER audit_service_category_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.service_categories
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_service_category_change();

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_categories_same_store_read
  ON public.service_categories;
CREATE POLICY service_categories_same_store_read
  ON public.service_categories
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS admin_insert_service_categories
  ON public.service_categories;
CREATE POLICY admin_insert_service_categories
  ON public.service_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS admin_update_service_categories
  ON public.service_categories;
CREATE POLICY admin_update_service_categories
  ON public.service_categories
  FOR UPDATE
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

REVOKE ALL PRIVILEGES ON TABLE public.service_categories
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_categories
  TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.service_categories
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_booking_catalog(p_store_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT JSONB_BUILD_OBJECT(
    'store', JSONB_BUILD_OBJECT(
      'name', store.name,
      'phone', store.phone,
      'address', store.address,
      'open_time', LEFT(store.open_time::TEXT, 5),
      'close_time', LEFT(store.close_time::TEXT, 5),
      'logo_url', store.logo_url,
      'liff_id', store.liff_id,
      'booking_enabled', store.booking_enabled,
      'booking_confirmation_mode', store.booking_confirmation_mode
    ),
    'categories', COALESCE((
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', category.id,
          'name', category.name,
          'sort_order', category.sort_order
        )
        ORDER BY category.sort_order, category.name, category.id
      )
      FROM public.service_categories AS category
      WHERE category.store_id = store.id
        AND category.active = TRUE
        AND category.deleted_at IS NULL
    ), '[]'::JSONB),
    'services', COALESCE((
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', service.id,
          'name', service.name,
          'description', service.description,
          'duration_minutes', service.duration_minutes,
          'price', service.price,
          'category_id', CASE
            WHEN category.id IS NOT NULL THEN service.category_id
            ELSE NULL
          END
        )
        ORDER BY
          COALESCE(category.sort_order, 2147483647),
          service.duration_minutes,
          service.price,
          service.name,
          service.id
      )
      FROM public.services AS service
      LEFT JOIN public.service_categories AS category
        ON category.id = service.category_id
       AND category.store_id = service.store_id
       AND category.active = TRUE
       AND category.deleted_at IS NULL
      WHERE service.store_id = store.id
        AND service.active = TRUE
        AND service.deleted_at IS NULL
    ), '[]'::JSONB),
    'practitioners', COALESCE((
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', practitioner.id,
          'full_name', practitioner.full_name,
          'title', practitioner.title,
          'color', practitioner.color
        )
        ORDER BY practitioner.created_at, practitioner.id
      )
      FROM public.practitioners AS practitioner
      WHERE practitioner.store_id = store.id
        AND practitioner.active = TRUE
        AND practitioner.deleted_at IS NULL
    ), '[]'::JSONB)
  )
  FROM public.stores AS store
  WHERE store.id = p_store_id;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.get_public_booking_catalog(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.get_public_booking_catalog(UUID)
  TO anon, authenticated;

COMMENT ON TABLE public.service_categories IS
  '店家自訂的單層課程類別；公開端只透過白名單 RPC 讀取啟用類別';
COMMENT ON COLUMN public.services.category_id IS
  '可選的課程類別；空值或停用類別在公開端歸入其他服務';
COMMENT ON FUNCTION public.get_public_booking_catalog(UUID) IS
  '公開預約頁安全目錄；回傳啟用類別與具穩定排序的課程必要欄位';

COMMIT;
