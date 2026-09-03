// Navbar cliente/fornitore — chiarezza: niente "Accedi" generico, voci
// esplicite "Area Cliente" + "Lavora con noi", su entrambe le nav
// (Navbar.jsx pagine interne + VolantiniProHeroMap.jsx homepage).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const NAVBAR = read("src/layouts/public/Navbar.jsx");
const HERO = read("src/components/home/VolantiniProHeroMap.jsx");

for (const [name, src] of [["Navbar.jsx", NAVBAR], ["VolantiniProHeroMap.jsx", HERO]]) {
  test(`${name}: nessun "Accedi" generico, nessuna voce "Area Fornitore"`, () => {
    assert.doesNotMatch(src, /<span>Accedi<\/span>/);
    assert.doesNotMatch(src, />\s*Accedi\s*</);
    assert.doesNotMatch(src, /Area Fornitore/);
    // lo state generico accessOpen è stato sostituito da workOpen
    assert.doesNotMatch(src, /accessOpen/);
    assert.match(src, /workOpen/);
  });

  test(`${name}: voce "Area Cliente" visibile che porta al login/area cliente esistente`, () => {
    assert.match(src, />\s*Area Cliente\s*</);
    if (name === "Navbar.jsx") {
      // route interna esistente: login (o dashboard se sessione), nessun nuovo auth
      assert.match(src, /go\(hasSession \? "dashboard" : "login"\)/);
    } else {
      // hero: usa la prop onLogin già passata da HomePage (-> n("login"))
      assert.match(src, /onClick=\{\(\) => onLogin\?\.\(\)\}/);
    }
  });

  test(`${name}: voce "Lavora con noi" -> "Diventa fornitore" + "Sei già fornitore? Accedi", route supplier esistente`, () => {
    assert.match(src, />\s*<span>Lavora con noi<\/span>/);
    assert.match(src, /Diventa fornitore/);
    assert.match(src, /Sei già fornitore\? Accedi/);
    // riuso route supplier esistente, nessun nuovo sistema auth
    if (name === "Navbar.jsx") {
      const supplierHits = src.match(/go\("supplier-dashboard"\)/g) || [];
      assert.ok(supplierHits.length >= 2, `attesi >=2 rimandi supplier (desktop+mobile), trovati ${supplierHits.length}`);
    } else {
      const supplierHits = src.match(/window\.location\.href = "\/supplier"/g) || [];
      assert.ok(supplierHits.length >= 2, `attesi >=2 rimandi /supplier (desktop+mobile), trovati ${supplierHits.length}`);
    }
  });

  test(`${name}: "Contatti" -> #contatti mantenuto; CTA "Configura la tua campagna" presente`, () => {
    assert.match(src, /scrollToSection\("contatti"\)/);
    assert.match(src, /Configura la tua campagna/);
  });
}

test("Navbar.jsx mobile: ordine prioritario Configura -> Area Cliente -> Contatti -> Lavora con noi", () => {
  const m = NAVBAR.slice(NAVBAR.indexOf("isMobile && menuOpen"));
  const iCta = m.indexOf("Configura la tua campagna");
  const iCliente = m.indexOf("Area Cliente");
  const iContatti = m.indexOf('scrollToSection("contatti")');
  const iWork = m.indexOf("<span>Lavora con noi</span>");
  assert.ok(iCta >= 0 && iCliente > iCta && iContatti > iCliente && iWork > iContatti,
    `ordine mobile Navbar errato: cta=${iCta} cliente=${iCliente} contatti=${iContatti} work=${iWork}`);
});

test("VolantiniProHeroMap mobile: ordine Configura -> Area Cliente -> Contatti -> Lavora con noi", () => {
  const m = HERO.slice(HERO.indexOf("mobileMenuStyle}"));
  const iCta = m.indexOf("Configura la tua campagna");
  const iCliente = m.indexOf(">Area Cliente<");
  const iContatti = m.indexOf('scrollToSection("contatti")');
  const iWork = m.indexOf("<span>Lavora con noi</span>");
  assert.ok(iCta >= 0 && iCliente > iCta && iContatti > iCliente && iWork > iContatti,
    `ordine mobile Hero errato: cta=${iCta} cliente=${iCliente} contatti=${iContatti} work=${iWork}`);
});

test("Navbar.jsx desktop: ordine gruppo link -> Contatti prima di Lavora con noi; Area Cliente prima della CTA arancione", () => {
  const iContatti = NAVBAR.indexOf('scrollToSection("contatti")');
  const iWork = NAVBAR.indexOf("<span>Lavora con noi</span>");
  const iCliente = NAVBAR.indexOf('go(hasSession ? "dashboard" : "login")');
  const iCta = NAVBAR.indexOf('className="vb" onClick={() => go("step1")}');
  assert.ok(iContatti < iWork, "Contatti deve precedere Lavora con noi");
  assert.ok(iWork < iCliente, "Lavora con noi (gruppo link) deve precedere Area Cliente (gruppo destro)");
  assert.ok(iCliente < iCta, "Area Cliente deve precedere la CTA arancione");
});

test("nessun nuovo sistema auth: solo route esistenti (login / dashboard / supplier-dashboard / /supplier)", () => {
  for (const src of [NAVBAR, HERO]) {
    // niente signup/register/nuovi endpoint auth introdotti in queste nav
    assert.doesNotMatch(src, /signInWith|createUser|signUp|\/register|auth\/v1/);
  }
});
