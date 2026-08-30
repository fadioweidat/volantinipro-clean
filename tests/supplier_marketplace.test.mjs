// MARKETPLACE FORNITORE — test di CONTRATTO reali (nessun assert.ok(true)).
// La migration NON e' applicata: si verifica il testo SQL + il wiring frontend.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260830160000_supplier_marketplace.sql');
const MIG_ASG = read('supabase/migrations/20260830170000_supplier_list_campaign_assignments.sql');
const API = read('src/lib/services/supplier-api.js');
const GUARD = read('src/auth/guards/SupplierGuard.jsx');
const DASH = read('src/pages/supplier/SupplierDashboard.jsx');
const CUSTVIEW = read('src/pages/customer/CustomerQuotesView.jsx');
const APPROUTER = read('src/app/AppRouter.jsx');
const RESOLVE = read('src/app/routeResolution.js');
const FINAL = read('volantinipro-final.jsx');
const MKTERR = read('src/lib/services/marketplaceErrors.js');
const CUSTCAMP = read('src/lib/customerCampaigns.js');

// helper: corpo di una funzione SQL "create or replace function public.NAME(...)... $$;"
function fnBody(name) {
  const start = MIG.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `RPC ${name} assente`);
  const end = MIG.indexOf('$$;', start);
  return MIG.slice(start, end + 3);
}

// ── A: supplier non puo' update status ────────────────────────────────
test('A — nessuna policy UPDATE per il supplier su supplier_profiles; status via RPC Admin', () => {
  assert.doesNotMatch(MIG, /create policy [^\n]*on public\.supplier_profiles\s+for update/i);
  assert.doesNotMatch(MIG, /"Suppliers can update own profile"/);
  assert.match(fnBody('supplier_update_profile'), /company_name\s*=/);
  assert.doesNotMatch(fnBody('supplier_update_profile'), /\bstatus\b\s*=|verified_at|verified_by|admin_notes|public_code/);
  assert.match(fnBody('admin_set_supplier_status'), /if not public\.jwt_is_admin\(\) then raise exception/);
});

// ── B: FORCE RLS ─────────────────────────────────────────────────────
test('B — FORCE ROW LEVEL SECURITY su supplier_profiles', () => {
  assert.match(MIG, /alter table public\.supplier_profiles enable row level security/);
  assert.match(MIG, /alter table public\.supplier_profiles force row level security/);
});

// ── C: public_code opaco, non da UUID ───────────────────────────────
test('C — public_code random opaco (gen_random_uuid), NOT NULL + UNIQUE, mai da id/email/vat', () => {
  assert.match(MIG, /public_code text not null unique/);
  assert.match(MIG, /'VP-' \|\| upper\(substr\(replace\(gen_random_uuid\(\)::text, '-', ''\), 1, 10\)\)/);
  // il codice NON e' derivato dall'id del supplier
  assert.doesNotMatch(MIG, /substr\(\s*q?\.?supplier_id::text/);
  assert.doesNotMatch(MIG, /substr\(\s*s?\.?id::text/);
});

// ── D: customer payload pulito ──────────────────────────────────────
test('D — customer_get_supplier_quotes: solo public_code, niente supplier_id/subtotal/PII', () => {
  const b = fnBody('customer_get_supplier_quotes');
  const retTable = b.slice(b.indexOf('returns table ('), b.indexOf('language plpgsql'));
  assert.doesNotMatch(retTable, /supplier_id|subtotal|company_name|email|phone|vat_number|documents|admin_notes/);
  assert.match(retTable, /supplier_public_code text/);
  const selectList = b.slice(b.indexOf('return query'), b.indexOf('from public.quotes q'));
  assert.match(selectList, /s\.public_code/);
  assert.doesNotMatch(selectList, /supplier_id|subtotal/);
  assert.match(b, /c\.user_id = auth\.uid\(\) or public\.jwt_is_admin\(\)/);
});

// ── E: supplier payload senza PII cliente ──────────────────────────
test('E — supplier_get_available_requests: niente user_id/PII cliente, niente UUID campagna reale', () => {
  const b = fnBody('supplier_get_available_requests');
  assert.doesNotMatch(b, /c\.user_id|customer|email|phone|payment|platform_margin|admin_notes|internal_pric/i);
  assert.match(b, /c\.marketplace_code/);
  assert.doesNotMatch(b, /c\.id as campaign_id|select\s+c\.id\b/i);
});

// ── F: submit quote verified gate ─────────────────────────────────
test('F — supplier_submit_quote: verified gate + supplier_id server-side + campagna disponibile', () => {
  const b = fnBody('supplier_submit_quote');
  assert.match(b, /if not public\.is_verified_supplier\(v_uid\) then/);
  assert.match(b, /\(campaign_id, supplier_id, quote_status,/); // colonna supplier_id nella insert list
  assert.match(b, /values\s*\n\s*\(v_campaign\.id, v_uid, 'submitted'/); // valore = auth.uid()
  assert.doesNotMatch(b, /p_supplier_id/); // mai supplier_id dal browser
  assert.match(b, /where marketplace_code = p_request_code for update/);
  assert.match(b, /v_campaign\.supplier_id is not null/);
  assert.match(b, /OFFERTA_GIA_INVIATA/);
});

// ── G: frontend NON fa insert diretto ────────────────────────────
test('G — supplier-api.js usa SOLO RPC (nessun .from().insert/update su quotes)', () => {
  assert.doesNotMatch(API, /\.from\(['"]quotes['"]\)/);
  assert.doesNotMatch(API, /\.from\(['"]supplier_profiles['"]\)/);
  assert.doesNotMatch(API, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(API, /rpc\('supplier_submit_quote'/);
  assert.match(API, /rpc\('customer_accept_supplier_quote', \{ p_quote_id: quoteId \}\)/);
});

// ── H: accept usa FOR UPDATE ────────────────────────────────────
test('H — customer_accept_supplier_quote: SELECT ... FOR UPDATE su quota e campagna', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /select \* into v_quote from public\.quotes where id = p_quote_id for update/);
  assert.match(b, /select \* into v_campaign from public\.campaigns where id = v_quote\.campaign_id for update/);
});

// ── I: accept deriva campaign dalla quote ──────────────────────
test('I — accept: input SOLO p_quote_id, campaign derivata dalla quote', () => {
  assert.match(MIG, /function public\.customer_accept_supplier_quote\(p_quote_id uuid\)/);
  assert.doesNotMatch(MIG, /customer_accept_supplier_quote\(target_quote_id uuid, target_campaign_id uuid\)/);
});

// ── J: legacy supplier_id IS NULL non toccate ─────────────────
test('J — le quote piattaforma legacy (supplier_id IS NULL) non vengono mai modificate', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /update public\.quotes set quote_status = 'not_selected'[\s\S]{0,200}and supplier_id is not null/);
  assert.doesNotMatch(b, /and id <> p_quote_id;\s*\n\s*update public\.campaigns/); // non c'e' un UPDATE senza il filtro supplier_id
});

// ── K: campaign already assigned denied ──────────────────────
test('K — seconda accettazione su vincitore diverso -> FAIL; stessa quota accettata -> idempotente', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /if v_quote\.quote_status = 'accepted' and v_campaign\.supplier_id = v_quote\.supplier_id then\s*\n\s*return v_campaign;/);
  assert.match(b, /if v_campaign\.supplier_id is not null then\s*\n\s*raise exception 'CAMPAGNA_GIA_ASSEGNATA'/);
});

// ── L: altre offerte fornitore -> not_selected ──────────────
test('L — le altre offerte Fornitore diventano not_selected', () => {
  assert.match(fnBody('customer_accept_supplier_quote'), /set quote_status = 'not_selected'/);
});

// ── M: tutte le SECURITY DEFINER hanno search_path '' ───────
test('M — ogni SECURITY DEFINER ha SET search_path TO \'\'', () => {
  const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const defs = code.match(/security definer/gi) || [];
  const withPath = code.match(/security definer set search_path to ''/gi) || [];
  assert.ok(defs.length >= 12, `attese >=12 SECURITY DEFINER, trovate ${defs.length}`);
  assert.equal(withPath.length, defs.length, `search_path mancante su ${defs.length - withPath.length} funzioni`);
});

// ── N: revoke public/anon ──────────────────────────────────
test('N — ogni RPC: REVOKE ALL ... FROM public, anon + GRANT EXECUTE TO authenticated', () => {
  const rpcs = [
    'is_verified_supplier(uuid)', 'supplier_update_profile(text, text, text, text[], text[])',
    'admin_set_supplier_status(uuid, text, text)', 'customer_get_supplier_quotes(uuid)',
    'supplier_get_available_requests()', 'supplier_submit_quote(text, numeric, text, text, text, timestamptz)',
    'customer_accept_supplier_quote(uuid)', 'supplier_list_own_quotes()',
    'supplier_list_assigned_campaigns()', 'supplier_list_own_operators()',
    'supplier_assign_operator(uuid, uuid)',
  ];
  for (const sig of rpcs) {
    const esc = sig.replace(/[()[\]]/g, (c) => '\\' + c);
    assert.match(MIG, new RegExp(`revoke all on function public\\.${esc} from public, anon`, 'i'), `REVOKE mancante: ${sig}`);
    assert.match(MIG, new RegExp(`grant execute on function public\\.${esc} to authenticated`, 'i'), `GRANT mancante: ${sig}`);
  }
});

// ── O: operator isolation ─────────────────────────────────
test('O — supplier_assign_operator: operatore E campagna devono essere del fornitore', () => {
  const b = fnBody('supplier_assign_operator');
  assert.match(b, /where op\.user_id = p_operator_id and op\.supplier_id = v_uid/);
  assert.match(b, /where c\.id = p_campaign_id and c\.supplier_id = v_uid/);
  assert.match(b, /OPERATORE_NON_DEL_FORNITORE/);
  assert.match(b, /CAMPAGNA_NON_DEL_FORNITORE/);
  assert.match(MIG, /create policy operator_profiles_supplier_select on public\.operator_profiles\s+for select to authenticated using \(supplier_id = auth\.uid\(\)\)/);
});

// ── P: SupplierGuard verified gate ───────────────────────
test('P — SupplierGuard verifica role=supplier E supplier_profiles.status=verified; loading chiuso su denied/error', () => {
  assert.match(GUARD, /profile\?\.role !== 'supplier'/);
  assert.match(GUARD, /from\('supplier_profiles'\)\.select\('status'\)/);
  assert.match(GUARD, /sp\.status !== 'verified'/);
  assert.match(GUARD, /phase: 'not-verified'/);
  // nessun ramo lascia phase:'loading' appeso
  assert.doesNotMatch(GUARD, /setLoading\(false\)/); // rimpiazzato da phase-state
  assert.match(GUARD, /pending: 'Il tuo account fornitore è in attesa di verifica\.'/);
});

// ── Q: own quotes RPC ───────────────────────────────────
test('Q — supplier_list_own_quotes RPC + client', () => {
  assert.match(MIG, /function public\.supplier_list_own_quotes\(\)/);
  assert.match(fnBody('supplier_list_own_quotes'), /where q\.supplier_id = v_uid/);
  assert.match(API, /rpc\('supplier_list_own_quotes'\)/);
  assert.match(DASH, /supplierListOwnQuotes/);
});

// ── R: assigned campaigns RPC ──────────────────────────
test('R — supplier_list_assigned_campaigns RPC + client + dashboard', () => {
  assert.match(fnBody('supplier_list_assigned_campaigns'), /where c\.supplier_id = v_uid/);
  assert.match(API, /rpc\('supplier_list_assigned_campaigns'\)/);
  assert.match(DASH, /Lavori assegnati/);
});

// ── S: legacy quote compatibility ─────────────────────
test('S — quotes.supplier_id nullable FK SET NULL; quote_status nullable (legacy = NULL)', () => {
  assert.match(MIG, /alter table public\.quotes\s*\n\s*add column if not exists supplier_id uuid references public\.supplier_profiles\(id\) on delete set null/);
  assert.doesNotMatch(MIG, /quotes[\s\S]{0,120}supplier_id[\s\S]{0,40}on delete cascade/i);
  assert.match(MIG, /quote_status text\s*\n\s*check \(quote_status is null or quote_status in/);
  // trigger che rende immutabili le quote marketplace dai client diretti
  assert.match(MIG, /create trigger quotes_marketplace_guard_trg/);
});

// ── T: no secret/service_role frontend ────────────────
test('T — nessun secret/service_role nei file frontend marketplace', () => {
  for (const [name, src] of [['supplier-api', API], ['SupplierGuard', GUARD], ['SupplierDashboard', DASH], ['CustomerQuotesView', CUSTVIEW]]) {
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|SUPABASE_SERVICE|sk-[A-Za-z0-9]{16}|secret\s*[:=]/i, `${name}`);
  }
});

// ── F1: multi-supplier quotes / legacy unique index reconciled ──────
test('F1 — idx_quotes_active_unique ristretto a legacy (supplier_id IS NULL) + indice marketplace per (campaign, supplier) submitted', () => {
  // il vincolo legacy viene sostituito, non lasciato incompatibile
  assert.match(MIG, /drop index if exists public\.idx_quotes_active_unique/);
  assert.match(MIG, /create unique index if not exists idx_quotes_active_unique\s*\n\s*on public\.quotes \(campaign_id\)\s*\n\s*where is_active = true and supplier_id is null/);
  // nuovo vincolo marketplace: 1 sola 'submitted' per (campagna, fornitore)
  assert.match(MIG, /create unique index if not exists quotes_marketplace_one_submitted_per_supplier\s*\n\s*on public\.quotes \(campaign_id, supplier_id\)\s*\n\s*where supplier_id is not null and quote_status = 'submitted'/);
  // submit_quote mappa la violazione di unicita' su OFFERTA_GIA_INVIATA (mai raw 23505)
  const b = fnBody('supplier_submit_quote');
  assert.match(b, /exception when unique_violation then/);
  assert.match(b, /exception when unique_violation then[\s\S]{0,400}raise exception 'OFFERTA_GIA_INVIATA'/);
});

// ── F2: real operational group for supplier assignment ──────────────
test('F2 — supplier_assign_operator crea/riusa un operational_group REALE (mai group_id casuale)', () => {
  const b = fnBody('supplier_assign_operator');
  assert.doesNotMatch(b, /v_group_id := gen_random_uuid\(\)/);
  // riuso: prima da un'assegnazione della campagna, poi da operational_groups
  assert.match(b, /select a\.group_id into v_group_id\s*\n\s*from public\.operator_assignments a\s*\n\s*where a\.campaign_id = p_campaign_id and a\.revoked_at is null/);
  assert.match(b, /select og\.id into v_group_id\s*\n\s*from public\.operational_groups og\s*\n\s*where og\.campaign_id = p_campaign_id/);
  // creazione con i campi minimi dello schema
  assert.match(b, /insert into public\.operational_groups \(campaign_id, name\)\s*\n\s*values \(p_campaign_id, 'Generale'\)\s*\n\s*returning id into v_group_id/);
  // concorrenza: advisory lock per-campagna prima del find-or-create
  assert.match(b, /pg_advisory_xact_lock\(hashtext\('supplier_assign_operator_group'\), hashtext\(p_campaign_id::text\)\)/);
  // l'ownership della campagna resta verificata PRIMA della logica di gruppo
  assert.ok(b.indexOf('CAMPAGNA_NON_DEL_FORNITORE') < b.indexOf('pg_advisory_xact_lock'));
});

// ── routing ───────────────────────────────────────────
test('routing — /supplier registrato, risolto, protetto da SupplierGuard', () => {
  assert.match(RESOLVE, /p === '\/supplier'[\s\S]{0,90}return 'supplier-dashboard'/);
  assert.match(APPROUTER, /import \{ SupplierGuard \}/);
  assert.match(APPROUTER, /page === "supplier-dashboard"[\s\S]{0,120}<SupplierGuard/);
});

// ── CustomerQuotesView montata nella pagina dettaglio campagna Cliente ──
test('U — CustomerQuotesView montata in CampaignDashboardPage (una sola volta, nessuna pagina duplicata)', () => {
  // import + montaggio nella pagina dettaglio campagna reale
  assert.match(FINAL, /import \{ CustomerQuotesView \} from "\.\/src\/pages\/customer\/CustomerQuotesView\.jsx"/);
  assert.match(FINAL, /<CustomerQuotesView campaignId=\{routeCampaignId\} status=\{campagna\.rawStatus\} \/>/);
  // una sola occorrenza del componente montato (nessun duplicato)
  assert.equal((FINAL.match(/<CustomerQuotesView\b/g) || []).length, 1);
  // NON montata altrove
  assert.doesNotMatch(APPROUTER, /CustomerQuotesView/);
  assert.doesNotMatch(read('src/pages/customer/CampaignTracking.jsx'), /CustomerQuotesView/);
});

test('U2 — CustomerQuotesView: solo stati Marketplace, CTA "Seleziona preventivo", niente window.*', () => {
  assert.match(CUSTVIEW, /\['requested', 'receiving_quotes', 'quote_selected', 'assigned'\]/);
  assert.match(CUSTVIEW, /Seleziona preventivo/);
  assert.match(CUSTVIEW, /customerAcceptQuote\(quoteId\)/);
  assert.match(CUSTVIEW, /mapMarketplaceError/);
  // nessun update diretto, nessun dialog nativo, nessun reload
  assert.doesNotMatch(CUSTVIEW, /window\.confirm|window\.alert|window\.location\.reload|\balert\(/);
  assert.doesNotMatch(CUSTVIEW, /\.from\(['"](quotes|campaigns)['"]\)/);
  // double-submit lock: bottone disabilitato mentre una selezione e' in corso
  assert.match(CUSTVIEW, /if \(acceptingId\) return;/);
  assert.match(CUSTVIEW, /disabled=\{busy \|\| Boolean\(acceptingId\)\}/);
  // payload privato Fornitore mai referenziato
  assert.doesNotMatch(CUSTVIEW, /supplier_id|company_name|vat_number|admin_notes|\bsubtotal\b|\.email\b|\.phone\b/);
});

// ── raw campaign status nel view model + label italiane nella lista ──
test('U3 — normalizeCustomerCampaign espone rawStatus/marketplaceStatus senza toccare `stato` legacy', () => {
  assert.match(CUSTCAMP, /rawStatus,/);
  assert.match(CUSTCAMP, /marketplaceStatus: isMarketplaceCampaignStatus\(row\.status\) \? rawStatus : null/);
  // backward compat: mapping legacy invariato
  assert.match(CUSTCAMP, /stato: STATUS_TO_CUSTOMER\[row\.status\] \?\? rawStatus/);
  assert.match(CUSTCAMP, /MARKETPLACE_STATUS_LABELS = Object\.freeze\(\{[\s\S]*requested: 'Richiesta inviata'/);
  assert.match(CUSTCAMP, /receiving_quotes: 'Raccolta preventivi'/);
  assert.match(CUSTCAMP, /quote_selected: 'Preventivo selezionato'/);
  assert.match(CUSTCAMP, /assigned: 'Fornitore assegnato'/);
  // lista campagne Cliente: gli stati Marketplace hanno una label (non "sconosciuto")
  assert.match(FINAL, /requested: \[MARKETPLACE_STATUS_LABELS\.requested/);
  assert.match(FINAL, /receiving_quotes: \[MARKETPLACE_STATUS_LABELS\.receiving_quotes/);
});

// ── mapper centrale errori Marketplace ──
test('U4 — mapMarketplaceError: token noti -> messaggi it, sconosciuto -> generico, mai raw', () => {
  assert.match(MKTERR, /export function mapMarketplaceError/);
  for (const tok of ['OFFERTA_GIA_INVIATA', 'FORNITORE_NON_VERIFICATO', 'CAMPAGNA_GIA_ASSEGNATA', 'OPERATORE_NON_DEL_FORNITORE', 'CAMPAGNA_NON_DEL_FORNITORE']) {
    assert.match(MKTERR, new RegExp(`${tok}:`), tok);
  }
  assert.match(MKTERR, /Si è verificato un errore\. Riprova\./);
  // deve saper estrarre il token da un corpo JSON PostgREST grezzo
  assert.match(MKTERR, /JSON\.parse\(trimmed\)/);
  // usato sia lato Fornitore sia lato Cliente
  assert.match(DASH, /mapMarketplaceError/);
  assert.match(CUSTVIEW, /mapMarketplaceError/);
  // supplier-api rpc() normalizza il messaggio JSON grezzo in code+message puliti
  assert.match(API, /if \(trimmed\.startsWith\('\{'\) \|\| trimmed\.startsWith\('\['\)\)/);
});

// ── V: assegnazione operatori nella Dashboard Supplier ("Lavori assegnati") ──
test('V — Dashboard Supplier: pannello inline assegna operatore via RPC, mai INSERT/UPDATE diretto', () => {
  // import delle sole RPC previste
  assert.match(DASH, /supplierListOwnOperators,/);
  assert.match(DASH, /supplierAssignOperator,/);
  // pannello inline dedicato + CTA
  assert.match(DASH, /function AssignOperatorPanel\(/);
  assert.match(DASH, /Assegna operatore/);
  // CTA coerente con la reale capacita' backend: supplier_assign_operator
  // AGGIUNGE, non sostituisce -> "Assegna un altro operatore", mai "Cambia".
  assert.match(DASH, /ops\.length > 0 \? 'Assegna un altro operatore' : 'Assegna operatore'/);
  assert.doesNotMatch(DASH, /'Cambia operatore'/);
  // carica SOLO i propri operatori
  assert.match(DASH, /await supplierListOwnOperators\(\)/);
  // assegna SOLO tramite RPC, signature reale (operatorId, campaignId)
  assert.match(DASH, /await supplierAssignOperator\(selected, campaignId\)/);
  assert.doesNotMatch(DASH, /\.from\(['"](operator_assignments|campaigns|operational_groups)['"]\)/);
  // niente dialog nativi
  assert.doesNotMatch(DASH, /window\.prompt|window\.confirm|window\.alert|\balert\(/);
  // no double-click / disabled durante submit
  assert.match(DASH, /if \(busy \|\| !selected\) return;/);
  assert.match(DASH, /disabled=\{busy \|\| !selected \|\| !operators \|\| operators\.length === 0\}/);
  // operatori inattivi non selezionabili
  assert.match(DASH, /const inactive = o\.active === false;/);
  assert.match(DASH, /disabled=\{inactive \|\| busy\}/);
  // empty state
  assert.match(DASH, /Non hai ancora operatori disponibili\./);
  // errori mappati; gia'-assegnato NON e' un errore per l'utente
  assert.match(DASH, /setErr\(mapMarketplaceError\(e\)\)/);
  assert.match(DASH, /e\?\.code === '23505' \|\| String\(e\?\.message\) === 'ASSEGNAZIONE_GIA_PRESENTE'/);
  // operatore/i assegnato/i mostrato/i dopo il successo, dalla fonte di verita'
  assert.match(DASH, /'Operatore assegnato: ' : 'Operatori assegnati: '/);
  assert.match(DASH, /ops\.join\(', '\)/);
  // la UI NON crea gruppi: nessun riferimento a operational_groups / group_id
  assert.doesNotMatch(DASH, /operational_group|group_id|gen_random_uuid/i);
});

// ── W: sezioni read-only della Dashboard invariate ──
test('W — sezioni "Richieste disponibili" / "I miei preventivi" invariate (nessuna regressione)', () => {
  assert.match(DASH, /Richieste disponibili/);
  assert.match(DASH, /I miei preventivi/);
  // il reload iniziale carica ancora esattamente 3 liste (no operatori eager)
  assert.match(DASH, /getSupplierAvailableRequests\(\)\.catch/);
  assert.match(DASH, /supplierListOwnQuotes\(\)\.catch/);
  assert.match(DASH, /supplierListAssignedCampaigns\(\)\.catch/);
  assert.doesNotMatch(DASH, /Promise\.all\(\[[\s\S]*supplierListOwnOperators\(\)[\s\S]*\]\)/);
});

// ── client wrapper assegnazione: signature + solo RPC ──
test('X — supplierAssignOperator wrapper: rpc supplier_assign_operator, args mappati', () => {
  assert.match(API, /export function supplierAssignOperator\(operatorId, campaignId\)/);
  assert.match(API, /rpc\('supplier_assign_operator', \{ p_operator_id: operatorId, p_campaign_id: campaignId \}\)/);
  assert.match(API, /export function supplierListOwnOperators\(\)/);
  assert.match(API, /rpc\('supplier_list_own_operators'\)/);
});

// ── Y: nuova RPC read-only supplier_list_campaign_assignments (migration dedicata) ──
test('Y — supplier_list_campaign_assignments: SECURITY DEFINER, search_path bloccato, no params, isolamento via campaigns.supplier_id, payload minimo', () => {
  const M = MIG_ASG;
  // firma: nessun parametro accettato dal client (no p_campaign_id)
  assert.match(M, /create or replace function public\.supplier_list_campaign_assignments\(\)/);
  assert.doesNotMatch(M, /function public\.supplier_list_campaign_assignments\([^)]*p_/);
  // hardening
  assert.match(M, /security definer/);
  assert.match(M, /set search_path to ''/);
  assert.match(M, /language plpgsql/);
  assert.match(M, /\bstable\b/);
  assert.match(M, /alter function public\.supplier_list_campaign_assignments\(\) owner to postgres/);
  assert.match(M, /revoke all on function public\.supplier_list_campaign_assignments\(\) from public, anon/);
  assert.match(M, /grant execute on function public\.supplier_list_campaign_assignments\(\) to authenticated/);
  // autenticazione obbligatoria
  assert.match(M, /v_uid uuid := auth\.uid\(\)/);
  assert.match(M, /if v_uid is null then\s*\n\s*raise exception 'NON_AUTENTICATO'/);
  // isolamento: SOLO campagne del Supplier; nessun campaign_id dal client
  assert.match(M, /join public\.campaigns c\s*\n\s*on c\.id = a\.campaign_id\s*\n\s*and c\.supplier_id = v_uid/);
  // payload minimo dichiarato nella returns table
  const retTable = M.slice(M.indexOf('returns table ('), M.indexOf('language plpgsql'));
  for (const col of ['campaign_id uuid', 'assignment_id uuid', 'operator_id uuid', 'operator_display_name text', 'assignment_status text', 'group_id uuid', 'group_name text', 'created_at timestamptz']) {
    assert.ok(retTable.includes(col), `manca colonna payload: ${col}`);
  }
  // NIENTE dati sensibili nel corpo eseguibile (esclusi i commenti di testata)
  const body = M.slice(M.indexOf('create or replace function'));
  assert.doesNotMatch(body, /email|phone|telefono|document|vat_number|admin_notes|access_token|price|pricing|gps|latitude|longitude/i);
  // sola lettura: nessun INSERT/UPDATE/DELETE su tabelle
  assert.doesNotMatch(body, /\b(insert into|update public\.|delete from)\b/i);
});

// ── Z: client wrapper della nuova RPC ──
test('Z — supplierListCampaignAssignments wrapper: chiama SOLO rpc supplier_list_campaign_assignments, nessun argomento', () => {
  assert.match(API, /export function supplierListCampaignAssignments\(\)/);
  assert.match(API, /rpc\('supplier_list_campaign_assignments'\)/);
  // nessun campaign_id passato dal client a questa RPC
  assert.doesNotMatch(API, /rpc\('supplier_list_campaign_assignments',/);
});

// ── AA: Dashboard ricostruisce l'assegnazione dopo un refresh, dal backend ──
test('AA — Dashboard: read-path assegnazioni dal backend, "corrente" = solo status active, mai da state/cache precedente', () => {
  // import della nuova RPC
  assert.match(DASH, /supplierListCampaignAssignments,/);
  // reload dedicato che parte SEMPRE dalla RPC
  assert.match(DASH, /const reloadAssignments = useCallback\(async \(\) => \{[\s\S]*supplierListCampaignAssignments\(\)/);
  // lookup campaign_id -> operatori: SOLO assegnazioni active (non "ultimo per created_at")
  assert.match(DASH, /if \(a\.assignment_status !== 'active'\) continue;/);
  assert.match(DASH, /const activeOpsByCampaign = useMemo\(/);
  // al mount si ricarica SEMPRE dal backend (oltre a reload())
  assert.match(DASH, /useEffect\(\(\) => \{ reload\(\); reloadAssignments\(\); \}/);
  // dopo un assign la UI si riallinea dalla fonte di verita', non da state locale
  assert.match(DASH, /await reloadAssignments\(\);/);
  // nessuna mappa di assegnazioni tenuta come "verita'" nello state del componente
  assert.doesNotMatch(DASH, /assignedByCampaign/);
  // nessuna persistenza client-side spacciata per fonte dati
  assert.doesNotMatch(DASH, /localStorage|sessionStorage/);
});
