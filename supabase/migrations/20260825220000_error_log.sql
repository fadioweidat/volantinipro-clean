-- Real error log for the Admin "Centro Controllo Sito" (platform status page).
--
-- Root cause: no error/incident log of any kind exists anywhere in the
-- project (verified: no error_log/sentry/logError table or mechanism in any
-- prior migration or in src/). operation_alerts and ai_edge_security are
-- NOT tables — they're a pure client-side derivation function and a static
-- source-text security test, respectively. Without this table, "Errori
-- recenti" / flow health / error-rate widgets would have nothing real to
-- read and would have to fake data, which is explicitly forbidden.
--
-- Design mirrors site_events (20260825190000_site_traffic_events.sql):
-- public/anon insert-only restricted to an allowlist via CHECK constraints,
-- admin-only read. Additionally admins may UPDATE status (open -> resolved)
-- to triage real incidents, which site_events never needed.
--
-- Privacy: "message" is a short, client-truncated/sanitized string (see
-- src/lib/monitoring/errorLog.js) — never a raw stack trace, never a
-- request/response body, never a token/secret. No PII columns exist.

CREATE TABLE IF NOT EXISTS "public"."error_log" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "category" text NOT NULL,
    "module" text,
    "message" text NOT NULL,
    "severity" text NOT NULL DEFAULT 'error',
    "request_id" text,
    "campaign_id" uuid,
    "anonymous_session_id" uuid,
    "status" text NOT NULL DEFAULT 'open',
    "resolved_at" timestamptz,
    "resolved_by" uuid,
    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "error_log_category_check" CHECK (
        "category" = ANY (ARRAY[
            'frontend'::text, 'api'::text, 'supabase'::text, 'edge_function'::text,
            'auth'::text, 'submit_campaign'::text, 'quote'::text, 'gps'::text, 'driver'::text
        ])
    ),
    CONSTRAINT "error_log_severity_check" CHECK (
        "severity" = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])
    ),
    CONSTRAINT "error_log_status_check" CHECK (
        "status" = ANY (ARRAY['open'::text, 'resolved'::text])
    ),
    CONSTRAINT "error_log_message_length_check" CHECK (char_length("message") <= 500)
);

COMMENT ON TABLE "public"."error_log" IS 'Real platform error/incident log for the Admin Centro Controllo Sito. No PII, no stack traces, no secrets. Public/anon may only INSERT allowed category/severity combinations; only admin/super_admin may SELECT/UPDATE (triage).';

CREATE INDEX IF NOT EXISTS "error_log_created_at_idx" ON "public"."error_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "error_log_category_created_at_idx" ON "public"."error_log" ("category", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "error_log_status_idx" ON "public"."error_log" ("status");

ALTER TABLE "public"."error_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_log_insert_anon" ON "public"."error_log"
  FOR INSERT TO "anon"
  WITH CHECK (
    "category" = ANY (ARRAY[
      'frontend'::text, 'api'::text, 'supabase'::text, 'edge_function'::text,
      'auth'::text, 'submit_campaign'::text, 'quote'::text, 'gps'::text, 'driver'::text
    ])
    AND "severity" = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])
    AND "status" = 'open'
    AND char_length("message") <= 500
  );

CREATE POLICY "error_log_insert_authenticated" ON "public"."error_log"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "category" = ANY (ARRAY[
      'frontend'::text, 'api'::text, 'supabase'::text, 'edge_function'::text,
      'auth'::text, 'submit_campaign'::text, 'quote'::text, 'gps'::text, 'driver'::text
    ])
    AND "severity" = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])
    AND "status" = 'open'
    AND char_length("message") <= 500
  );

-- Admin only: full read + triage (status open -> resolved). Same
-- admin-role-via-profiles check already used by campaigns_admin_all /
-- quote_requests_admin_all / site_events_admin_all.
CREATE POLICY "error_log_admin_all" ON "public"."error_log" TO "authenticated"
  USING ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));

GRANT INSERT ON "public"."error_log" TO "anon";
GRANT INSERT, SELECT, UPDATE ON "public"."error_log" TO "authenticated";
