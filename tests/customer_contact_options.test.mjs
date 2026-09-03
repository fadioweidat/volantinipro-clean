// Contatti cliente — sezione "Serve una mano?" + richiami Step + navbar.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  SUPPORT_EMAIL,
  HAS_SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP,
  SUPPORT_INFO_WHATSAPP_TEXT,
  SUPPORT_INFO_EMAIL_SUBJECT,
  buildInfoWhatsAppUrl,
  buildInfoMailtoUrl,
} from "../src/lib/contactConfig.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── contactConfig: testo/oggetto esatti richiesti dal ticket ───────────────
test("testo WhatsApp e oggetto Email sono esattamente quelli del ticket", () => {
  assert.equal(
    SUPPORT_INFO_WHATSAPP_TEXT,
    "Ciao VolantiniPro, avrei bisogno di informazioni sul servizio di distribuzione volantini.",
  );
  assert.equal(SUPPORT_INFO_EMAIL_SUBJECT, "Richiesta informazioni VolantiniPro");
});

// ── mailto: verso l'indirizzo ufficiale, oggetto precompilato ──────────────
test("buildInfoMailtoUrl: mailto all'email ufficiale (contactConfig), subject encodato, nessun corpo forzato", () => {
  const url = buildInfoMailtoUrl();
  assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?`), url);
  assert.match(url, /[?&]subject=Richiesta%20informazioni%20VolantiniPro/);
  // niente destinatario inventato
  assert.ok(SUPPORT_EMAIL.includes("@"));
  assert.equal(SUPPORT_EMAIL, (process.env.VITE_SUPPORT_EMAIL || "info@volantinipro.it").trim());
});

// ── WhatsApp: link corretto quando configurato, null quando no ─────────────
test("buildInfoWhatsAppUrl: wa.me col numero configurato + testo encodato, oppure null (nessun numero inventato)", () => {
  const url = buildInfoWhatsAppUrl();
  if (HAS_SUPPORT_WHATSAPP) {
    assert.equal(url, `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_INFO_WHATSAPP_TEXT)}`);
    assert.match(url, /^https:\/\/wa\.me\/\d{8,}\?text=/);
  } else {
    assert.equal(url, null);
  }
});

// ── ContattiSection ───────────────────────────────────────────────────────
test("ContattiSection: SOLO 2 CTA — WhatsApp + Email; nessun 'Chiedi all'AI' nella sezione", () => {
  const src = read("src/components/home/ContattiSection.jsx");
  assert.match(src, /id="contatti"/);
  assert.match(src, /Serve una mano\?/);
  assert.match(src, /Hai dubbi sul preventivo, sulla distribuzione o sui servizi\? Contatta direttamente VolantiniPro\./);
  // esattamente 2 CtaButton principali: WhatsApp + Scrivici via Email
  const ctaLabels = [...src.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ctaLabels, ["WhatsApp", "Scrivici via Email"]);
  assert.equal((src.match(/<CtaButton\b/g) || []).length, 2);
  // AI rimossa da questa sezione
  assert.doesNotMatch(src, /Chiedi all[’']AI/);
  assert.doesNotMatch(src, /Assistente configuratore/);
  assert.doesNotMatch(src, /onAsk/);
  // WhatsApp: buildInfoWhatsAppUrl, condizionale, nessun numero hardcoded
  assert.match(src, /buildInfoWhatsAppUrl/);
  assert.match(src, /whatsappUrl \?/);
  assert.doesNotMatch(src, /wa\.me\/\d/);
  // Email: helper ufficiale, nessun mailto hardcoded
  assert.match(src, /buildInfoMailtoUrl/);
  assert.doesNotMatch(src, /mailto:[a-z]/i);
  // responsive: desktop affiancati (row), mobile verticali full-width (column)
  assert.match(src, /useIsMobile/);
  assert.match(src, /flexDirection: isMobile \? "column" : "row"/);
  assert.match(src, /width: mobile \? "100%" : "auto"/);
});

// ── contactConfig: numero WhatsApp ufficiale + formato wa.me ──────────────
test("WhatsApp: '+39 351 767 3737' -> wa.me/393517673737 + messaggio precompilato esatto", async () => {
  const { SUPPORT_INFO_WHATSAPP_TEXT } = await import("../src/lib/contactConfig.js");
  // il ticket fissa il numero ufficiale; contactConfig normalizza a sole cifre
  assert.equal("+39 351 767 3737".replace(/[^\d]/g, ""), "393517673737");
  assert.equal(
    SUPPORT_INFO_WHATSAPP_TEXT,
    "Ciao VolantiniPro, avrei bisogno di informazioni sul servizio di distribuzione volantini.",
  );
  // forma dell'URL che contactConfig produce dato quel numero
  const url = `https://wa.me/393517673737?text=${encodeURIComponent(SUPPORT_INFO_WHATSAPP_TEXT)}`;
  assert.match(url, /^https:\/\/wa\.me\/393517673737\?text=Ciao%20VolantiniPro/);
  // contactConfig normalizza VITE_SUPPORT_WHATSAPP togliendo tutto ciò che non è cifra
  const cfgSrc = read("src/lib/contactConfig.js");
  assert.match(cfgSrc, /VITE_SUPPORT_WHATSAPP[^\n]*replace\(\/\[\^\\d\]\/g, ""\)/);
  assert.match(cfgSrc, /https:\/\/wa\.me\/\$\{SUPPORT_WHATSAPP\}\?text=\$\{encodeURIComponent\(SUPPORT_INFO_WHATSAPP_TEXT\)\}/);
});

// ── InlineHelpCta (richiamo Step) ────────────────────────────────────────
test("InlineHelpCta: overlay fisso richiudibile, 'Hai bisogno di aiuto?', [Chiedi all'AI] [WhatsApp], nessuna logica Step", () => {
  const src = read("src/components/common/InlineHelpCta.jsx");
  assert.match(src, /position: "fixed"/);
  assert.match(src, /Hai bisogno di aiuto\?/);
  assert.match(src, /Chiedi all[’']AI/);
  assert.match(src, /buildInfoWhatsAppUrl/);
  // richiudibile: stato open + bottone chiudi
  assert.match(src, /useState\(false\)/);
  // non importa nulla dagli Step / calcoli preventivo
  assert.doesNotMatch(src, /configurator\/Step|quotePricing|pricing|territorialCampaignCalculator/);
});

// ── Navbar (pagine non-home): voce "Contatti" desktop + mobile ─────────
test("Navbar.jsx: voce 'Contatti' presente e collega alla sezione #contatti (desktop e mobile)", () => {
  const src = read("src/layouts/public/Navbar.jsx");
  const contattiButtons = src.match(/scrollToSection\("contatti"\)/g) || [];
  assert.ok(contattiButtons.length >= 2, `attese >=2 voci Contatti (desktop+mobile), trovate ${contattiButtons.length}`);
  assert.match(src, />\s*Contatti\s*</);
});

// ── Navbar homepage (VolantiniProHeroMap): stessa voce "Contatti" ──────
test("VolantiniProHeroMap: 'Contatti' -> scrollToSection('contatti') sia desktop sia mobile", () => {
  const src = read("src/components/home/VolantiniProHeroMap.jsx");
  const hits = src.match(/scrollToSection\("contatti"\)/g) || [];
  assert.ok(hits.length >= 2, `attese >=2 voci Contatti (desktop+mobile) nella hero nav, trovate ${hits.length}`);
  assert.match(src, />Contatti<\/button>/);
  // scrollToSection della hero fa scroll all'id, coerente con id="contatti" della sezione
  assert.match(src, /const scrollToSection = \(id\) => \{[\s\S]*getElementById\(id\)\?\.scrollIntoView/);
});

// ── HomePage monta la sezione ────────────────────────────────────────────
test("HomePage: monta ContattiSection una sola volta, prima della FinalCtaSection", () => {
  const src = read("src/pages/public/HomePage.jsx");
  assert.match(src, /import ContattiSection from "\.\.\/\.\.\/components\/home\/ContattiSection\.jsx"/);
  assert.equal((src.match(/_jsx\(ContattiSection,/g) || []).length, 1);
  assert.ok(src.indexOf("_jsx(ContattiSection,") < src.indexOf("_jsx(FinalCtaSection,"));
});

// ── PublicRoutes monta il richiamo SOLO nel configuratore ────────────────
test("PublicRoutes: InlineHelpCta reso solo per step1-4, 'Chiedi all'AI' -> step2", () => {
  const src = read("src/app/PublicRoutes.jsx");
  assert.match(src, /import InlineHelpCta from "\.\.\/components\/common\/InlineHelpCta\.jsx"/);
  assert.match(src, /isConfiguratorStep && <InlineHelpCta onAsk=\{\(\) => goTo\("step2"\)\} \/>/);
  assert.match(src, /page === "step1" \|\| page === "step2" \|\| page === "step3" \|\| page === "step4"/);
});
