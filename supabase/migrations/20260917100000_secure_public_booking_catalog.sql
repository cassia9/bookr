-- 公開預約頁只可透過白名單 RPC 取得必要欄位，避免 anon 直接讀取內部欄位。

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_booking_catalog(p_store_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'store', jsonb_build_object(
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
    'services', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', service.id,
          'name', service.name,
          'description', service.description,
          'duration_minutes', service.duration_minutes,
          'price', service.price
        )
        ORDER BY service.name
      )
      FROM public.services AS service
      WHERE service.store_id = store.id
        AND service.active
        AND service.deleted_at IS NULL
    ), '[]'::JSONB),
    'practitioners', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', practitioner.id,
          'full_name', practitioner.full_name,
          'title', practitioner.title,
          'color', practitioner.color
        )
        ORDER BY practitioner.created_at
      )
      FROM public.practitioners AS practitioner
      WHERE practitioner.store_id = store.id
        AND practitioner.active
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

DROP POLICY IF EXISTS "anon read stores" ON public.stores;
DROP POLICY IF EXISTS "anon read services" ON public.services;
DROP POLICY IF EXISTS "anon read practitioners" ON public.practitioners;
DROP POLICY IF EXISTS "anon_read_active_services" ON public.services;

REVOKE SELECT
  ON TABLE public.stores, public.services, public.practitioners
  FROM anon;

COMMENT ON FUNCTION public.get_public_booking_catalog(UUID) IS
  '公開預約頁安全目錄；只回傳店家、課程與從業人員的必要公開欄位';

COMMIT;
