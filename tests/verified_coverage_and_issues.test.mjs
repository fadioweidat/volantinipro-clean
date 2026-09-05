import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const migCoverage = read('supabase/migrations/20260830090000_verified_coverage_line_and_source.sql');
const migIssues = read('supabase/migrations/20260830093000_customer_issues.sql');
const migIssueRpcs = read('supabase/migrations/20260830094000_customer_issue_rpcs.sql');
const covApi = read('src/lib/services/coverage-adjustments-api.js');
const issuesApi = read('src/lib/services/customer-issues-api.js');
const panel = read('src/components/admin/CoverageAdjustmentPanel.jsx');
const customerTracking = read('src/pages/customer/CampaignTracking.jsx');
const customerApi = read('src/lib/services/customer-api.js');
const gpsApi = read('src/lib/services/gps-api.js');
const driverPage = read('src/pages/driver/DriverAssignmentPage.jsx');
const adminIssues = read('src/components/admin/AdminIssuesPanel.jsx');

// ===========================================================================
// A. UNIFIED VERIFIED COVERAGE + EDITOR SU 3 LIVELLI
// ===========================================================================

test('A: migrazione estende campaign_coverage_adjustments (source + LineString), NON crea una seconda tabella verified_coverage', () => {
  assert.match(migCoverage, /alter table public\.campaign_coverage_adjustments\s+add column if not exists source text/);
  assert.match(migCoverage, /source in \('manual_verified', 'automatic_verified', 'gps_exclusion'\)/);
  assert.match(migCoverage, /add column if not exists line_buffer_m numeric/);
  assert.match(migCoverage, /'POLYGON', 'MULTIPOLYGON', 'LINESTRING', 'MULTILINESTRING'/);
  assert.doesNotMatch(migCoverage, /create table [^;]*verified_coverage/i);
  assert.match(migCoverage, /^begin;/m);
  assert.match(migCoverage, /^commit;/m);
  assert.doesNotMatch(migCoverage, /drop table|truncate|db reset|db push|delete from public\.gps_tracking_points/i);
});

test('A: GPS erase = overlay (source=gps_exclusion / type=exclusion), MAI un DELETE/UPDATE su gps_tracking_points', () => {
  // La RPC crea la riga overlay; nessuna scrittura sullo storico GPS.
  assert.match(migCoverage, /GPS_EXCLUSION_RICHIEDE_TYPE_EXCLUSION/);
  assert.doesNotMatch(migCoverage, /update public\.gps_tracking_points|delete from public\.gps_tracking_points/i);
  // calculate_campaign_final_coverage SOTTRAE le esclusioni dalla geometria GPS.
  assert.match(migCoverage, /source = 'gps_exclusion'/);
  assert.match(migCoverage, /v_gps_geom := public\.ST_Difference\(v_gps_geom, public\.ST_Intersection\(v_gps_exclusion_geom/);
});

test('A: calculate_campaign_final_coverage bufferizza le LineString e espone final_coverage_geometry (unica per Admin+Cliente)', () => {
  assert.match(migCoverage, /create or replace function public\.calculate_campaign_final_coverage/);
  assert.match(migCoverage, /GeometryType\(geometry\) in \('LINESTRING', 'MULTILINESTRING'\)[\s\S]*?ST_Buffer\(geometry::public\.geography, coalesce\(line_buffer_m, 12\)\)/);
  assert.match(migCoverage, /'final_coverage_geometry', case[\s\S]*?ST_AsGeoJSON/);
  // stesso motore per zona (report finale)
  assert.match(migCoverage, /create or replace function public\.calculate_zone_final_coverage/);
});

test('A: admin_create/update_coverage_adjustment accettano source + line_buffer_m + LineString', () => {
  assert.match(migCoverage, /p_source text default 'manual_verified', p_line_buffer_m numeric default null/);
  assert.match(migCoverage, /p_adjustment_type not in \('manual_covered', 'partially_covered', 'inaccessible', 'exclusion'\)/);
  assert.match(migCoverage, /LINE_BUFFER_NON_VALIDO/);
});

test('A: coverage-adjustments-api passa source/lineBufferM; espone VERIFIED_COVERAGE_STYLE + livelli + LineString helper', () => {
  assert.match(covApi, /p_source: source/);
  assert.match(covApi, /p_line_buffer_m: lineBufferM/);
  assert.match(covApi, /export const COVERAGE_SOURCE_LEVELS/);
  assert.match(covApi, /gps_exclusion/);
  assert.match(covApi, /automatic_verified/);
  assert.match(covApi, /manual_verified/);
  assert.match(covApi, /export const VERIFIED_COVERAGE_STYLE/);
  assert.match(covApi, /export function latLngsToLineStringGeoJson/);
});

test('A: CoverageAdjustmentPanel — matita + gomma + seleziona + annulla + salva su TUTTI e 3 i livelli', () => {
  // livello selezionabile: gps / automatic / manual; init dal prop
  // defaultSourceLevel (usato dal tab AUTOMATICO ADMIN per aprire su
  // 'automatic_verified').
  assert.match(panel, /COVERAGE_SOURCE_LEVELS\.map/);
  assert.match(panel, /defaultSourceLevel = 'manual_verified'/);
  assert.match(panel, /const \[sourceLevel, setSourceLevel\] = useState\(defaultSourceLevel\)/);
  assert.match(panel, /const isGpsLevel = sourceLevel === 'gps_exclusion'/);
  // matita: area OPPURE linea
  // §6/§G del ticket "operatori reali": per completare vie/tratti il default e' LINEA
  assert.match(panel, /const \[drawMode, setDrawMode\] = useState\('line'\)/);
  assert.match(panel, /Matita a tratto \(linea\)/);
  assert.match(panel, /latLngsToLineStringGeoJson\(/);
  // gomma sul GPS: type forzato exclusion, area
  assert.match(panel, /setDraftType\('exclusion'\)/);
  assert.match(panel, /Esclusione GPS \(gomma\)/);
  // undo (annulla) + save
  assert.match(panel, /const handleUndo = \(\) =>/);
  assert.match(panel, /const \[undoStack, setUndoStack\] = useState\(\[\]\)/);
  assert.match(panel, /onClick=\{handleSave\}/);
  // seleziona = click su un adjustment esistente -> startEditing (tool 'select')
  assert.match(panel, /if \(!correcting\) \{ startEditing\(adj\); return; \}/);
  assert.match(panel, /if \(tool === 'select'\) startEditing\(adj\)/);
});

test('AUTO: toolbar reale [SELEZIONA][MATITA][GOMMA][ANNULLA][SALVA] + "Carica copertura automatica"', () => {
  assert.match(panel, /const \[tool, setTool\] = useState\('draw'\)/);
  assert.match(panel, /onClick=\{\(\) => setTool\('select'\)\}[\s\S]{0,80}Seleziona/);
  assert.match(panel, /setTool\('draw'\)[\s\S]{0,80}Matita/);
  assert.match(panel, /onClick=\{\(\) => setTool\('erase'\)\}[\s\S]{0,120}Gomma/);
  assert.match(panel, /onClick=\{handleUndo\}[\s\S]{0,120}Annulla/);
  assert.match(panel, /onClick=\{handleSave\}[\s\S]{0,120}Salva/);
  assert.match(panel, /GOMMA attiva — sulle bozze taglia solo la parte dentro il cerchio/);
  // Config "Copertura automatica" visibile in contesto automatico (tab AUTO)
  // anche se l'Admin sposta il selettore livello per usare la GOMMA.
  assert.match(panel, /const autoConfigVisible = autoContext \|\| sourceLevel === 'automatic_verified'/);
  assert.match(panel, /\{correcting && !editingId && autoConfigVisible && \(/);
  assert.match(panel, /onClick=\{loadAutomaticBase\}[\s\S]{0,320}(Carica|Rigenera) copertura automatica/);
});

test('AUTO: base automatica = vie reali OSM convertite in tratti draft (non percentuale finta)', () => {
  assert.match(panel, /import \{ resolveRoadNetwork \} from '\.\.\/\.\.\/lib\/geo\/resolveRoadNetwork\.js'/);
  assert.match(panel, /selectRoadsFromOrigin/);
  // La selezione stradale vive ora in applyAutoSelectionFromCache (helper puro
  // condiviso da loadAutomaticBase e dall'effetto reattivo su autoPct); la
  // slice parte da li' e arriva fino a handleCloseShape.
  const fn = panel.slice(panel.indexOf('const applyAutoSelectionFromCache'), panel.indexOf('const handleCloseShape'));
  assert.match(fn, /resolveRoadNetwork\(municipalityName, boundaryGeometry\)/);
  assert.match(fn, /selectRoadsFromOrigin\(net, origin, pct, gpsPath\)/);
  assert.match(fn, /\.map\(\(w\) => w\.geometry\)/);
  // §10 del ticket "AUTOMATICO ADMIN COMPLETO": ricaricare SOSTITUISCE la bozza
  // automatica precedente (per reference) invece di accodarla -> niente duplicati.
  assert.match(fn, /setDraftLines\(\(prev\) => \[\.\.\.prev\.filter\(\(l\) => !lastAutoLines\.includes\(l\)\), \.\.\.lines\]\)/);
  assert.match(fn, /setSourceLevel\('automatic_verified'\)/);
  // L'Editor Copertura Avanzato (pagina Admin dedicata, ticket "3 esperienze
  // GPS") passa municipalityName + automaticPercent al pannello del tab AUTO.
  const editor = read('src/pages/admin/CoverageEditor.jsx');
  assert.match(editor, /defaultSourceLevel="automatic_verified"[\s\S]{0,240}municipalityName=\{activeZoneName\}[\s\S]{0,240}automaticPercent=\{/);
});

test('AUTO: GOMMA — split parziale su bozze E su righe salvate (§8); undo ripristina', () => {
  const fn = panel.slice(panel.indexOf('const eraseNearest'), panel.indexOf('const applyAutoSelectionFromCache'));
  assert.match(fn, /draftLines\.forEach\(\(line, i\) => \{ const d = pointToPolylineMeters/);
  // §8: sulla bozza NON si rimuove piu' l'intera linea, si applica lo split parziale
  assert.match(fn, /applyDraftLineSplit\(draftLines\[bestI\], pt\)/);
  assert.doesNotMatch(fn, /setDraftLines\(\(prev\) => prev\.filter\(\(_, i\) => i !== bestI\)\)/);
  // riga salvata (LineString/MultiLineString): GOMMA PARZIALE -> handleSplitAdjustment
  // (revoca sorgente + segmenti residui in 1 sola RPC atomica); poligono -> revoca.
  assert.match(fn, /handleSplitAdjustment\(bestAdj, residuals\)/);
  assert.match(fn, /handleRevoke\(bestAdj\);\s*\n\s*return;/);
  assert.match(panel, /await splitCoverageAdjustment\(\{/);
  // helper puro usato per il taglio
  assert.match(panel, /import \{ splitPolylineByCircle, polylineLengthMeters \} from '\.\.\/\.\.\/lib\/geo\/splitPolylineByCircle\.js'/);
  assert.match(panel, /const pieces = splitPolylineByCircle\(original, pt, eraseRadiusM\)/);
  // undo di una gomma ripristina la forma (aree/linee intere + split parziale)
  assert.match(panel, /last\.kind === 'erase-line'\) setDraftLines\(\(p\) => \[\.\.\.p, last\.line\]\)/);
  assert.match(panel, /last\.kind === 'erase-area'\) setDraftAreas\(\(p\) => \[\.\.\.p, last\.area\]\)/);
  assert.match(panel, /last\.kind === 'split-line'/);
  assert.match(panel, /const restored = \[\.\.\.without\.slice\(0, insertAt\), last\.original, \.\.\.without\.slice\(insertAt\)\]/);
});

test('A: UNDO ripristina l\'ultima modifica non salvata (vertice, poi ultima forma chiusa)', () => {
  const fn = panel.slice(panel.indexOf('const handleUndo'), panel.indexOf('const handleUndo') + 500);
  assert.match(fn, /activeLine\.length > 0[\s\S]*?slice\(0, -1\)/);
  assert.match(fn, /activeVertices\.length > 0[\s\S]*?slice\(0, -1\)/);
  assert.match(fn, /undoStack\[undoStack\.length - 1\]/);
  assert.match(fn, /setDraftLines\(\(p\) => p\.slice\(0, -1\)\)|setDraftAreas\(\(p\) => p\.slice\(0, -1\)\)/);
});

test('A: Admin ha l\'anteprima "Copertura finale" = STESSA geometria/stile del Cliente', () => {
  assert.match(panel, /coverage\.final_coverage_geometry/);
  assert.match(panel, /pathOptions=\{VERIFIED_COVERAGE_STYLE\}/);
  assert.match(panel, /Anteprima "Copertura finale" \(identica alla vista Cliente\)/);
});

// ===========================================================================
// A (cont). CLIENTE: resa UNIFORME, nessuna etichetta tecnica
// ===========================================================================

test('A: Cliente rende SOLO la copertura verificata finale, stile unico, nessuna traccia GPS grezza ne\' colori per source', () => {
  // usa final_coverage_geometry con lo stile condiviso
  assert.match(customerTracking, /VERIFIED_COVERAGE_STYLE/);
  assert.match(customerTracking, /finalCoverage\?\.final_coverage_geometry/);
  // niente piu' polilinea blu della traccia grezza ne' ADJUSTMENT_COLORS per tipo
  assert.doesNotMatch(customerTracking, /pathOptions=\{\{ color: '#2563eb', weight: 4/);
  assert.doesNotMatch(customerTracking, /ADJUSTMENT_COLORS\[adj\.adjustment_type\]/);
  // legenda: unica voce "Copertura verificata", nessuna "Copertura GPS"/"Correzione manuale Admin"
  assert.match(customerTracking, /label="Copertura verificata"/);
  assert.doesNotMatch(customerTracking, /label="Copertura GPS"/);
  assert.doesNotMatch(customerTracking, /label="Correzione manuale Admin"/);
});

test('A: get_campaign_coverage_adjustments NON espone source/tipo/geometry ai non-admin', () => {
  assert.match(migCoverage, /else\s*\n\s*--[^\n]*non-admin[\s\S]*?jsonb_build_object\('id', a\.id, 'updated_at', a\.updated_at\)/);
});

test('A: customer-api recupera final coverage + issues; GPS originale MAI modificato', () => {
  assert.match(customerApi, /getFinalCoverage\(campaignId\)/);
  assert.match(customerApi, /getCustomerIssues\(campaignId\)/);
  assert.match(customerApi, /finalCoverage/);
  // il modulo customer non scrive nulla su gps_tracking_points
  assert.doesNotMatch(customerApi, /gps_tracking_points/);
});

// ===========================================================================
// B. CUSTOMER ISSUE — routing diretto + fallback admin
// ===========================================================================

test('B: customer_create_issue verifica ownership, instrada SOLO se 1 candidato certo, altrimenti admin_queue', () => {
  assert.match(migIssueRpcs, /if not public\.current_user_owns_campaign\(p_campaign_id\) then\s*\n\s*raise exception 'CAMPAGNA_NON_AUTORIZZATA'/);
  assert.match(migIssueRpcs, /ST_Contains\(z\.geometry, public\.ST_SetSRID\(public\.ST_MakePoint\(p_lng, p_lat\)/);
  assert.match(migIssueRpcs, /if v_cands is not null and array_length\(v_cands, 1\) = 1 then/);
  assert.match(migIssueRpcs, /v_routed := 'driver'/);
  assert.match(migIssueRpcs, /v_routed text := 'admin_queue'/);
  assert.match(migIssueRpcs, /insert into public\.issue_events \(issue_id, event_type[\s\S]*?'CUSTOMER_ISSUE_CREATED'/);
  assert.match(migIssueRpcs, /'DRIVER_ISSUE_ASSIGNED'/);
});

test('B: Dashboard Cliente ha la card "Segnala un problema" (zona reale/via/civico/motivo/note)', () => {
  assert.match(customerTracking, /Segnala un problema/);
  assert.match(customerTracking, /createCustomerIssue\(/);
  assert.match(customerTracking, /ISSUE_REASONS\.map/);
  // TICKET FIX SEGNALAZIONI: la zona e' scelta da un menu con le zone REALI
  // della campagna (stessa fonte della mappa tracking, zoneRows), non piu'
  // digitata a mano — root cause del mancato instradamento al driver
  // (customer_create_issue instradava solo via point-in-polygon su lat/lng,
  // mai raccolti dal form; con la zona reale instrada per zone_id).
  assert.match(customerTracking, /zones\.map\(\(z\) => <option key=\{z\.id\} value=\{z\.id\}>\{z\.zone_name\}<\/option>\)/);
  assert.match(customerTracking, /zoneId: form\.zoneId \|\| null/);
  assert.match(customerTracking, /Via \(es\. Via Roma\)/);
  assert.match(customerTracking, /Civico/);
});

test('B: admin_route_issue = fallback / override manuale (solo admin)', () => {
  assert.match(migIssueRpcs, /create or replace function public\.admin_route_issue/);
  assert.match(migIssueRpcs, /if not public\.gps_is_admin\(\) then raise exception 'ADMIN_NON_AUTORIZZATO'/);
  assert.match(adminIssues, /adminRouteIssue\(/);
  assert.match(adminIssues, /Instrada a/);
});

// ===========================================================================
// C. DRIVER — risoluzione segnalazione
// ===========================================================================

test('C: driver_list_issues / driver_transition_issue scoped alla SOLA assignment (auth o token)', () => {
  assert.match(migIssueRpcs, /create or replace function public\.driver_list_issues\(p_assignment_id uuid, p_access_token text/);
  assert.match(migIssueRpcs, /where i\.assignment_id = p_assignment_id/);
  assert.match(migIssueRpcs, /p_action not in \('take', 'resolve', 'not_resolvable'\)/);
  assert.match(migIssueRpcs, /status = 'in_progress', taken_at = coalesce\(taken_at, now\(\)\)/);
  assert.match(migIssueRpcs, /status = 'resolved'/);
  assert.match(migIssueRpcs, /and access_token = p_access_token/);
});

test('C: sezione Driver "Segnalazioni" — naviga / sul posto / foto / nota / chiudi', () => {
  assert.match(driverPage, /function DriverIssuesSection/);
  assert.match(driverPage, /driverListIssues\(assignmentId, accessToken/);
  assert.match(driverPage, /VERIFICA CLIENTE/);
  assert.match(driverPage, /Sono sul posto/);
  assert.match(driverPage, /Foto verifica/);
  assert.match(driverPage, /Chiudi come risolta/);
  assert.match(driverPage, /Non risolvibile/);
  assert.match(driverPage, /driverTransitionIssue\(\{ issueId: issue\.id, action/);
});

test('C: foto di verifica richiede coordinate valide (GPS obbligatorio)', () => {
  assert.match(migIssueRpcs, /if p_lat is null or p_lng is null or p_lat < -90[\s\S]*?raise exception 'COORDINATE_OBBLIGATORIE'/);
  assert.match(gpsApi, /Posizione GPS obbligatoria per la foto di verifica/);
  assert.match(driverPage, /navigator\.geolocation\.getCurrentPosition/);
});

// ===========================================================================
// D. PHOTO ISOLATION
// ===========================================================================

test('D: foto verifica in issue_verification_photos, MAI in proof_photos (nessuna gallery)', () => {
  assert.match(migIssues, /create table if not exists public\.issue_verification_photos/);
  assert.match(migIssueRpcs, /insert into public\.issue_verification_photos/);
  // la RPC di verifica NON scrive su proof_photos
  const fn = migIssueRpcs.slice(migIssueRpcs.indexOf('driver_register_issue_photo'));
  assert.doesNotMatch(fn.slice(0, 2500), /insert into public\.proof_photos/);
  // prefisso storage dedicato .../issue/... (mai .../session/...)
  assert.match(migIssueRpcs, /'campaign\/' \|\| v_issue\.campaign_id::text \|\| '\/issue\/' \|\| v_issue\.id::text \|\| '\/photo\/'/);
  assert.match(gpsApi, /campaign\/\$\{campaignId\}\/issue\/\$\{issueId\}\/photo\//);
});

test('D: il Cliente vede la foto SOLO nella propria segnalazione (get_customer_issues), non nella gallery approvata', () => {
  assert.match(migIssueRpcs, /create or replace function public\.get_customer_issues/);
  assert.match(migIssueRpcs, /from public\.issue_verification_photos p where p\.issue_id = i\.id/);
  // customer-api tiene le foto issue dentro issue.photos, separate da photos(gallery)
  assert.match(customerApi, /issuesWithPhotos/);
  assert.match(customerApi, /MAI mescolate con approvedPhotos/);
});

test('D: NON viene mai salvato un access_token con la foto (nessuna colonna, nessun insert)', () => {
  // nessuna COLONNA access_token nelle tabelle issue
  assert.doesNotMatch(migIssues, /^\s*access_token\s+(text|uuid)/m);
  const fn = migIssueRpcs.slice(migIssueRpcs.indexOf('driver_register_issue_photo'), migIssueRpcs.indexOf('driver_register_issue_photo') + 2500);
  assert.doesNotMatch(fn, /insert into public\.issue_verification_photos[\s\S]*?access_token/);
});

// ===========================================================================
// E. SECURITY / RLS
// ===========================================================================

test('E: RLS — cliente solo proprie campagne, driver solo proprie assignment, admin tutto (nessuna policy permissiva generica)', () => {
  for (const t of ['customer_issues', 'issue_verification_photos', 'issue_events']) {
    assert.match(migIssues, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(migIssues, new RegExp(`alter table public\\.${t} force row level security`));
  }
  assert.match(migIssues, /customer_issues_owner_select[\s\S]*?using \(public\.current_user_owns_campaign\(campaign_id\)\)/);
  assert.match(migIssues, /customer_issues_driver_select[\s\S]*?a\.operator_id = auth\.uid\(\)/);
  assert.match(migIssues, /customer_issues_admin_all[\s\S]*?public\.gps_is_admin\(\)/);
  // nessun "to public" / "using (true)" permissivo
  assert.doesNotMatch(migIssues, /create policy[^;]*to public/i);
  assert.doesNotMatch(migIssues, /using \(true\)/);
});

test('E: RPC issue tutte SECURITY DEFINER con autorizzazione riletta server-side', () => {
  const defs = migIssueRpcs.match(/create or replace function public\.\w+/g) || [];
  assert.ok(defs.length >= 6, 'almeno 6 RPC issue');
  assert.match(migIssueRpcs, /security definer set search_path to ''/);
  // le RPC "cliente" e "admin" non sono concesse ad anon (solo authenticated)
  assert.match(migIssueRpcs, /grant execute on function public\.customer_create_issue\([^;]*\) to authenticated;/);
  assert.doesNotMatch(migIssueRpcs, /grant execute on function public\.customer_create_issue\([^;]*to anon/);
  assert.doesNotMatch(migIssueRpcs, /grant execute on function public\.admin_list_issues\([^;]*to anon/);
});

// ===========================================================================
// Immutabilita' GPS + non-regressione
// ===========================================================================

test('GPS RAW PRESERVED: nessuna delle 3 migrazioni tocca gps_tracking_points / delivery_sessions', () => {
  for (const m of [migCoverage, migIssues, migIssueRpcs]) {
    assert.doesNotMatch(m, /delete from public\.(gps_tracking_points|delivery_sessions)/i);
    assert.doesNotMatch(m, /update public\.gps_tracking_points/i);
    assert.doesNotMatch(m, /truncate|db reset|db push|migration repair/i);
  }
});

test('non-regressione: le RPC coverage restano CREATE OR REPLACE; l\'unico DROP FUNCTION e\' la pulizia degli overload a 7 arg (pre-source)', () => {
  assert.match(migCoverage, /create or replace function public\.get_campaign_coverage_adjustments/);
  assert.match(migCoverage, /create or replace function public\.admin_create_coverage_adjustment/);
  // nessun DROP di tabelle/schema; l'unico drop function ammesso e' quello
  // degli overload legacy a 7 argomenti (firma esplicita, IF EXISTS).
  assert.doesNotMatch(migCoverage, /drop table|drop schema|truncate|db reset|db push/i);
  const drops = [...migCoverage.matchAll(/drop function[^;]*/gi)].map((m) => m[0]);
  for (const d of drops) {
    assert.match(d, /drop function if exists public\.admin_(create|update)_coverage_adjustment\(uuid, /,
      `DROP FUNCTION non atteso: ${d}`);
  }
});

// ===========================================================================
// FIX MIRATO — AUTOMATICO ADMIN e' un editor reale; una sola "finale"
// ===========================================================================

test('AUTO tab: usa CoverageAdjustmentPanel su livello automatic_verified (matita/gomma/undo/save/preview)', () => {
  // Editor Copertura Avanzato (pagina Admin dedicata, non collegata dal
  // Monitor): mantiene i due tab con diagnostica/override.
  const editor = read('src/pages/admin/CoverageEditor.jsx');
  const autoBlock = editor.slice(editor.indexOf("editorTab === 'auto'"), editor.indexOf('<AdminIssuesPanel'));
  assert.match(autoBlock, /<CoverageAdjustmentPanel[\s\S]*?defaultSourceLevel="automatic_verified"/);
  assert.match(autoBlock, /<details[\s\S]*?Diagnostica: selezione stradale automatica \(sola lettura\)[\s\S]*?<ZoneCoverageMap/);
  // Il Monitor operativo Admin monta il pannello in modalità SEMPLICE
  // (strumenti quotidiani inline), senza diagnostica/override/selettore livello.
  const gm = read('src/pages/admin/GpsMonitor.jsx');
  assert.match(gm, /<CoverageAdjustmentPanel\s*\n\s*key=\{`\$\{campaignId\}:\$\{selectedZoneId \|\| 'none'\}`\}\s*\n\s*simple/);
  assert.doesNotMatch(gm, /<ZoneCoverageMap|<ZoneProgressPanel/);
});

test('AUTO tab: override legacy (ZoneProgressPanel) e\' collassato e marcato "non alimenta la Copertura Verificata"', () => {
  const editor = read('src/pages/admin/CoverageEditor.jsx');
  const autoBlock = editor.slice(editor.indexOf("editorTab === 'auto'"), editor.indexOf('<AdminIssuesPanel'));
  assert.match(autoBlock, /<details[\s\S]*?Override legacy percentuale \(non alimenta la Copertura Verificata\)[\s\S]*?<ZoneProgressPanel/);
  assert.match(autoBlock, /Per correggere la copertura usa Matita\/Gomma qui sopra/);
  // la riga diagnostica resta marcata "Legacy" e non spacciata per Copertura Verificata
  assert.match(autoBlock, /Legacy — Automatico grezzo:/);
  // il Monitor operativo non contiene piu' il pannello percentuale legacy
  const gm = read('src/pages/admin/GpsMonitor.jsx');
  assert.doesNotMatch(gm, /<ZoneProgressPanel/);
});

test('FINALE: la percentuale/geometria finale ha UNA sola fonte = calculate_campaign_final_coverage', () => {
  const p = read('src/components/admin/CoverageAdjustmentPanel.jsx');
  // il pannello (usato sia da MANUALE sia da AUTOMATICO) legge SOLO getFinalCoverage
  assert.match(p, /getFinalCoverage\(campaignId\)/);
  assert.match(p, /coverage\.final_operational_coverage_pct/);
  assert.match(p, /FINALE VERIFICATA/);
  assert.match(p, /GPS reale/);              // metrica GPS dal motore verified, non session-scoped
  // Cliente e Admin: stessa RPC
  assert.match(customerApi, /getFinalCoverage\(campaignId\)/);
});
