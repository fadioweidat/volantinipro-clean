import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Step1Icon } from "../../components/Step1Icon.jsx";
import { buildConfiguratorHref, buildQuickQuoteHref, readComuneParam, readServiceParam } from "../../lib/quote/quoteComuneParam.js";
import { BUSINESS_RESPONSE_TIME } from "../../lib/business/businessOnProject.js";
import { PHOTO_REPORT_PRICE, TRACKING_GPS_PRICE } from "../../lib/extraServicePrices.js";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = {
  navy: "#0B1020", navyMid: "#0D1829", navyLight: "#122036",
  orange: "#E8571A", white: "#F8FAFC", green: "#22C55E",
  blue: "#60A5FA", purple: "#A78BFA", indigo: "#6366F1",
  teal: "#14B8A6", slate: "#94A3B8",
};

/* ─── SERVICE OUTPUT DATA ─── */
const GPS_EXTRA = `Servizio aggiuntivo · +€${TRACKING_GPS_PRICE}`;
const PHOTO_EXTRA = `Servizio aggiuntivo · +€${PHOTO_REPORT_PRICE}`;
const SERVICES = [
  {
    id: "d2d",
    name: "Door to Door",
    icon: "mailbox",
    col: C.orange,
    sub: "Distribuzione residenziale in cassetta",
    outputs: [
      {
        icon: "book",
        name: "Report PDF",
        desc: "Documento completo della campagna: zona distribuita, quantità e riepilogo dati.",
        benefit: "Hai la prova documentale completa da conservare o condividere con il tuo team.",
      },
      {
        icon: "pin",
        name: "Tracking GPS percorso",
        extra: GPS_EXTRA,
        desc: "Mappa interattiva con il percorso degli operatori, punti registrati e orari di passaggio.",
        benefit: "Vedi dove e quando è avvenuta la distribuzione.",
      },
      {
        icon: "family",
        name: "Famiglie raggiungibili",
        desc: "Stima delle famiglie presenti nell'area selezionata, su dati ISTAT.",
        benefit: "Conosci la stima delle famiglie della zona prima di iniziare la campagna.",
      },
      {
        icon: "map",
        name: "Mappa di distribuzione",
        extra: GPS_EXTRA,
        desc: "Visualizzazione geografica della zona coperta: comuni, quartieri e aree incluse nella campagna.",
        benefit: "Vedi la tua campagna disegnata sulla mappa, zona per zona.",
      },
      {
        icon: "chart",
        name: "Copertura dell'area",
        desc: "Percentuale dell'area selezionata effettivamente raggiunta rispetto al totale delle abitazioni presenti.",
        benefit: "Conosci in numeri chiari quanta parte del territorio hai realmente coperto.",
      },
      {
        icon: "building",
        name: "Comuni coinvolti",
        desc: "Elenco dettagliato di tutti i comuni inclusi nella distribuzione, con dati per singolo territorio.",
        benefit: "Pianifichi campagne successive sapendo già dove hai distribuito e con quali risultati.",
      },
      {
        icon: "camera",
        name: "Foto geolocalizzate",
        extra: PHOTO_EXTRA,
        desc: "Fotografie scattate durante la distribuzione, ciascuna con coordinate GPS, data e ora di scatto.",
        benefit: "Hai la prova visiva del lavoro svolto: ogni foto ha data, ora e posizione impresse sull'immagine.",
      },
      {
        icon: "link",
        name: "Smart Pairing",
        desc: "Risparmio possibile quando la tua area coincide con un'altra campagna già programmata nella stessa data.",
        benefit: "Riduci il costo della distribuzione fino al 40% senza rinunciare a nulla.",
      },
    ],
  },
  {
    id: "h2h",
    name: "Hand to Hand",
    icon: "handshake",
    col: C.teal,
    sub: "Distribuzione diretta mano a mano",
    outputs: [
      {
        icon: "book",
        name: "Report PDF",
        desc: "Documento completo con punti di distribuzione, orari e riepilogo operativo.",
        benefit: "Hai un documento professionale da condividere con clienti o stakeholder.",
      },
      {
        icon: "pin",
        name: "Tracking GPS percorso",
        extra: GPS_EXTRA,
        desc: "Mappa del percorso degli operatori con i punti di sosta, i tempi di distribuzione e i movimenti registrati.",
        benefit: "Verifica dove si sono fermati gli operatori e quanto tempo hanno dedicato a ogni punto.",
      },
      {
        icon: "user",
        name: "Punti scelti",
        desc: "Elenco dei punti scelti per la distribuzione: piazze, ingressi, fermate.",
        benefit: "Sai in quali punti vengono distribuiti i tuoi volantini.",
      },
      {
        icon: "pin",
        name: "Mappa dei punti",
        desc: "Visualizzazione sulla mappa dei punti scelti per la distribuzione.",
        benefit: "Vedi sulla mappa i luoghi scelti per il tuo volantino.",
      },
      {
        icon: "clock",
        name: "Orari di distribuzione",
        desc: "Dettaglio delle ore in cui è avvenuta la distribuzione.",
        benefit: "Sai in quali orari gli operatori erano sul posto.",
      },
      {
        icon: "camera",
        name: "Foto geolocalizzate",
        extra: PHOTO_EXTRA,
        desc: "Fotografie scattate nei punti di distribuzione, con posizione GPS, data e ora di scatto.",
        benefit: "Documenti il lavoro con prove fotografiche con data, ora e posizione.",
      },
      {
        icon: "target",
        name: "Percorso GPS",
        extra: GPS_EXTRA,
        desc: "Il tracciato GPS degli operatori nelle ore di distribuzione.",
        benefit: "Vedi in un colpo d'occhio le aree percorse dagli operatori.",
      },
      {
        icon: "chart",
        name: "Report operativo finale",
        desc: "Riepilogo dell'intera operazione: ore, punti, operatori, anomalie e note.",
        benefit: "Un documento completo che puoi usare per confrontare le campagne e ottimizzare le future.",
      },
    ],
  },
  {
    id: "biz",
    name: "Business Distribution",
    icon: "building",
    col: C.green,
    sub: "Distribuzione mirata a imprese e attività",
    outputs: [
      {
        icon: "book",
        name: "Report PDF",
        desc: "Documento professionale con attività visitate, categorie, zone coperte e dati aggregati per comune.",
        benefit: "Hai una reportistica strutturata da consegnare a chi ha commissionato la campagna.",
      },
      {
        icon: "pin",
        name: "Tracking GPS percorso",
        extra: GPS_EXTRA,
        desc: "Mappa del percorso con le attività commerciali visitate, gli indirizzi e gli orari di passaggio registrati.",
        benefit: "Verifica la copertura reale delle attività commerciali visitate dagli operatori.",
      },
      {
        icon: "shop",
        name: "Aziende raggiungibili",
        desc: "Elenco e conta delle attività commerciali, uffici e imprese presenti nella zona selezionata.",
        benefit: "Sai quante e quali aziende puoi contattare ancora prima di avviare la campagna.",
      },
      {
        icon: "bag",
        name: "Categorie commerciali",
        desc: "Segmentazione delle attività per settore: ristorazione, retail, servizi, artigianato, uffici, ecc.",
        benefit: "Selezioni solo le categorie rilevanti per il tuo prodotto, eliminando gli sprechi.",
      },
      {
        icon: "map",
        name: "Mappa zone business",
        desc: "Visualizzazione geografica delle aree commerciali con concentrazione di attività per quartiere o comune.",
        benefit: "Vedi dove si concentra il tessuto commerciale prima di scegliere dove distribuire.",
      },
      {
        icon: "star",
        name: "Business score",
        desc: "Punteggio di priorità per ogni area o categoria di attività, basato su densità e potenziale commerciale.",
        benefit: "Sai quali zone e quali tipologie di attività vale più la pena raggiungere per prime.",
      },
      {
        icon: "search",
        name: "Competitor mappati",
        desc: "Mappa delle attività dello stesso settore nella zona, utile per capire la saturazione del mercato locale.",
        benefit: "Conosci la concorrenza sul territorio prima ancora di distribuire il tuo volantino.",
      },
      {
        icon: "camera",
        name: "Foto geolocalizzate",
        extra: PHOTO_EXTRA,
        desc: "Fotografie delle consegne con posizione GPS, data e ora di scatto.",
        benefit: "Documenti le visite con prove fotografiche con data, ora e posizione.",
      },
    ],
  },
];

/* ─── OUTPUT CARD ─── */
function OutputCard({ out, svcCol, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.04 }}
      style={{
        background: C.navyLight,
        border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 16,
        padding: "22px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Top: icon + name */}
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        <span style={{ flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Step1Icon name={out.icon} size={24} color={svcCol} />
        </span>
        <div>
          <div style={{ fontFamily: F.serif, fontSize: 17, color: C.white, letterSpacing: "-.2px", lineHeight: 1.2 }}>{out.name}</div>
          {out.extra ? <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white, opacity: .78, lineHeight: 1.4, marginTop: 6 }}>{out.extra}</div> : null}
        </div>
      </div>

      {/* Description */}
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.65 }}>
        {out.desc}
      </div>

      {/* Benefit */}
      <div style={{ padding: "12px 14px", borderRadius: 10, background: `${svcCol}0d`, border: `1px solid ${svcCol}28`, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: svcCol, fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>💡</span>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.72)", lineHeight: 1.6 }}>
          {out.benefit}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── QUOTE SELECTION HEADER ─── */
// A comune chosen in the homepage calculator arrives as /preventivo?comune=…:
// both paths keep it (Guidato: configurator with the comune preselected;
// Rapido: comune pre-filled). Without it the buttons behave exactly as before.
function QuoteSelectionHeader({ onNav, comune, service }) {
  const startGuided = () => (comune || service ? window.location.assign(buildConfiguratorHref(comune, service || "d2d")) : onNav("step1", null, { newCampaign: true, protectDraft: true }));
  const startQuick = () => (comune || service ? window.location.assign(buildQuickQuoteHref(comune, service)) : onNav("quick"));
  return (
    <div style={{ background: `linear-gradient(180deg, #0B1020 0%, ${C.navy} 100%)`, padding: "52px 28px 64px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <button
          onClick={() => onNav("home")}
          style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.35)", fontFamily: F.sans, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 28 }}
        >
          ← Home
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 50, gap: 16 }}>
          <h1 style={{ fontFamily: F.serif, fontSize: "clamp(40px, 5vw, 64px)", color: C.white, letterSpacing: "-1.5px", lineHeight: 1.05, margin: 0 }}>
            Richiedi un Preventivo
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 18, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5, maxWidth: 500 }}>
            Scegli il percorso più adatto alle esigenze della tua campagna.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {/* Card 1: Preventivo Guidato */}
          <motion.div
            whileHover={{ y: -4, borderColor: "rgba(255,255,255,.15)" }}
            transition={{ duration: 0.2 }}
            style={{
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            }}
          >
            <div style={{ position: "absolute", top: 24, right: 24, background: "transparent", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.2)", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
              <Step1Icon name="star" size={12} /> Consigliato
            </div>
            <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, margin: "0 0 16px 0" }}>Preventivo Guidato</h3>
            <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: "0 0 32px 0" }}>
              Configurazione completa in 4 Step con analisi territoriale, suggerimenti intelligenti e configurazione professionale.
            </p>
            <div style={{ background: "#0B101E", borderRadius: 16, padding: 24, marginBottom: 32, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 8 }}>IDEALE PER</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 24 }}>Campagne complete e personalizzate</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 12 }}>INCLUDE</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {["Analisi territoriale", "Quantità consigliata", "Copertura stimata", "Servizi extra", "Configurazione completa"].map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "rgba(255,255,255,.8)" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,.4)" }} /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 4 }}>TEMPO MEDIO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>3-5 minuti</div>
              </div>
              <button
                onClick={startGuided}
                style={{ background: "#CE4B15", color: C.white, border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px #CE4B1540" }}
              >
                Inizia il percorso
              </button>
            </div>
          </motion.div>

          {/* Card 2: Preventivo Rapido */}
          <motion.div
            whileHover={{ y: -4, borderColor: "rgba(255,255,255,.15)" }}
            transition={{ duration: 0.2 }}
            style={{
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            }}
          >
            <div style={{ position: "absolute", top: 24, right: 24, background: "transparent", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.2)", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
              <Step1Icon name="lightning" size={12} /> Più veloce
            </div>
            <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, margin: "0 0 16px 0" }}>Preventivo Rapido</h3>
            <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: "0 0 32px 0" }}>
              Ricevi una stima immediata inserendo solo le informazioni essenziali.
            </p>
            <div style={{ background: "#0B101E", borderRadius: 16, padding: 24, marginBottom: 32, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 8 }}>IDEALE PER</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 24 }}>Chi conosce già servizio, zona e quantità.</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 12 }}>INCLUDE</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {["Prezzo stimato", "Tempo indicativo", "Preventivo immediato", "Fino a 3 comuni", "Servizi extra opzionali"].map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "rgba(255,255,255,.8)" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,.4)" }} /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 4 }}>TEMPO MEDIO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>Meno di 1 minuto</div>
              </div>
              <button
                onClick={startQuick}
                style={{ background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,.2)", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Calcola subito
              </button>
            </div>
          </motion.div>

          {/* Card 3: Consulenza Personalizzata */}
          <motion.div
            whileHover={{ y: -4, borderColor: "rgba(255,255,255,.15)" }}
            transition={{ duration: 0.2 }}
            style={{
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            }}
          >
            <div style={{ position: "absolute", top: 24, right: 24, background: "transparent", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.2)", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
              <Step1Icon name="user" size={12} /> Supporto dedicato
            </div>
            <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, margin: "0 0 16px 0" }}>Consulenza Personalizzata</h3>
            <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: "0 0 32px 0" }}>
              Parla con un consulente VolantiniPro per costruire la soluzione migliore per la tua campagna.
            </p>
            <div style={{ background: "#0B101E", borderRadius: 16, padding: 24, marginBottom: 32, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 8 }}>IDEALE PER</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 24 }}>Aziende, Franchising, Multi città, Campagne personalizzate</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 12 }}>INCLUDE</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {["Preventivo su misura", "Analisi della richiesta", "Pianificazione campagna", "Supporto dedicato", "WhatsApp, Email, Telefono"].map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "rgba(255,255,255,.8)" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,.4)", marginTop: 8 }} /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 4 }}>TEMPO MEDIO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{BUSINESS_RESPONSE_TIME[0].toUpperCase() + BUSINESS_RESPONSE_TIME.slice(1)}</div>
              </div>
              <button
                onClick={() => onNav("consultant")}
                style={{ background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,.2)", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Contattaci
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function ServiceCenter({ onNav }) {
  // Le schede usano "biz", i link e il configuratore "b2b".
  const [active, setActive] = useState(() => {
    const requested = typeof window === "undefined" ? null : readServiceParam(window.location.search);
    return requested === "b2b" ? "biz" : requested || "d2d";
  });
  const comune = useMemo(() => (typeof window === "undefined" ? null : readComuneParam(window.location.search)), []);
  const service = useMemo(() => (typeof window === "undefined" ? null : readServiceParam(window.location.search)), []);

  const svc = SERVICES.find(s => s.id === active);

  return (
    <div style={{ minHeight: "100vh", background: C.navy, paddingBottom: 80 }}>

      <QuoteSelectionHeader onNav={onNav} comune={comune} service={service} />

      {/* HEADER - ORIGINAL (Service Center features) */}
      <div style={{ background: C.navy, padding: "52px 28px 44px", borderBottom: "1px solid rgba(255,255,255,.05)", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 14 }}>
            Servizi VolantiniPro
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(26px,5vw,46px)", color: C.white, letterSpacing: "-1.5px", lineHeight: 1.06, margin: "0 0 14px" }}>
            Cosa ricevi con ogni servizio
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.5)", lineHeight: 1.65, maxWidth: 580, margin: 0 }}>
            Seleziona un servizio per vedere cosa trovi nel tuo portale cliente. Le schede con il prezzo sono servizi aggiuntivi a pagamento.
          </p>
        </div>
      </div>

      {/* SERVICE SELECTOR */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(8,14,26,.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 28px", display: "flex", gap: 0 }}>
          {SERVICES.map(s => {
            const isActive = s.id === active;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                style={{
                  padding: "18px 28px", border: "none", background: "transparent",
                  borderBottom: `2px solid ${isActive ? s.col : "transparent"}`,
                  color: isActive ? C.white : "rgba(255,255,255,.42)",
                  fontFamily: F.sans, fontSize: 14, fontWeight: isActive ? 800 : 500,
                  cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ display: "flex", alignItems: "center" }}>
                  <Step1Icon name={s.icon} size={18} color={isActive ? s.col : "currentColor"} />
                </span>
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE SERVICE + OUTPUTS */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 28px 0" }}>

        {/* Service subtitle */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active + "-header"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ marginBottom: 32 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: `${svc.col}18`, border: `1px solid ${svc.col}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Step1Icon name={svc.icon} size={22} color={svc.col} />
              </div>
              <div>
                <div style={{ fontFamily: F.serif, fontSize: 24, color: C.white, letterSpacing: "-.3px" }}>{svc.name}</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)" }}>{svc.sub}</div>
              </div>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", paddingLeft: 56 }}>
              {svc.outputs.length} output disponibili
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Output grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active + "-grid"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 52 }}>
              {svc.outputs.map((out, i) => (
                <OutputCard key={out.name} out={out} svcCol={svc.col} index={i} />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* CTA */}
        <div style={{ padding: "36px 32px", borderRadius: 18, background: `linear-gradient(135deg, ${svc.col}1a 0%, rgba(99,102,241,.07) 100%)`, border: `1px solid ${svc.col}33`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <div style={{ fontFamily: F.serif, fontSize: "clamp(18px,3.5vw,28px)", color: C.white, letterSpacing: "-1px" }}>
            Pronto a ricevere questi output?
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.48)", maxWidth: 480, lineHeight: 1.65 }}>
            Configura la tua campagna {svc.name}: scegli la zona, calcola quante famiglie raggiungi e aggiungi i servizi che ti servono.
          </div>
          <button
            onClick={() => onNav("step1", { service: svc.id === "biz" ? "b2b" : svc.id }, { newCampaign: true, protectDraft: true })}
            style={{ padding: "14px 36px", borderRadius: 10, border: "none", background: svc.col, color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: `0 6px 24px ${svc.col}50` }}
          >
            Configura {svc.name} →
          </button>
        </div>

      </div>
    </div>
  );
}
