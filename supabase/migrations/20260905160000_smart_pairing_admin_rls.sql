-- 20260905160000_smart_pairing_admin_rls.sql
-- Grant full administrative management over smart_pairing_waitlist table to authenticated admins

ALTER TABLE IF EXISTS "public"."smart_pairing_waitlist" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'smart_pairing_waitlist'
      AND policyname = 'smart_pairing_waitlist_admin_all'
  ) THEN
    CREATE POLICY "smart_pairing_waitlist_admin_all"
      ON "public"."smart_pairing_waitlist"
      FOR ALL
      TO authenticated
      USING (public.jwt_is_admin())
      WITH CHECK (public.jwt_is_admin());
  END IF;
END $$;
