/**
 * tests/customer_guard_fail_closed.test.mjs
 *
 * P2 — CustomerGuard.jsx rendered `children` unconditionally forever, even
 * after its own effect determined there was no session and no magic-link
 * token to consume (the effect only called onNav('login'), it never hid
 * anything). An anonymous visitor hitting a client route directly could
 * keep seeing the protected page shell/content for as long as it took the
 * router elsewhere to react to that navigation call.
 *
 * Fix scope, deliberately narrow: the FIRST render still always mounts
 * children unconditionally — this is load-bearing, not incidental. React
 * runs child effects before the parent's, and it is the CHILD (e.g.
 * DashboardPage) that consumes a magic-link hash and persists the session
 * in its own mount effect; blocking the first render would mean that
 * effect never runs and magic-link login (and any other flow where a
 * child establishes the session on mount) breaks entirely. This exact
 * scenario is asserted by
 * "non reindirizza se un figlio salva la sessione nel proprio effect di
 * mount" in tests/auth_login_admin_guard.test.mjs, which must keep
 * passing unchanged.
 *
 * What changes: once CustomerGuard's OWN effect (which runs after the
 * child's) determines there is genuinely no session and no token, it now
 * hides children (`confirmed = false` -> render null) in the same
 * pass, instead of leaving them mounted indefinitely while onNav('login')
 * is left to take effect elsewhere. This closes the anonymous-flash
 * window to the minimum possible (one render+effect cycle) without
 * touching the child-establishes-session-on-mount race at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/auth/guards/CustomerGuard.jsx', import.meta.url), 'utf8');

test('il primo render monta sempre i children (invariato — necessario per la race del magic link)', () => {
  assert.match(SRC, /const \[confirmed, setConfirmed\] = useState\(true\);/, 'il valore iniziale deve restare true: bloccare il primo render romperebbe la race protetta da auth_login_admin_guard.test.mjs');
});

test('se il proprio effect trova ne\' sessione ne\' token, nasconde i children insieme al redirect (non li lascia visibili a tempo indeterminato)', () => {
  const effectStart = SRC.indexOf('useEffect(() => {');
  const effectEnd = SRC.indexOf('}, [session, onNav]);');
  const effect = SRC.slice(effectStart, effectEnd);
  assert.match(effect, /if \(hasSupabaseConfig\(\) && !currentSession && !accessToken\) \{/);
  assert.match(effect, /setConfirmed\(false\);\s*\n\s*onNav\("login"\);\s*\n\s*return;/, 'confirmed deve passare a false PRIMA/insieme al redirect, non restare true');
});

test('se una sessione o un token vengono trovati, confirmed resta/torna true (nessuna regressione per il caso comune)', () => {
  const effectStart = SRC.indexOf('useEffect(() => {');
  const effectEnd = SRC.indexOf('}, [session, onNav]);');
  const effect = SRC.slice(effectStart, effectEnd);
  assert.match(effect, /setConfirmed\(true\);\s*\n\}, \[session, onNav\]\);|setConfirmed\(true\);\s*$/m);
});

test('il render e\' condizionato su confirmed: null quando non confermato, children altrimenti', () => {
  assert.match(SRC, /if \(!confirmed\) return null;/);
  assert.match(SRC, /return <>\{children\}<\/>;/);
});

test('login semantics invariate: stessa condizione di redirect (hasSupabaseConfig && !currentSession && !accessToken), stesso target onNav("login")', () => {
  assert.match(SRC, /onNav\("login"\)/);
  assert.match(SRC, /getStoredSupabaseSession\(\)/);
});
