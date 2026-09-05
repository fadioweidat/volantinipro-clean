-- 20260905160000_smart_pairing_admin_rls.sql
-- 1. Ensure status and admin_notes columns exist for true DB persistence
ALTER TABLE IF EXISTS "public"."smart_pairing_waitlist"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "admin_notes" text;

-- 2. Ensure RLS is enabled
ALTER TABLE IF EXISTS "public"."smart_pairing_waitlist" ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Full Admin access for SELECT, INSERT, UPDATE, DELETE
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

-- 4. Backend Duplicate Protection: Trigger on duplicate open request within 10 minutes
CREATE OR REPLACE FUNCTION public.trg_smart_pairing_waitlist_dedupe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- Check for existing pending request with same email, comune, and service within 10 minutes
  SELECT id INTO v_existing_id
  FROM public.smart_pairing_waitlist
  WHERE lower(email) = lower(NEW.email)
    AND lower(comune) = lower(NEW.comune)
    AND lower(coalesce(servizio, 'd2d')) = lower(coalesce(NEW.servizio, 'd2d'))
    AND (gestita = false OR coalesce(status, 'open') = 'open')
    AND created_at >= (now() - interval '10 minutes')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update the existing request with any updated details without creating a ghost duplicate
    UPDATE public.smart_pairing_waitlist
    SET
      nome = coalesce(nullif(NEW.nome, ''), nome),
      whatsapp = coalesce(NEW.whatsapp, whatsapp),
      date_preferite = coalesce(NEW.date_preferite, date_preferite),
      note = coalesce(NEW.note, note),
      created_at = now()
    WHERE id = v_existing_id;

    -- Return NULL to suppress duplicate row insertion
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smart_pairing_waitlist_dedupe ON public.smart_pairing_waitlist;
CREATE TRIGGER trg_smart_pairing_waitlist_dedupe
  BEFORE INSERT ON public.smart_pairing_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_smart_pairing_waitlist_dedupe();
