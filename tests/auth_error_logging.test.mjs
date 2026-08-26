// FASE P1 — Auth error logging reale. Convenzione source-text/contract
// (readFileSync + assertion di presenza/ordine/assenza), stessa gia' usata
// in tests/auth_login_admin_guard.test.mjs (test finale "Admin magic-link
// session and rate-limit contract") per la stessa ragione: volantinipro-final.jsx
// e' un monolite non facilmente importabile in isolamento, e session.js/
// AdminGuard.jsx chiamano logError() che internamente richiede un vero
// client Supabase per avere un effetto osservabile — non disponibile sotto
// node:test puro. Le assertion qui verificano la presenza/assenza esatta
// delle chiamate logError() nei rami corretti, mai un mock del logger.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionSource = readFileSync(new URL("../src/auth/session.js", import.meta.url), "utf8");
const adminGuardSource = readFileSync(new URL("../src/auth/guards/AdminGuard.jsx", import.meta.url), "utf8");
const loginPageSource = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");

// LoginPage e' un componente grande con molte funzioni annidate: un regex
// lazy si fermerebbe alla prima "\n}" interna (sbagliato). Isolato invece
// tra l'inizio letterale della dichiarazione e l'inizio della prossima
// dichiarazione top-level (DashboardPage, che segue immediatamente nel
// file) — stesso approccio "ancoraggio a due marcatori noti" gia' usato
// altrove in questo progetto per isolare porzioni di file monolitici.
const loginPageStart = loginPageSource.indexOf("export function LoginPage({");
const loginPageEnd = loginPageSource.indexOf("export function DashboardPage(", loginPageStart);
assert.ok(loginPageStart > 0 && loginPageEnd > loginPageStart, "impossibile isolare LoginPage in volantinipro-final.jsx");
const loginPageFn = loginPageSource.slice(loginPageStart, loginPageEnd);

// 1. login SDK failure -> error_log
test("1. sendMagicLink(): il catch della SDK signInWithOtp chiama logError con category=auth, module='login', severity=warning", () => {
  const catchBlock = loginPageFn.match(/\} catch \(err\) \{[\s\S]*?\} finally \{/);
  assert.ok(catchBlock, "blocco catch di sendMagicLink non trovato");
  assert.match(catchBlock[0], /logError\(\{/);
  assert.match(catchBlock[0], /category:\s*ERROR_CATEGORIES\.AUTH/);
  assert.match(catchBlock[0], /module:\s*"login"/);
  assert.match(catchBlock[0], /severity:\s*ERROR_SEVERITY\.WARNING/);
  // Mai l'email nel messaggio loggato.
  assert.doesNotMatch(catchBlock[0], /message:\s*email/);
});

// 2. callback failure -> error_log
test("2. Callback magic link: restoreSupabaseSession() che ritorna null dopo un access_token valido chiama logError (module='callback', warning)", () => {
  const callbackFailBlock = loginPageFn.match(/if \(!restoredSession\) \{[\s\S]*?\n {12}\}/);
  assert.ok(callbackFailBlock, "ramo !restoredSession non trovato");
  assert.match(callbackFailBlock[0], /logError\(\{/);
  assert.match(callbackFailBlock[0], /module:\s*"callback"/);
  assert.match(callbackFailBlock[0], /severity:\s*ERROR_SEVERITY\.WARNING/);
});

// 3. session restore exception -> error_log
test("3. session.js: il catch di _restoreSupabaseSession() (eccezione reale, non 'nessuna sessione') chiama logError (module='session_restore', warning)", () => {
  const catchBlock = sessionSource.match(/\} catch \(err\) \{[\s\S]*?logError\(\{[\s\S]*?\}\);\s*\n\s*\}/);
  assert.ok(catchBlock, "blocco catch di _restoreSupabaseSession non trovato");
  assert.match(catchBlock[0], /module:\s*"session_restore"/);
  assert.match(catchBlock[0], /severity:\s*ERROR_SEVERITY\.WARNING/);
  assert.doesNotMatch(catchBlock[0], /accessToken|refreshToken|refresh_token|access_token/);
});

// 4. admin role RPC technical error -> error_log
test("4. session.js: il catch di verifySupabaseAdminRole() (eccezione di rete sull'RPC jwt_is_admin) chiama logError (module='admin_role_check', critical)", () => {
  const fnBlock = sessionSource.match(/export async function verifySupabaseAdminRole\([\s\S]*?\n\}/);
  assert.ok(fnBlock);
  const catchBlock = fnBlock[0].match(/\} catch \(err\) \{[\s\S]*?\}\s*\n\}$/);
  assert.ok(catchBlock, "blocco catch di verifySupabaseAdminRole non trovato");
  assert.match(catchBlock[0], /logError\(\{/);
  assert.match(catchBlock[0], /module:\s*"admin_role_check"/);
  assert.match(catchBlock[0], /severity:\s*ERROR_SEVERITY\.CRITICAL/);
  assert.match(catchBlock[0], /return false;/); // fail-closed invariato
  assert.doesNotMatch(catchBlock[0], /\btoken\b\s*[,)]/); // mai il token nel log
});

// 5. config auth missing -> error_log (due punti distinti: LoginPage e AdminGuard)
test("5a. sendMagicLink(): configurazione mancante chiama logError (module='login', critical) PRIMA del return", () => {
  const configBlock = loginPageFn.match(/if \(!configured\) \{[\s\S]*?\n {4}\}/);
  assert.ok(configBlock, "ramo !configured non trovato in sendMagicLink");
  assert.match(configBlock[0], /logError\(\{/);
  assert.match(configBlock[0], /module:\s*"login"/);
  assert.match(configBlock[0], /severity:\s*ERROR_SEVERITY\.CRITICAL/);
});

test("5b. AdminGuard: il ramo config_error (hasSupabaseConfig()===false) chiama logError (module='admin_guard', critical)", () => {
  const configBlock = adminGuardSource.match(/if \(!hasSupabaseConfig\(\)\) \{[\s\S]*?\n {4}\}/);
  assert.ok(configBlock, "ramo !hasSupabaseConfig() non trovato in AdminGuard");
  assert.match(configBlock[0], /logError\(\{/);
  assert.match(configBlock[0], /module:\s*"admin_guard"/);
  assert.match(configBlock[0], /severity:\s*ERROR_SEVERITY\.CRITICAL/);
  assert.match(configBlock[0], /setRoleStatus\("config_error"\)/); // comportamento invariato
});

// 6. non-admin normale -> NO error log
test("6. AdminGuard: il ramo 'denied' (autenticato ma non-admin) NON chiama mai logError", () => {
  const deniedIdx = adminGuardSource.indexOf('roleStatus === "denied"');
  assert.ok(deniedIdx > 0);
  // Nessuna chiamata logError nel corpo del componente al di FUORI del
  // singolo blocco config_error gia' verificato sopra: verifica che il
  // conteggio totale delle chiamate logError nel file sia esattamente 1
  // (solo config_error), cosi' un 'denied' o 'anonymous' aggiunto in futuro
  // che iniziasse a loggare farebbe fallire questo test.
  const logErrorCallCount = (adminGuardSource.match(/logError\(\{/g) || []).length;
  assert.equal(logErrorCallCount, 1, "AdminGuard deve chiamare logError SOLO nel ramo config_error");
});

test("6b. verifySupabaseAdminRole(): il ramo '!res.ok' (RPC ha risposto ma nega, es. token scaduto) NON chiama mai logError — solo l'eccezione la chiama", () => {
  const fnBlock = sessionSource.match(/export async function verifySupabaseAdminRole\([\s\S]*?\n\}/)[0];
  const okCheckBlock = fnBlock.match(/if \(!res\.ok\) return false;/);
  assert.ok(okCheckBlock);
  // Il conteggio totale di logError nella funzione deve essere 1 (solo nel
  // catch, gia' verificato dal test 4): la riga "if (!res.ok) return false;"
  // non ne contiene nessuna.
  const logErrorCallCount = (fnBlock.match(/logError\(\{/g) || []).length;
  assert.equal(logErrorCallCount, 1);
});

// 7. sessione assente normale -> NO error log
test("7. session.js: i rami 'nessuna sessione salvata' (return null senza eccezione) non chiamano mai logError — solo il catch (test 3) lo fa", () => {
  const fnBlock = sessionSource.match(/async function _restoreSupabaseSession\([\s\S]*?\n\}/)[0];
  const logErrorCallCount = (fnBlock.match(/logError\(\{/g) || []).length;
  assert.equal(logErrorCallCount, 1, "_restoreSupabaseSession deve chiamare logError SOLO nel catch");
});

test("7b. LoginPage: il caricamento normale (nessun hash, nessun errore, admin gia' loggato o meno) non chiama mai logError fuori dai 3 rami di fallimento reale gia' verificati", () => {
  const logErrorCallCount = (loginPageFn.match(/logError\(\{/g) || []).length;
  assert.equal(logErrorCallCount, 3, "LoginPage deve chiamare logError esattamente 3 volte: callback fail, config mancante, SDK fail");
});

// 8. token/email/JWT mai persistiti (nel senso di questa fase: mai LOGGATI)
test("8. Nessuna delle nuove chiamate logError in session.js/AdminGuard.jsx/LoginPage INTERPOLA (template literal, mai una stringa statica descrittiva) email/token/JWT reali", () => {
  // "access_token"/"email" come PAROLA in un messaggio statico (es. "...con
  // access_token valido") e' testo descrittivo per un umano, non un valore
  // reale — quello che conta e' che nessuna interpolazione ${...} porti
  // dentro il valore vero di un token/email/JWT dalla sessione/variabile.
  for (const [name, source] of [["session.js", sessionSource], ["AdminGuard.jsx", adminGuardSource], ["LoginPage", loginPageFn]]) {
    const logCalls = source.match(/logError\(\{[\s\S]*?\}\);/g) || [];
    for (const call of logCalls) {
      const interpolations = call.match(/\$\{[^}]*\}/g) || [];
      for (const interp of interpolations) {
        assert.doesNotMatch(interp, /email/i, `${name}: una chiamata logError interpola 'email' in un template literal`);
        assert.doesNotMatch(interp, /accessToken|access_token/i, `${name}: una chiamata logError interpola l'access token`);
        assert.doesNotMatch(interp, /refreshToken|refresh_token/i, `${name}: una chiamata logError interpola il refresh token`);
      }
      assert.doesNotMatch(call, /eyJ[a-zA-Z0-9_-]{10,}\./, `${name}: una chiamata logError contiene un JWT grezzo`);
    }
  }
});

// 9. fail-closed admin invariato
test("9. verifySupabaseAdminRole() resta fail-closed: ogni ramo che non e' 'result === true' ritorna false, invariato dalla fase precedente", () => {
  const fnBlock = sessionSource.match(/export async function verifySupabaseAdminRole\([\s\S]*?\n\}/)[0];
  assert.match(fnBlock, /if \(!url \|\| !anonKey \|\| !token\) return false;/);
  assert.match(fnBlock, /if \(!res\.ok\) return false;/);
  assert.match(fnBlock, /return result === true;/);
  assert.match(fnBlock, /return false;\s*\n\s*\}\s*\n\}$/); // fallback finale nel catch
});

test("9b. AdminGuard: nessun ramo diverso da 'admin' (jwt_is_admin=true confermato) renderizza mai i children", () => {
  const returnChildrenIdx = adminGuardSource.indexOf("children({ session, role");
  assert.ok(returnChildrenIdx > 0);
  const beforeReturn = adminGuardSource.slice(0, returnChildrenIdx);
  // Tutti i return anticipati (anonymous/checking/config_error/denied)
  // precedono la riga che espone i children, invariato dalla fase
  // fail-closed precedente.
  assert.match(beforeReturn, /if \(roleStatus === "anonymous"\) return null;/);
  assert.match(beforeReturn, /if \(roleStatus === "config_error"\)/);
  assert.match(beforeReturn, /if \(roleStatus === "denied"\)/);
});

// 10. redirect invariati
test("10. Nessuna delle modifiche di questa fase tocca onNav/redirect: le stesse chiamate onNav('login'/'admin'/'dashboard'/'step4') restano presenti e nella stessa forma", () => {
  assert.match(loginPageSource, /onNav\("admin"\)/);
  assert.match(loginPageSource, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\)/);
  assert.match(adminGuardSource, /onNav\?\.\("login", \{ context: "admin" \}\)/);
});
