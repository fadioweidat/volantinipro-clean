-- Site traffic analytics event store — privacy-safe, first-party.
--
-- Root cause: the Admin "Traffico sito" section (src/pages/admin/CommercialCenter.jsx)
-- has always rendered static "—" placeholders because no analytics provider
-- and no event store existed anywhere in the project (verified: no GA4/
-- Plausible/PostHog/etc. wiring, no analytics_events/page_view table in any
-- prior migration). This migration adds the minimal table needed instead of
-- estimating traffic from commercial records (campaigns/quote_requests).
--
-- Design mirrors the existing "public insert-only, admin-only read" pattern
-- already used by smart_pairing_waitlist (insert policies) and
-- quote_requests (admin_all policy) in 20260821211000_remote_baseline.sql.
--
-- No PII columns exist on this table at all (structurally impossible to
-- store password/token/service-role key/email body here), so there is
-- nothing to redact — the schema itself is the privacy boundary.

CREATE TABLE IF NOT EXISTS "public"."site_events" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "event_name" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "anonymous_session_id" uuid NOT NULL,
    "path" text,
    "campaign_id" uuid,
    "quote_id" uuid,
    CONSTRAINT "site_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_events_event_name_check" CHECK (
        "event_name" = ANY (ARRAY[
            'page_view'::text,
            'session_started'::text,
            'quote_started'::text,
            'quote_completed'::text,
            'consultation_requested'::text
        ])
    )
);

COMMENT ON TABLE "public"."site_events" IS 'Privacy-safe first-party site analytics events (page views, sessions, configurator/consultation funnel). No PII. Public/anon may only INSERT allowed event names; only admin/super_admin may SELECT.';

CREATE INDEX IF NOT EXISTS "site_events_created_at_idx" ON "public"."site_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "site_events_event_name_created_at_idx" ON "public"."site_events" ("event_name", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "site_events_anonymous_session_id_idx" ON "public"."site_events" ("anonymous_session_id");

ALTER TABLE "public"."site_events" ENABLE ROW LEVEL SECURITY;

-- Public/anon: INSERT only. The event_name allowlist is already enforced by
-- the CHECK constraint above; repeated here in the policy as defense in
-- depth (matches the belt-and-suspenders style of smart_pairing_waitlist_*).
CREATE POLICY "site_events_insert_anon" ON "public"."site_events"
  FOR INSERT TO "anon"
  WITH CHECK ("event_name" = ANY (ARRAY[
    'page_view'::text, 'session_started'::text, 'quote_started'::text,
    'quote_completed'::text, 'consultation_requested'::text
  ]));

CREATE POLICY "site_events_insert_authenticated" ON "public"."site_events"
  FOR INSERT TO "authenticated"
  WITH CHECK ("event_name" = ANY (ARRAY[
    'page_view'::text, 'session_started'::text, 'quote_started'::text,
    'quote_completed'::text, 'consultation_requested'::text
  ]));

-- Admin only: full read access, same admin-role-via-profiles check already
-- used by quote_requests_admin_all / campaigns_admin_all.
CREATE POLICY "site_events_admin_all" ON "public"."site_events" TO "authenticated"
  USING ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));

-- No UPDATE/DELETE policy for anyone: events are append-only. No SELECT
-- grant for anon: the public frontend only ever writes, never reads back.
GRANT INSERT ON "public"."site_events" TO "anon";
GRANT INSERT, SELECT ON "public"."site_events" TO "authenticated";
