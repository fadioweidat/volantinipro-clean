// Analytics Visitatori — migration additiva + route dashboard (contratto
// sorgente). NON tocca schema GPS/coverage.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveAppRoute } from '../src/app/routeResolution.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260831150000_analytics_visitors.sql');
const ROUTER = read('src/app/AppRouter.jsx');
const MODULES = read('src/pages/admin/admin-dashboard/AdminDashboardModulesPanel.jsx');

test('MIG — additiva su site_events: ADD COLUMN IF NOT EXISTS per geo/utm/referrer/device/metadata/session_id', () => {
  for (const col of ['session_id', 'referrer_host', 'referrer_type', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'country', 'region', 'city', 'device_type', 'browser', 'os', 'metadata']) {
    assert.match(MIG, new RegExp(`add column if not exists ${col}\\b`, 'i'), `manca ADD COLUMN ${col}`);
  }
  // idempotente: funziona anche se la base non è applicata
  assert.match(MIG, /create table if not exists public\.site_events/i);
});

test('MIG — allowlist event_name estesa ai 6 nuovi eventi (CHECK + policy anon + policy authenticated)', () => {
  for (const e of ['municipality_selected', 'quantity_selected', 'service_selected', 'extras_selected', 'quote_step_reached', 'quote_abandoned']) {
    // 3 occorrenze: check constraint + 2 policy
    assert.ok((MIG.match(new RegExp(`'${e}'`, 'g')) || []).length >= 3, `${e} deve comparire in CHECK + 2 policy`);
  }
  assert.match(MIG, /site_events_event_name_check check[\s\S]{0,400}not valid/i);
  assert.match(MIG, /create policy site_events_insert_anon on public\.site_events\s+for insert to anon/i);
});

test('MIG — RLS: anon SOLO insert, admin SOLO select; nessun SELECT/GRANT SELECT per anon', () => {
  assert.doesNotMatch(MIG, /grant select on public\.site_events to anon/i);
  assert.doesNotMatch(MIG, /to anon[\s\S]{0,60}for select/i);
  assert.match(MIG, /create policy site_events_admin_all on public\.site_events/i);
  assert.match(MIG, /profiles\.role = any \(array\['admin','super_admin'\]/i);
});

test('MIG — analytics_daily_rollup: tabella + RLS admin-read + nessuna policy insert pubblica', () => {
  assert.match(MIG, /create table if not exists public\.analytics_daily_rollup/i);
  assert.match(MIG, /primary key \(day, dimension, key\)/i);
  assert.match(MIG, /analytics_daily_rollup_admin_read[\s\S]{0,200}for select to authenticated/i);
  assert.doesNotMatch(MIG, /policy[\s\S]{0,80}analytics_daily_rollup[\s\S]{0,80}for insert/i);
});

test('MIG — funzione rollup + prune + pg_cron guardato', () => {
  assert.match(MIG, /create or replace function public\.analytics_run_daily_rollup\(p_day date/i);
  assert.match(MIG, /security definer set search_path to ''/i);
  assert.match(MIG, /create or replace function public\.analytics_prune\(p_raw_days integer default 90, p_rollup_months integer default 13\)/i);
  // prune raw 90gg
  assert.match(MIG, /delete from public\.site_events\s+where created_at < now\(\) - \(pg_catalog\.greatest\(p_raw_days, 1\)/i);
  // pg_cron guardato: non fallisce se non disponibile
  assert.match(MIG, /if exists \(select 1 from pg_available_extensions where name = 'pg_cron'\)/i);
  assert.match(MIG, /cron\.schedule\('analytics_daily_rollup', '15 2 \* \* \*'/);
  assert.match(MIG, /cron\.schedule\('analytics_prune', '15 3 \* \* \*'/);
});

test('MIG — PATCH A: commenti espliciti su anonymous_session_id (visitor) e session_id (sessione)', () => {
  assert.match(MIG, /comment on column public\.site_events\.anonymous_session_id is\s*\n\s*'Legacy column name: contiene l''anonymous visitor ID persistente/i);
  assert.match(MIG, /comment on column public\.site_events\.session_id is\s*\n\s*'ID anonimo della sessione\/tab corrente\. Nullable per gli eventi storici/i);
});

test('MIG — PATCH B: sessions = count(distinct session_uid), session_uid = coalesce(session_id, anonymous_session_id); visitors invariato', () => {
  // definizione del session_uid nella CTE ev
  assert.match(MIG, /pg_catalog\.coalesce\(session_id, anonymous_session_id\) as session_uid/i);
  // il KPI sessioni NON e piu basato sul conteggio di session_started
  assert.doesNotMatch(MIG, /count\(\*\) filter \(where event_name = 'session_started'\)/i);
  // overview + dimensioni richieste usano count(distinct session_uid)
  assert.ok((MIG.match(/pg_catalog\.count\(distinct session_uid\)/gi) || []).length >= 7,
    'overview + country/region/city/source/page/device devono usare count(distinct session_uid)');
  // visitors resta count(distinct anonymous_session_id)
  assert.match(MIG, /select p_day, 'overview', 'all',\s*\n\s*pg_catalog\.count\(distinct anonymous_session_id\),\s*\n\s*pg_catalog\.count\(distinct session_uid\)/i);
  // funnel: logica coalesce esistente preservata
  assert.match(MIG, /'funnel_step', s\.stage, 0, pg_catalog\.count\(distinct s\.sid\)/i);
});

test('MIG — indici geo/utm/session', () => {
  for (const idx of ['site_events_session_id_idx', 'site_events_country_created_at_idx', 'site_events_city_created_at_idx', 'site_events_utm_source_created_at_idx', 'analytics_daily_rollup_day_idx']) {
    assert.match(MIG, new RegExp(`create index if not exists ${idx}`, 'i'));
  }
});

test('MIG — NON tocca schema GPS/coverage', () => {
  assert.doesNotMatch(MIG, /gps_tracking_points|delivery_sessions|campaign_coverage_adjustments|campaign_zone_progress|operator_assignments/i);
});

test('ROUTE — /admin/analytics → admin-analytics, dentro AdminGuard, lazy chunk', () => {
  assert.equal(resolveAppRoute('/admin/analytics'), 'admin-analytics');
  const guardOpen = ROUTER.indexOf('<AdminGuard');
  const guardClose = ROUTER.indexOf('</AdminGuard>');
  const branch = ROUTER.indexOf('page === "admin-analytics"');
  assert.ok(branch > guardOpen && branch < guardClose, 'branch dentro AdminGuard');
  assert.match(ROUTER, /page === "admin-analytics" && <AnalyticsPage onNav=\{goTo\} \/>/);
  assert.match(ROUTER, /lazy\(\(\) => import\("\.\.\/pages\/admin\/analytics\/AnalyticsPage\.jsx"\)/);
  assert.match(ROUTER, /"admin-analytics": "\/admin\/analytics"/);
});

test('DASHBOARD — card "Analytics Visitatori" → onNav(admin-analytics)', () => {
  assert.match(MODULES, /title="Analytics Visitatori"/);
  assert.match(MODULES, /onOpen=\{\(\) => onNav\('admin-analytics'\)\}/);
});

test('WIRING — AppRouter emette gli eventi funnel/commerciali dal configuratore', () => {
  assert.match(ROUTER, /trackQuoteStepReached\(step\)/);
  assert.match(ROUTER, /trackQuoteAbandoned\(prevStepRef\.current\)/);
  assert.match(ROUTER, /trackMunicipalitySelected\(\{ municipality: muniName/);
  assert.match(ROUTER, /trackQuantitySelected\(qty\)/);
  assert.match(ROUTER, /trackServiceSelected\(service\)/);
  assert.match(ROUTER, /trackExtrasSelected\(extras\)/);
});
