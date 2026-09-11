import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const LANDING = read('src/pages/public/SupplierLandingPage.jsx');
const DASHBOARD = read('src/pages/supplier/SupplierDashboard.jsx');
const RESOLUTION = read('src/app/routeResolution.js');
const PUBLICROUTES = read('src/app/PublicRoutes.jsx');
const APPROUTER = read('src/app/AppRouter.jsx');
const NAVBAR = read('src/layouts/public/Navbar.jsx');
const FOOTER = read('src/components/home/Footer.jsx');
const HEROMAP = read('src/components/home/VolantiniProHeroMap.jsx');
const GUARD = read('src/auth/guards/SupplierGuard.jsx');

test('supplier landing — route resolution maps /lavora-con-noi and aliases to supplier-landing', () => {
  assert.match(RESOLUTION, /p === '\/lavora-con-noi'[\s\S]{0,250}return 'supplier-landing'/);
  assert.match(RESOLUTION, /p === '\/fornitori'/);
  assert.match(RESOLUTION, /p === '\/supplier\/landing'/);
  assert.match(RESOLUTION, /p === '\/supplier\/registrazione'/);
});

test('supplier landing — PublicRoutes renders SupplierLandingPage', () => {
  assert.match(PUBLICROUTES, /SupplierLandingPage/);
  assert.match(PUBLICROUTES, /page === "supplier-landing"[\s\S]{0,40}SupplierLandingPage/);
});

test('supplier landing — AppRouter maps supplier-landing to /lavora-con-noi', () => {
  assert.match(APPROUTER, /"supplier-landing":\s*"\/lavora-con-noi"/);
  assert.match(APPROUTER, /"lavora-con-noi":\s*"\/lavora-con-noi"/);
});

test('supplier landing — Content and CTAs', () => {
  assert.match(LANDING, /Lavora con noi/i);
  assert.match(LANDING, /Entra nella rete dei fornitori VolantiniPro/i);
  assert.match(LANDING, /Registrati come fornitore/i);
  assert.match(LANDING, /Accedi alla Bacheca/i);
  assert.match(LANDING, /login\?context=supplier/i);
  assert.match(LANDING, /Ragione Sociale/i);
  assert.match(LANDING, /Nome e Cognome Referente/i);
  assert.match(LANDING, /Telefono/i);
  assert.match(LANDING, /Email Aziendale/i);
  assert.match(LANDING, /Partita IVA/i);
  assert.match(LANDING, /Città e Province Servite/i);
  assert.match(LANDING, /Servizi di Distribuzione Offerti/i);
  assert.match(LANDING, /Note aggiuntive/i);
});

test('supplier landing — Unauthenticated magic link registration flow and state persistence', () => {
  assert.match(LANDING, /vp_pending_supplier_application/);
  assert.match(LANDING, /rememberPendingAuthContext\("supplier"\)/);
  assert.match(LANDING, /auth\.signInWithOtp/);
});

test('supplier dashboard — Profile header renders company name, contact, phone, email, status', () => {
  assert.match(DASHBOARD, /Profilo Fornitore/);
  assert.match(DASHBOARD, /profile\.company_name/);
  assert.match(DASHBOARD, /profile\.contact_name/);
  assert.match(DASHBOARD, /profile\.phone/);
  assert.match(DASHBOARD, /profile\.email/);
  assert.match(DASHBOARD, /profile\.vat_number/);
  assert.match(DASHBOARD, /profile\.coverage_areas/);
  assert.match(DASHBOARD, /profile\.services/);
  assert.match(DASHBOARD, /Approvato/);
  assert.match(DASHBOARD, /In verifica/);
  assert.match(DASHBOARD, /Richieste disponibili/);
  assert.match(DASHBOARD, /I miei preventivi/);
  assert.match(DASHBOARD, /Lavori assegnati/);
});

test('navigation — Navbar, Footer, Hero link to lavora-con-noi and supplier login', () => {
  assert.match(NAVBAR, /go\("supplier-landing"\)/);
  assert.match(NAVBAR, /go\("login\?context=supplier"\)/);
  assert.match(HEROMAP, /\/lavora-con-noi/);
  assert.match(HEROMAP, /\/login\?context=supplier/);
  assert.match(FOOTER, /\["Lavora con noi",\s*"lavora-con-noi"\]/);
});

test('supplier guard — Protects direct access to /supplier-dashboard', () => {
  assert.match(GUARD, /login\?context=supplier/);
  assert.match(GUARD, /supplier_profiles/);
  assert.match(GUARD, /SupplierApplyForm/);
});
