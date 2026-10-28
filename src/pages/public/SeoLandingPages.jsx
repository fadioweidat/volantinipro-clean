import React from "react";
import PublicNavLink from "../../components/common/PublicNavLink.jsx";
import { C, F } from "../../lib/constants.js";
import Button from "../../components/ui/Button.jsx";
import { pricesPageContent as prices } from "../../lib/seo/pricesPageContent.js";
import { CITY_PAGES, ISTAT_SOURCE, cityFacts, formatEuro, formatInt } from "../../lib/seo/cityPagesData.js";

// SEO — pagina prezzi e pagine citta' (2026-10-25). Stesso design system della
// pagina Milano (MilanoLandingPage.jsx). Contenuti in src/lib/seo/
// (pricesPageContent.js, cityPagesData.js), condivisi con SeoMeta.jsx per il
// JSON-LD: numeri ISTAT e prezzi del motore, mai scritti qui.

const shell = { minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" };
const inner = { maxWidth: 860, margin: "0 auto" };
const eyebrow = { fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12 };
const h1Style = { fontFamily: F.sans, fontWeight: 800, fontSize: "clamp(30px, 4.2vw, 42px)", color: C.white, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 14 };
const introStyle = { fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.62)", lineHeight: 1.65, maxWidth: 680, marginBottom: 24 };
const h2Style = { fontFamily: F.sans, fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 10, letterSpacing: "-.02em" };
const pStyle = { fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.7, marginBottom: 10 };
const card = { padding: 16, borderRadius: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" };
const smallNote = { fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.6, marginTop: 8 };
const th = { fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.7)", textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.12)", whiteSpace: "nowrap" };
const td = { fontFamily: F.sans, fontSize: 13.5, color: "rgba(255,255,255,.85)", textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.06)", whiteSpace: "nowrap" };

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
  );
}

// Tabella con scorrimento orizzontale interno: mai scroll della pagina su telefono.
function PriceTable({ caption, head, rows }) {
  return (
    <div style={{ overflowX: "auto", ...card, padding: 0 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
        <caption style={{ ...smallNote, textAlign: "left", padding: "10px 12px 0", captionSide: "top" }}>{caption}</caption>
        <thead>
          <tr>{head.map((h, i) => <th key={h} scope="col" style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>{row.map((cell, i) => i === 0
              ? <th key={i} scope="row" style={{ ...td, textAlign: "left", fontWeight: 800 }}>{cell}</th>
              : <td key={i} style={td}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faqs({ faqs }) {
  return (
    <Section title="Domande frequenti">
      <div style={{ display: "grid", gap: 12 }}>
        {faqs.map((faq) => (
          <div key={faq.q} style={card}>
            <h3 style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, color: C.white, margin: "0 0 6px" }}>{faq.q}</h3>
            <p style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.6, margin: 0 }}>{faq.a}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function LinkRow({ links, onNav }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26 }}>
      {links.map((l) => (
        <Button as={PublicNavLink} key={l.href} href={l.href} variant="ghost" onClick={() => onNav(l.pageKey)} style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
          {l.label} →
        </Button>
      ))}
    </div>
  );
}

function QuoteCta({ text, onNav }) {
  return (
    <div style={{ padding: 22, borderRadius: 14, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.25)", marginBottom: 34, textAlign: "center" }}>
      <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.75)", marginBottom: 14 }}>{text}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Button as={PublicNavLink} href="/preventivo" variant="primary" onClick={() => onNav("preventivo")}>Calcola il preventivo</Button>
        <Button as={PublicNavLink} href="/consulente" variant="secondary" onClick={() => onNav("consultant")}>Parla con noi</Button>
      </div>
    </div>
  );
}

const SERVICE_LINKS = [
  { label: "Distribuzione porta a porta", href: "/servizi/door-to-door", pageKey: "service-door-to-door" },
  { label: "Distribuzione a mano", href: "/servizi/hand-to-hand", pageKey: "service-hand-to-hand" },
  { label: "Distribuzione per aziende", href: "/servizi/business", pageKey: "service-business" },
];
const PRICES_LINK = { label: "Prezzi distribuzione volantini", href: "/prezzi-distribuzione-volantini", pageKey: "prices" };

/** Numeri ISTAT + prezzi di una citta': usato dalle pagine citta' e dalla pagina Milano. */
export function CityNumbersSection({ slug, onNav, showPrices = true }) {
  const f = cityFacts(slug);
  if (!f) return null;
  const facts = [
    ["Famiglie", formatInt(f.households)],
    ["Abitanti", formatInt(f.population)],
    ["Superficie", `${f.areaKm2.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km²`],
    ["Abitanti per km²", formatInt(f.densityPerKm2)],
  ];
  return (
    <>
      <Section title={`${f.name} in numeri`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {facts.map(([label, value]) => (
            <div key={label} style={card}>
              <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
              <div style={{ fontFamily: F.sans, fontWeight: 800, fontSize: 24, color: C.white, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <p style={smallNote}>Fonte: {ISTAT_SOURCE}</p>
      </Section>
      <Section title={`Quanti volantini servono a ${f.name}`}>
        <p style={pStyle}>
          Il configuratore consiglia una quantità pari alle famiglie della zona più un margine operativo del 10%. Per tutta {f.name} sono circa <strong style={{ color: C.white }}>{formatInt(f.wholeCityFlyers)} volantini</strong>.
        </p>
        <p style={pStyle}>
          Di solito si sceglie una zona: con 5.000 volantini raggiungi circa {formatInt(5000 / 1.1)} famiglie, con 10.000 circa {formatInt(10000 / 1.1)}. Nel configuratore vedi le famiglie ISTAT esatte del raggio o del comune che scegli.
        </p>
      </Section>
      {showPrices && <Section title={`Quanto costa a ${f.name}`}>
        <CityPriceTable slug={slug} onNav={onNav} />
      </Section>}
    </>
  );
}

/** Tabella prezzi Door to Door di una citta' (motore reale) con link alla pagina prezzi. */
export function CityPriceTable({ slug, onNav }) {
  const f = cityFacts(slug);
  if (!f) return null;
  return (
    <>
        <PriceTable
          caption={`Solo distribuzione Door to Door, IVA esclusa · fascia «${f.tierLabel}»`}
          head={["Quantità", "Prezzo", "Ogni 1.000"]}
          rows={[2500, 5000, 10000, 20000].map((qty) => [`${formatInt(qty)} volantini`, formatEuro(f.price(qty)), formatEuro(Math.round(f.price(qty) / qty * 1000))])}
        />
        <p style={smallNote}>
          Minimo a campagna {formatEuro(f.minimum)}. Stampa, urgenza ed extra si aggiungono nel preventivo, che si calcola sulla tua zona.
        </p>
        <Button as={PublicNavLink} href={PRICES_LINK.href} variant="ghost" onClick={() => onNav(PRICES_LINK.pageKey)} style={{ color: C.orange, fontSize: 13, padding: 0, marginTop: 6 }}>
          Tutti i prezzi per quantità e zona →
        </Button>
    </>
  );
}

export function PricesPage({ onNav }) {
  const head = ["Quantità", ...prices.tierColumns.map((c) => c.label)];
  return (
    <div style={shell}>
      <div style={inner}>
        <div style={eyebrow}>Prezzi</div>
        <h1 style={h1Style}>{prices.h1}</h1>
        <p style={introStyle}>{prices.intro}</p>

        <Section title="Prezzi per quantità tipiche">
          <PriceTable
            caption="Solo distribuzione Door to Door, IVA esclusa. Fra parentesi il prezzo ogni 1.000 volantini."
            head={head}
            rows={prices.typical.map((row) => [row.label, ...row.prices.map((p, i) => `${p} (${row.perThousand[i]})`)])}
          />
          <p style={{ ...pStyle, marginTop: 12 }}>{prices.largeVolumesNote}</p>
        </Section>

        <Section title="Tabella completa per quantità">
          <PriceTable
            caption="Solo distribuzione Door to Door, IVA esclusa."
            head={head}
            rows={[...prices.grid.map((row) => [row.label, ...row.prices]), ["Minimo a campagna", ...prices.minimums]]}
          />
        </Section>

        <Section title="Come si sceglie la fascia">
          {prices.tierExplanation.map((p) => <p key={p} style={pStyle}>{p}</p>)}
        </Section>

        <Section title="Esempi nelle città">
          <PriceTable
            caption="Solo distribuzione Door to Door, IVA esclusa."
            head={["Città", "Fascia", "5.000 volantini", "10.000 volantini"]}
            rows={prices.cityExamples.map((c) => [c.name, c.tierLabel, c.price5000, c.price10000])}
          />
          <LinkRow onNav={onNav} links={prices.cityExamples.map((c) => ({ label: `Distribuzione volantini a ${c.name}`, href: c.href, pageKey: c.pageKey }))} />
        </Section>

        <Section title="Cosa può cambiare il prezzo">
          <div style={{ display: "grid", gap: 8 }}>
            {prices.adjustments.map((a) => (
              <div key={a} style={{ display: "flex", gap: 9, fontFamily: F.sans, fontSize: 13.5, color: "rgba(255,255,255,.75)" }}>
                <span style={{ color: C.orange, fontWeight: 900 }}>•</span>{a}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Distribuzione a mano e per aziende">
          <div style={{ display: "grid", gap: 12 }}>
            {prices.otherServices.map((s) => (
              <div key={s.pageKey} style={card}>
                <h3 style={{ fontFamily: F.sans, fontSize: 15, color: C.white, margin: "0 0 6px" }}>{s.title}</h3>
                <p style={{ ...pStyle, marginBottom: 6 }}>{s.price}</p>
                <Button as={PublicNavLink} href={s.href} variant="ghost" onClick={() => onNav(s.pageKey)} style={{ color: C.orange, fontSize: 13, padding: 0 }}>Scopri il servizio →</Button>
              </div>
            ))}
          </div>
        </Section>

        <Faqs faqs={prices.faqs} />
        <QuoteCta onNav={onNav} text="Il prezzo esatto si calcola sulla tua zona: configura la campagna e scarica il preventivo in PDF." />
        <LinkRow onNav={onNav} links={SERVICE_LINKS} />
      </div>
    </div>
  );
}

export function CityLandingPage({ pageKey, onNav }) {
  const content = CITY_PAGES[pageKey];
  if (!content) return null;
  return (
    <div style={shell}>
      <div style={inner}>
        <div style={eyebrow}>Distribuzione volantini locale</div>
        <h1 style={h1Style}>{content.h1}</h1>
        <p style={introStyle}>{content.intro}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          <Button as={PublicNavLink} href="/preventivo" variant="primary" onClick={() => onNav("preventivo")}>Calcola il preventivo</Button>
          <Button as={PublicNavLink} href={PRICES_LINK.href} variant="secondary" onClick={() => onNav(PRICES_LINK.pageKey)}>Vedi i prezzi</Button>
        </div>

        <Section title={content.angle.h2}>
          {content.angle.paragraphs.map((p) => <p key={p} style={pStyle}>{p}</p>)}
        </Section>

        <CityNumbersSection slug={content.slug} onNav={onNav} />

        <Section title="Servizi disponibili">
          <div style={{ display: "grid", gap: 12 }}>
            {[
              { ...SERVICE_LINKS[0], text: "Volantini nelle cassette postali di condomini e abitazioni, con il prezzo della tabella sopra." },
              { ...SERVICE_LINKS[1], text: "Consegna a mano in punti di passaggio. Prezzo calcolato sulla tua zona." },
              { ...SERVICE_LINKS[2], text: "Distribuzione mirata a negozi e uffici. Su progetto." },
            ].map((s) => (
              <div key={s.pageKey} style={card}>
                <h3 style={{ fontFamily: F.sans, fontSize: 15, color: C.white, margin: "0 0 6px" }}>{s.label}</h3>
                <p style={{ ...pStyle, marginBottom: 6 }}>{s.text}</p>
                <Button as={PublicNavLink} href={s.href} variant="ghost" onClick={() => onNav(s.pageKey)} style={{ color: C.orange, fontSize: 13, padding: 0 }}>Scopri il servizio →</Button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Come verifichi la distribuzione">
          <p style={pStyle}>Quando previsto dal servizio scelto, gli operatori sono tracciati via GPS durante la distribuzione e puoi seguire l'avanzamento della campagna. Al termine ricevi foto come prova di consegna e un report finale.</p>
        </Section>

        <Faqs faqs={content.faqs} />
        <QuoteCta onNav={onNav} text={`Configura la tua campagna a ${content.facts.name} e ricevi il preventivo online.`} />

        <Section title="Altre città">
          <LinkRow onNav={onNav} links={content.nearby.map((c) => ({ label: `Distribuzione volantini a ${c.name}`, href: c.href, pageKey: c.pageKey }))} />
        </Section>
        <LinkRow onNav={onNav} links={[PRICES_LINK, ...SERVICE_LINKS]} />
      </div>
    </div>
  );
}


