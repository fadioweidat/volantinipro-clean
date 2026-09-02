-- 038_premium_services_qr_video.sql
-- Hardened schema and policies for real QR Analytics tracking and Video Proof storage.

-- 1. Table campaign_qr_scans
CREATE TABLE IF NOT EXISTS public.campaign_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campagne(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  device_type TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_qr_scans_slug ON public.campaign_qr_scans(slug);
CREATE INDEX IF NOT EXISTS idx_campaign_qr_scans_campaign_id ON public.campaign_qr_scans(campaign_id);

-- Enable RLS on campaign_qr_scans
ALTER TABLE public.campaign_qr_scans ENABLE ROW LEVEL SECURITY;

-- Drop loose policies if they existed
DROP POLICY IF EXISTS "Allow public insert on qr scans" ON public.campaign_qr_scans;
DROP POLICY IF EXISTS "Allow read on qr scans" ON public.campaign_qr_scans;
DROP POLICY IF EXISTS "Allow service_role insert on qr scans" ON public.campaign_qr_scans;
DROP POLICY IF EXISTS "Allow owner and admin select on qr scans" ON public.campaign_qr_scans;

-- INSERT: Only server-side backend with service_role can insert scans
CREATE POLICY "Allow service_role insert on qr scans"
  ON public.campaign_qr_scans
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- SELECT: Admins can view all scans, authenticated customers can view scans for their own campaigns
CREATE POLICY "Allow owner and admin select on qr scans"
  ON public.campaign_qr_scans
  FOR SELECT
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.campagne c
      WHERE c.id = campaign_qr_scans.campaign_id
      AND (
        c.user_id = auth.uid()
        OR c.cliente_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clienti cl
          WHERE cl.id = c.cliente_id AND cl.user_id = auth.uid()
        )
      )
    )
  );

-- 2. Storage Bucket for Video Proof (Private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-videos',
  'campaign-videos',
  false,
  157286400, -- 150 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 157286400,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

-- Storage Policies for campaign-videos
DROP POLICY IF EXISTS "Admin full access to campaign-videos" ON storage.objects;
DROP POLICY IF EXISTS "Customer read signed objects in campaign-videos" ON storage.objects;

CREATE POLICY "Admin full access to campaign-videos"
  ON storage.objects
  FOR ALL
  TO authenticated, service_role
  USING (
    bucket_id = 'campaign-videos'
    AND (
      auth.role() = 'service_role'
      OR (auth.jwt() ->> 'email') LIKE '%@volantinipro.it'
      OR (auth.jwt() -> 'user_metadata' ->> 'is_admin') = 'true'
    )
  )
  WITH CHECK (
    bucket_id = 'campaign-videos'
    AND (
      auth.role() = 'service_role'
      OR (auth.jwt() ->> 'email') LIKE '%@volantinipro.it'
      OR (auth.jwt() -> 'user_metadata' ->> 'is_admin') = 'true'
    )
  );

CREATE POLICY "Customer read signed objects in campaign-videos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'campaign-videos'
  );
