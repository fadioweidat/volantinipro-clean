-- TICKET "BUSINESS FEASIBILITY €49 COMMERCE BACKEND" §14. Extends the
-- site_events event_name allowlist (CHECK constraint + both anon/
-- authenticated INSERT RLS policies) with 6 Business Feasibility funnel
-- events. Additive only, same drop-and-recreate-with-full-list idiom
-- already used by 20260831150000_analytics_visitors.sql — no existing event
-- name is removed, no other table/policy is touched, validation is not
-- loosened globally (the allowlist stays a closed enum, just longer).
begin;

alter table public.site_events drop constraint if exists site_events_event_name_check;
alter table public.site_events add constraint site_events_event_name_check check (
  event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned',
    'feasibility_preview_viewed','feasibility_paywall_viewed','feasibility_unlock_clicked',
    'feasibility_payment_requested','feasibility_unlocked','feasibility_pdf_opened'
  ]::text[])
) not valid;

drop policy if exists site_events_insert_anon on public.site_events;
create policy site_events_insert_anon on public.site_events
  for insert to anon
  with check (event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned',
    'feasibility_preview_viewed','feasibility_paywall_viewed','feasibility_unlock_clicked',
    'feasibility_payment_requested','feasibility_unlocked','feasibility_pdf_opened'
  ]::text[]));

drop policy if exists site_events_insert_authenticated on public.site_events;
create policy site_events_insert_authenticated on public.site_events
  for insert to authenticated
  with check (event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned',
    'feasibility_preview_viewed','feasibility_paywall_viewed','feasibility_unlock_clicked',
    'feasibility_payment_requested','feasibility_unlocked','feasibility_pdf_opened'
  ]::text[]));

-- site_events_admin_all (admin SELECT) is untouched: it does not reference
-- the event_name list at all, so it needs no change.

commit;

-- Rollback (manual): re-run the DROP/ADD CONSTRAINT + DROP/CREATE POLICY
-- blocks from 20260831150000_analytics_visitors.sql to restore the
-- 11-event allowlist.
