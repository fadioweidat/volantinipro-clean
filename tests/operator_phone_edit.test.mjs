// Modifica telefono operatore dalla schermata Admin "Assegna lavoro" (Step 1).
//
// Il telefono operatore vive su public.profiles.phone (operator_profiles NON
// ha colonna phone), join operator_profiles.user_id = profiles.id — la stessa
// fonte di admin_list_operators. Nessuna policy RLS permette a un
// authenticated di aggiornare la riga profiles di un altro utente, quindi la
// scrittura passa SOLO dalla RPC SECURITY DEFINER admin-only
// admin_set_operator_phone.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizePhone, isValidPhone, phoneDigits, PHONE_INPUT_PLACEHOLDER } from "../src/lib/phoneNumber.js";

const MIGRATION = readFileSync(new URL("../supabase/migrations/20260827120000_admin_set_operator_phone.sql", import.meta.url), "utf8");
const ADMIN_API = readFileSync(new URL("../src/lib/services/admin-api.js", import.meta.url), "utf8");
const ASSIGN_WORK = readFileSync(new URL("../src/pages/admin/AssignWork.jsx", import.meta.url), "utf8");
const STEP1 = readFileSync(new URL("../src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx", import.meta.url), "utf8");

// --- validazione / normalizzazione numero -----------------------------------

test("numeri internazionali validi accettati", () => {
  for (const ok of ["+393331234567", "+39 333 123 4567", "3331234567", "+1 (202) 555-0173", "0039 333 1234567"]) {
    assert.equal(isValidPhone(ok), true, `atteso valido: ${ok}`);
  }
});

test("stringa vuota = rimozione consentita (profiles.phone nullable)", () => {
  assert.equal(isValidPhone(""), true);
  assert.equal(isValidPhone("   "), true);
  assert.equal(normalizePhone("   "), "");
});

test("input non valido rifiutato: stringa casuale, troppo corto, caratteri non telefonici", () => {
  for (const bad of ["abc", "not a phone", "12345", "+39", "333-12", "☎️1234567", "333 1234 567 <script>"]) {
    assert.equal(isValidPhone(bad), false, `atteso NON valido: ${bad}`);
  }
});

test("normalizePhone fa trim + collassa spazi interni, non altro", () => {
  assert.equal(normalizePhone("  +39  333   123 4567 "), "+39 333 123 4567");
  assert.equal(phoneDigits("+39 333 123 4567"), "393331234567");
});

test("placeholder esportato per la UI", () => {
  assert.match(PHONE_INPUT_PLACEHOLDER, /\+39/);
});

// --- migration: RPC admin-only SECURITY DEFINER ---------------------------

test("migration: admin_set_operator_phone e' SECURITY DEFINER con search_path e guard admin", () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION "public"\."admin_set_operator_phone"\("p_operator_id" "uuid", "p_phone" "text"\)/);
  assert.match(MIGRATION, /LANGUAGE "plpgsql" SECURITY DEFINER/);
  assert.match(MIGRATION, /SET "search_path" TO 'public', 'pg_temp'/);
  assert.match(MIGRATION, /if not public\.jwt_is_admin\(\) then\s*raise exception 'Accesso negato: richiesto ruolo admin\.'\s*using errcode = '42501'/);
});

test("migration: aggiorna profiles.phone via operator_profiles.user_id = profiles.id, mai operator_profiles.phone", () => {
  assert.match(MIGRATION, /update public\.profiles\s*\n\s*set phone = v_norm/);
  assert.match(MIGRATION, /public\.operator_profiles op\s*\n\s*join public\.profiles p on p\.id = op\.user_id/);
  // nessuna colonna phone su operator_profiles: nessun riferimento SQL op.phone / operator_profiles.phone
  assert.doesNotMatch(MIGRATION, /\bop\.phone\b/);
  assert.doesNotMatch(MIGRATION, /operator_profiles\.phone/);
});

test("migration: vuoto/whitespace -> NULL; validazione server-side sui caratteri e sul numero di cifre", () => {
  assert.match(MIGRATION, /v_norm := nullif\(btrim\(regexp_replace\(coalesce\(p_phone, ''\), '\\s\+', ' ', 'g'\)\), ''\)/);
  assert.match(MIGRATION, /raise exception 'Numero di telefono non valido\.'/);
  assert.match(MIGRATION, /\[0-9\]\{8,15\}/);
});

test("migration: EXECUTE solo authenticated + service_role, mai anon/PUBLIC", () => {
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION "public"\."admin_set_operator_phone"[^;]*FROM PUBLIC/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION "public"\."admin_set_operator_phone"[^;]*FROM "anon"/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION "public"\."admin_set_operator_phone"[^;]*TO "authenticated"/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION "public"\."admin_set_operator_phone"[^;]*TO "service_role"/);
  assert.doesNotMatch(MIGRATION, /GRANT EXECUTE ON FUNCTION "public"\."admin_set_operator_phone"[^;]*TO "anon"/);
});

// --- admin-api: unico percorso di scrittura ----------------------------

test("adminSetOperatorPhone chiama la RPC admin_set_operator_phone e mappa ''-> null", () => {
  const fn = ADMIN_API.slice(ADMIN_API.indexOf("export async function adminSetOperatorPhone"), ADMIN_API.indexOf("export async function adminSetOperatorPhone") + 900);
  assert.match(fn, /supabase\.rpc\('admin_set_operator_phone',\s*\{\s*p_operator_id:\s*operatorId,\s*p_phone:\s*phone == null \|\| phone === ''\s*\?\s*null\s*:\s*phone/);
  assert.match(fn, /isValidUuid\(operatorId\)/, "valida l'uuid operatore");
  assert.match(fn, /ensureSupabaseSessionBridge\(\)/);
});

test("nessuna scrittura diretta su profiles.phone dal frontend (solo la RPC)", () => {
  // niente .from('profiles').update({ phone ... }) da nessuna parte in admin-api.
  assert.doesNotMatch(ADMIN_API, /from\(['"]profiles['"]\)[\s\S]{0,120}update\([\s\S]{0,80}phone/i);
});

// --- UI: display + edit inline, aggiornamento senza reload -----------

test("Step 1: telefono mostrato, oppure 'Telefono non inserito' quando assente", () => {
  assert.match(STEP1, /\{op\.phone \|\| 'Telefono non inserito'\} · \{op\.status\}/);
});

test("Step 1: affordance 'Modifica telefono' che apre l'edit inline", () => {
  assert.match(STEP1, /✏️ Modifica telefono/);
  assert.match(STEP1, /onClick=\{\(\) => onStartEditPhone\(op\)\}/);
  // l'edit compare quando phoneEditId === op.id
  assert.match(STEP1, /phoneEditId === op\.id \?/);
});

test("Step 1: form di edit con input precompilato, placeholder, Salva e Annulla", () => {
  assert.match(STEP1, /value=\{phoneDraft\}/);
  assert.match(STEP1, /placeholder=\{phonePlaceholder\}/);
  assert.match(STEP1, /onChange=\{\(event\) => setPhoneDraft\(event\.target\.value\)\}/);
  // pulsante Salva
  assert.match(STEP1, /onClick=\{\(\) => onSaveOperatorPhone\(op\.id\)\}/);
  assert.match(STEP1, /\{phoneSaving \? 'Salvataggio…' : 'Salva'\}/);
  // pulsante Annulla
  assert.match(STEP1, /onClick=\{onCancelEditPhone\}/);
  assert.match(STEP1, />\s*Annulla\s*</);
  assert.match(STEP1, /\{phoneError &&/);
});

test("Step 1: l'input di edit NON e' annidato dentro il <button> della card", () => {
  // la card <button onClick=setSelectedOperatorId> si chiude prima del blocco phoneEditId
  const cardClose = STEP1.indexOf("setSelectedOperatorId(op.id)}");
  const cardButtonEnd = STEP1.indexOf("</button>", cardClose);
  const editBlock = STEP1.indexOf("phoneEditId === op.id ?");
  assert.ok(cardButtonEnd > 0 && editBlock > cardButtonEnd, "il form di edit deve stare fuori dalla card <button>");
});

test("AssignWork: salvataggio aggiorna operators in memoria (UI senza reload) e Annulla non chiama la RPC", () => {
  const save = ASSIGN_WORK.slice(ASSIGN_WORK.indexOf("const saveOperatorPhone"), ASSIGN_WORK.indexOf("const saveOperatorPhone") + 900);
  assert.match(save, /if \(!isValidPhone\(next\)\)/, "valida prima di chiamare la RPC");
  assert.match(save, /await adminSetOperatorPhone\(operatorId, next\)/);
  assert.match(save, /setOperators\(prev => prev\.map\(op => \(/, "aggiorna lo stato locale, nessun reload");
  const cancel = ASSIGN_WORK.slice(ASSIGN_WORK.indexOf("const cancelEditPhone"), ASSIGN_WORK.indexOf("const cancelEditPhone") + 300);
  assert.doesNotMatch(cancel, /adminSetOperatorPhone/, "Annulla non deve chiamare la RPC");
});

// --- WhatsApp usa il numero aggiornato, link Driver invariato --------

test("WhatsApp: handleWhatsApp legge selectedOperator.phone (da operators, aggiornato in loco)", () => {
  assert.match(ASSIGN_WORK, /function handleWhatsApp\(\)\s*\{\s*const phone = selectedOperator\?\.phone/);
  assert.match(ASSIGN_WORK, /const selectedOperator = operators\.find\(op => op\.id === selectedOperatorId\)/);
  assert.match(ASSIGN_WORK, /window\.open\(`https:\/\/wa\.me\/\$\{phone\}/);
});

test("link Driver invariato: nessuna modifica al formato /driver/assignment/ e a generateDriverAssignmentLink", () => {
  // AssignWork usa ancora generateDriverAssignmentLink per il link driver...
  assert.match(ASSIGN_WORK, /generateDriverAssignmentLink/);
  // ...e questo file non introduce URL /driver/assignment/ diversi.
  assert.doesNotMatch(ASSIGN_WORK, /\/driver\/assignment\/[^`'"]*\?/,
    "nessun nuovo formato di driver link con query string");
  const adminApiLink = ADMIN_API.slice(ADMIN_API.indexOf("export function generateDriverAssignmentLink"), ADMIN_API.indexOf("export function generateDriverAssignmentLink") + 300);
  assert.match(adminApiLink, /getPublicAppUrl\(\)\}\/driver\/assignment\/\$\{assignmentId\}/);
});
