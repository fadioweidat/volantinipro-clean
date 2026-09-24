import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const pagePath = path.resolve('src/pages/driver/DriverAssignmentPage.jsx');
const pageCode = fs.readFileSync(pagePath, 'utf8');

test('DriverAssignmentPage: presenza CTA primaria "Apri link operatore" e secondaria "Copia link"', () => {
  // CTA primaria: link reale browser con href={link}
  assert.match(pageCode, /<a\s+href=\{link\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(pageCode, /Apri link operatore/);

  // CTA secondaria: pulsante copia
  assert.match(pageCode, /<button[^>]*onClick=\{copy\}/);
  assert.match(pageCode, /\{copied \? 'Copiato!' : 'Copia link'\}/);

  // Dimensioni touch-friendly su mobile (minHeight 52px)
  assert.match(pageCode, /minHeight:\s*52/);
  assert.match(pageCode, /background:\s*'#2ECC8A'/); // Pulsante primario verde smeraldo evidente
});

test('DriverAssignmentPage: caricamento automatico idempotente all mount (senza rigenerare token)', () => {
  assert.match(pageCode, /if\s*\(assignmentId\s*&&\s*accessToken\)\s*\{\s*request\(\);/);
});

test('Live DB RPC: driver_get_or_create_group_access_link è idempotente e restituisce lo stesso token', async () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mqkelrsvksrzrpmbstvd.supabase.co';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return; // skip if no supabase environment present
  const supabase = createClient(url, key);

  const caposquadraAssignment = '4ccda2cf-6997-4a0f-8ae0-dbdda43c96fb';
  const caposquadraToken = '1890c4829a649a9d3bb7f5b5db4d330bc2536d78c56bf49ebbf11f30ac7822aa';

  // Chiamata 1
  const { data: res1, error: err1 } = await supabase.rpc('driver_get_or_create_group_access_link', {
    p_assignment_id: caposquadraAssignment,
    p_access_token: caposquadraToken,
  });

  assert.equal(err1, null, 'Chiamata 1 deve avere successo');
  assert.ok(res1?.token, 'Token deve essere presente');
  const token1 = res1.token;

  // Chiamata 2 (simula refresh o seconda richiesta)
  const { data: res2, error: err2 } = await supabase.rpc('driver_get_or_create_group_access_link', {
    p_assignment_id: caposquadraAssignment,
    p_access_token: caposquadraToken,
  });

  assert.equal(err2, null, 'Chiamata 2 deve avere successo');
  assert.equal(res2?.token, token1, 'Il token DEVE essere identico (nessuna rigenerazione)');
  assert.equal(res2?.created, false, 'Non deve creare un nuovo record (created = false)');
});
