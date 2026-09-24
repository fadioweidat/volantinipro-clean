import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = rd('../supabase/migrations/20260924140000_driver_group_operators_map_visibility.sql');
const gpsApi = rd('../src/lib/services/gps-api.js');
const mapPage = rd('../src/pages/driver/DriverWorkMapPage.jsx');

test('Migration: get_driver_group_tracking include tutti i membri del gruppo (con o senza sessione)', () => {
  assert.match(migration, /all_members as/);
  assert.match(migration, /from public\.operator_assignments a/);
  assert.match(migration, /left join public\.driver_group_participants p/);
  assert.match(migration, /coalesce\(s\.status, 'not_started'\) as status/);
  assert.match(migration, /case\s*\n\s*when n\.is_self then 'Tu'/);
  assert.match(migration, /case when a\.group_access_link_id is null then 'Caposquadra'/);
});

test('Migration: driver_group_join eredita le zone del gruppo in operator_assignment_zones', () => {
  assert.match(migration, /insert into public\.operator_assignment_zones \(assignment_id, zone_id, municipality_name, quantity\)/);
  assert.match(migration, /from public\.operator_assignment_zones oaz/);
  assert.match(migration, /where orig\.group_id = v_link\.group_id and orig\.group_access_link_id is null/);
});

test('Migration: get_public_driver_assignment fa fallback difensivo su campaign_zones del gruppo', () => {
  assert.match(migration, /if v_zones = '\[\]'::jsonb and v_assignment\.group_id is not null then/);
  assert.match(migration, /from public\.campaign_zones cz/);
  assert.match(migration, /where cz\.campaign_id = v_assignment\.campaign_id/);
});

test('gps-api: getDriverGroupTracking gestisce sessioni senza id e status not_started', () => {
  assert.match(gpsApi, /sessionId: s\.id \|\| null/);
  assert.match(gpsApi, /status: s\.status \|\| 'not_started'/);
  assert.match(gpsApi, /assignmentId: s\.assignment_id \|\| null/);
});

test('DriverWorkMapPage: GROUP_STATUS_LABEL definisce not_started come "non ancora avviato"', () => {
  assert.match(mapPage, /not_started:\s*'non ancora avviato'/);
  assert.match(mapPage, /sessionId: track\.sessionId \|\| `pending-participant-\$\{track\.assignmentId \|\| index\}`/);
});

test('DriverWorkMapPage: mappa e legenda visualizzano correttamente operatori con traccia e non avviati', () => {
  // ZERO Polylines: nessuna Polyline importata o renderizzata per i punti GPS
  assert.doesNotMatch(mapPage, /import\s*\{[^}]*Polyline[^}]*\}\s*from\s*'react-leaflet'/);
  assert.doesNotMatch(mapPage, /<Polyline/);

  // Punti individuali CircleMarker per altri operatori e per traccia propria
  assert.match(mapPage, /key=\{`group-dot-\$\{g\.sessionId\}-\$\{idx\}`\}/);
  assert.match(mapPage, /key=\{`own-dot-\$\{idx\}`\}/);

  // Tooltip permanente sull'ultimo punto compagni per visibilità immediata su mappa
  assert.match(mapPage, /<Tooltip permanent direction="top" offset=\{\[0, -8\]\}>\{g\.label\}\{g\.statusLabel \? ` · \$\{g\.statusLabel\}` : ''\}<\/Tooltip>/);
  // Tooltip permanente "Tu sei qui" per posizione propria / ultimo punto
  assert.match(mapPage, /<Tooltip permanent direction="top" offset=\{\[0, -8\]\}>Tu sei qui<\/Tooltip>/);

  // Legenda con formato "OP 2 — non ancora avviato"
  assert.match(mapPage, /g\.status === 'not_started'\s*\?\s*\(\s*<span>\{g\.label\} — non ancora avviato<\/span>/);
});

test('Live DB: RPC get_driver_group_tracking restituisce compagni di gruppo non avviati e avviati', async () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mqkelrsvksrzrpmbstvd.supabase.co';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return; // skip if no supabase environment present
  const supabase = createClient(url, key);

  const caposquadraAssignment = '4ccda2cf-6997-4a0f-8ae0-dbdda43c96fb';
  const caposquadraToken = '1890c4829a649a9d3bb7f5b5db4d330bc2536d78c56bf49ebbf11f30ac7822aa';

  const { data, error } = await supabase.rpc('get_driver_group_tracking', {
    p_assignment_id: caposquadraAssignment,
    p_access_token: caposquadraToken,
  });

  assert.equal(error, null, 'RPC call must succeed');
  assert.ok(Array.isArray(data?.sessions), 'sessions must be array');
  assert.ok(data.sessions.length >= 2, 'must return at least self and other participants');

  const self = data.sessions.find(s => s.is_self);
  assert.ok(self, 'must have self');
  assert.equal(self.display_label, 'Tu');

  const others = data.sessions.filter(s => !s.is_self);
  assert.ok(others.length > 0, 'others must contain other group operators');

  const op1 = others.find(o => o.display_label === 'OP 1');
  assert.ok(op1, 'others must include OP 1');
  assert.equal(op1.status, 'started', 'OP 1 is started with active session');
  const op1Points = (data.points || []).filter(p => p.session_id === op1.id);
  assert.ok(op1Points.length > 0, 'OP 1 must have GPS points in data.points');

  const op2 = others.find(o => o.display_label === 'OP 2');
  assert.ok(op2, 'others must include OP 2');
  assert.equal(op2.status, 'not_started', 'OP 2 is not yet started');
});
