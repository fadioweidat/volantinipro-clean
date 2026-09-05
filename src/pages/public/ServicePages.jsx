import React from "react";
import { C, F } from "../../lib/constants.js";
import { NavButton } from "../../components/NavButton.jsx";
import Button from "../../components/ui/Button.jsx";
import { doorToDoorContent, handToHandContent, businessContent } from "../../lib/seo/servicePagesContent.js";

// TICKET — SEO SERVICE PAGES VOLANTINIPRO: 3 pagine pubbliche reali
// (/servizi/door-to-door, /servizi/hand-to-hand, /servizi/business).
// Un solo template condiviso + 3 config di contenuto (in
// src/lib/seo/servicePagesContent.js, condiviso anche con SeoMeta.jsx per il
// JSON-LD — stessa fonte, nessun testo duplicato/disallineato).

const SERVICE_LINKS = [
  { key: "service-door-to-door", label: "Door to Door" },
  { key: "service-hand-to-hand", label: "Hand to Hand" },
  { key: "service-business", label: "Business" },
];

// Stesso pattern gia' usato da Navbar.jsx/HomePage.jsx per "Come funziona"
// da una pagina diversa dalla home: naviga alla home, poi scrolla alla
// sezione (nessuna route dedicata esiste per "come funziona").
function goToHowItWorks(onNav) {
  onNav("home");
  setTimeout(() => {
    document.getElementById("come-funziona")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

function ServicePageTemplate({ content, onNav }) {
  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12 }}>
          {content.eyebrow}
        </div>
        <h1 style={{ fontFamily: F.serif, fontSize: "clamp(30px, 4.2vw, 42px)", color: C.white, letterSpacing: "-1px", lineHeight: 1.1, marginBottom: 14 }}>
          {content.h1}
        </h1>
        <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.62)", lineHeight: 1.65, maxWidth: 680, marginBottom: 24 }}>
          {content.intro}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          <Button variant="primary" onClick={() => onNav("preventivo")}>{content.ctaLabel}</Button>
          <Button variant="secondary" onClick={() => onNav("consultant")}>Parla con un consulente</Button>
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
          </section>
        ))}

        {/* FAQ brevi — fattuali, per AI search / answer engines */}
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
            Configura la tua campagna {content.shortName} e ricevi un preventivo online.
          </p>
          <Button variant="primary" onClick={() => onNav("preventivo")}>{content.ctaLabel}</Button>
        </div>

        {/* Internal linking */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26 }}>
          {SERVICE_LINKS.filter((s) => s.key !== content.pageKey).map((s) => (
            <Button key={s.key} variant="ghost" onClick={() => onNav(s.key)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
              {s.label} →
            </Button>
          ))}
          <Button variant="ghost" onClick={() => goToHowItWorks(onNav)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
            Come funziona →
          </Button>
          <Button variant="ghost" onClick={() => { onNav("home"); setTimeout(() => document.getElementById("contatti")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150); }} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
            Contatti →
          </Button>
        </div>

        <NavButton onClick={() => onNav("home")}>Home</NavButton>
      </div>
    </div>
  );
}

export function ServiceDoorToDoorPage({ onNav }) {
  return <ServicePageTemplate content={doorToDoorContent} onNav={onNav} />;
}
export function ServiceHandToHandPage({ onNav }) {
  return <ServicePageTemplate content={handToHandContent} onNav={onNav} />;
}
export function ServiceBusinessPage({ onNav }) {
  return <ServicePageTemplate content={businessContent} onNav={onNav} />;
}
