import React from "react";
import { C, F } from "../../lib/constants.js";
import { NavButton } from "../../components/NavButton.jsx";
import Button from "../../components/ui/Button.jsx";
import { milanoLandingContent as content } from "../../lib/seo/milanoLandingContent.js";

// TICKET — SEO LOCAL PAGE PILOTA MILANO: unica pagina locale pilota
// (/distribuzione-volantini-milano), stesso meccanismo di route reale delle
// pagine servizio (src/pages/public/ServicePages.jsx) e stesso design system
// (navy/orange, Navbar/Footer riusati da AppRouter.jsx). Contenuto in
// src/lib/seo/milanoLandingContent.js, condiviso con SeoMeta.jsx per il
// JSON-LD — nessun testo duplicato o inventato (vedi vincoli nel file).

const SERVICE_LINKS = [
  { key: "service-door-to-door", label: "Door to Door" },
  { key: "service-hand-to-hand", label: "Hand to Hand" },
  { key: "service-business", label: "Business" },
];

function goToHowItWorks(onNav) {
  onNav("home");
  setTimeout(() => {
    document.getElementById("come-funziona")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

function goToContatti(onNav) {
  onNav("home");
  setTimeout(() => {
    document.getElementById("contatti")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

export function MilanoLandingPage({ onNav }) {
  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12 }}>
          Distribuzione volantini locale
        </div>
        <h1 style={{ fontFamily: F.serif, fontSize: "clamp(30px, 4.2vw, 42px)", color: C.white, letterSpacing: "-1px", lineHeight: 1.1, marginBottom: 14 }}>
          {content.h1}
        </h1>
        <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.62)", lineHeight: 1.65, maxWidth: 680, marginBottom: 24 }}>
          {content.intro}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          <Button variant="primary" onClick={() => onNav("preventivo")}>{content.ctaLabel}</Button>
          <Button variant="secondary" onClick={() => onNav("consultant")}>Parla con noi</Button>
        </div>

        {/* Sezioni H2 con contenuto reale */}
        {content.sections.map((section) => (
          <section key={section.h2} style={{ marginBottom: 34 }}>
            <h2 style={{ fontFamily: F.serif, fontSize: 22, color: C.white, marginBottom: 10, letterSpacing: "-.02em" }}>
              {section.h2}
            </h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.7, marginBottom: 10 }}>
                {p}
              </p>
            ))}

            {/* Sezione "Come distribuiamo a Milano": 3 card servizio con link reale */}
            {section.services && (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {section.services.map((s) => (
                  <div key={s.pageKey} style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 6 }}>{s.title}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.6, marginBottom: 10 }}>{s.text}</div>
                    <Button variant="ghost" onClick={() => onNav(s.pageKey)} style={{ color: C.orange, fontSize: 13, padding: 0 }}>
                      Scopri {s.title} →
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {section.bullets && (
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {section.bullets.map((b) => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: F.sans, fontSize: 13.5, color: "rgba(255,255,255,.75)", fontWeight: 500 }}>
                    <span style={{ color: C.orange, fontWeight: 900, fontSize: 12 }}>✓</span>
                    {b}
                  </div>
                ))}
              </div>
            )}

            {section.priceCta && (
              <Button variant="primary" onClick={() => onNav("preventivo")} style={{ marginTop: 10 }}>
                {section.priceCta}
              </Button>
            )}
          </section>
        ))}

        {/* FAQ brevi e reali — visibili senza interazione, per crawler/AI search */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: F.serif, fontSize: 22, color: C.white, marginBottom: 14, letterSpacing: "-.02em" }}>
            Domande frequenti
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {content.faqs.map((faq) => (
              <div key={faq.q} style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, color: C.white, marginBottom: 6 }}>{faq.q}</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.6 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA finale */}
        <div style={{ padding: 22, borderRadius: 14, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.25)", marginBottom: 34, textAlign: "center" }}>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.75)", marginBottom: 14 }}>
            Configura la tua campagna a Milano e ricevi un preventivo online.
          </p>
          <Button variant="primary" onClick={() => onNav("preventivo")}>{content.ctaLabel}</Button>
        </div>

        {/* Internal linking */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26 }}>
          {SERVICE_LINKS.map((s) => (
            <Button key={s.key} variant="ghost" onClick={() => onNav(s.key)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
              {s.label} →
            </Button>
          ))}
          <Button variant="ghost" onClick={() => goToHowItWorks(onNav)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
            Come funziona →
          </Button>
          <Button variant="ghost" onClick={() => goToContatti(onNav)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
            Contatti →
          </Button>
        </div>

        <NavButton onClick={() => onNav("home")}>Home</NavButton>
      </div>
    </div>
  );
}
