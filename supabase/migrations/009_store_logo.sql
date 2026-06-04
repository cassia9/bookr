-- =============================================
-- 店家 LOGO：stores 加 logo_url 欄位 + Storage bucket
-- =============================================

-- 1. stores 加 logo_url
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. 建立 store-assets Storage bucket（公開讀取）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-assets',
  'store-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS：authenticated 可上傳/更新，所有人可讀取
DROP POLICY IF EXISTS "auth upload store assets"  ON storage.objects;
DROP POLICY IF EXISTS "auth update store assets"  ON storage.objects;
DROP POLICY IF EXISTS "auth delete store assets"  ON storage.objects;
DROP POLICY IF EXISTS "public read store assets"  ON storage.objects;

CREATE POLICY "auth upload store assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-assets');

CREATE POLICY "auth update store assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'store-assets');

CREATE POLICY "auth delete store assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'store-assets');

CREATE POLICY "public read store assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'store-assets');
