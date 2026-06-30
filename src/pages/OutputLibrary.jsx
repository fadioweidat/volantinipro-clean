/**
 * Output Library — catalogo READ-ONLY degli output dello Step 2 / Step 4.
 * Riusa:
 *  - KpiTooltip (componente esistente)
 *  - fieldCard  — stessa CSS di volantinipro-final.jsx › Step4 › fieldCard
 *  - ScoreBar   — stessa CSS dei blocchi "scores" nello Step 4
 *  - Etichette, sorgenti e terminologia identiche al motore reale
 * Nessuna logica nuova. Nessuna query. Nessun Supabase. Read-only.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import KpiTooltip from "../components/ui/KpiTooltip.jsx";

/* ─── Design tokens: stessi del file principale ─── */
const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = {
  navy: "#0B1020", navyMid: "#0D1829", navyLight: "#122036",
  orange: "#E8571A", white: "#F8FAFC", green: "#22C55E",
  blue: "#60A5FA", purple: "#A78BFA", indigo: "#6366F1",
  red: "#EF4444", yellow: "#F59E0B", teal: "#14B8A6",
};

/* ─── Componenti atomici: stessa CSS di fieldCard e ScoreBar di Step 4 ─── */

/** Identico a fieldCard di Step4 */
function FieldCard({ l, v, src, c = C.white }) {
  return (
    <div style={{ padding: "10px 11px", background: "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.055)" }}>
      <div style={{ display: "flex", alignItems: "center", fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
        <span>{l}</span>
        <KpiTooltip term={l.split(" ")[0]} style={{ marginLeft: 4 }} />
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: c }}>{v}</div>
      {src && <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.26)", marginTop: 4 }}>{src}</div>}
    </div>
  );
}

/** Identico alle barre score di Step4 */
function ScoreBar({ l, v, c = C.blue, d }) {
  return (
    <div style={{ padding: "10px 12px", background: "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.055)" }}>
      <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.42)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{l}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${v}%`, height: "100%", background: c, borderRadius: 3 }} />
        </div>
        <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: c, minWidth: 28, textAlign: "right" }}>{v}</span>
      </div>
      {d && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 5, lineHeight: 1.45 }}>{d}</div>}
    </div>
  );
}

/** Card per output finali (report, GPS, foto…) */
function ReportCard({ icon, l, desc, note }) {
  return (
    <div style={{ padding: "14px 14px", background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white, marginBottom: 4 }}>{l}</div>
        <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.55 }}>{desc}</div>
        {note && <div style={{ fontFamily: F.sans, fontSize: 9, color: C.orange, fontWeight: 700, marginTop: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>{note}</div>}
      </div>
    </div>
  );
}

/** Intestazione sezione (come in Step 4) */
function SectionHead({ n, title, sub, col = C.orange }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14, marginTop: 28 }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${col}25`, border: `1px solid ${col}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: col }}>{n}</span>
      </div>
      <div>
        <div style={{ fontFamily: F.serif, fontSize: 17, color: C.white, letterSpacing: "-.2px" }}>{title}</div>
        {sub && <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.42)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Grid wrapper responsive 2-col su tablet, 4 su desktop */
function Grid({ children, cols = 4 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${cols <= 3 ? 200 : 180}px, 1fr))`, gap: 10 }}>
      {children}
    </div>
  );
}

/* ─── DATI ESEMPIO — stessi nomi e sorgenti del codice Step 4 ─── */

/** Banner disclaimer sopra ogni tab */
function ExampleBanner() {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(232,87,26,.07)", border: "1px solid rgba(232,87,26,.2)", marginBottom: 24, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 14 }}>ℹ️</span>
      <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>
        I valori mostrati sono dati di <strong style={{ color: "rgba(255,255,255,.75)" }}>esempio rappresentativi</strong>. I dati reali vengono calcolati automaticamente dal motore GIS in base alla zona e alla quantità configurate nello Step 2.
      </span>
    </div>
  );
}

/* ─── TAB: DOOR TO DOOR ─── */
function D2DOutputs() {
  return (
    <motion.div key="d2d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ExampleBanner />

      {/* 1 — Copertura & Famiglie */}
      <SectionHead n="1" title="Copertura & Famiglie" sub="Output principali del motore GIS per la zona selezionata" col={C.orange} />
      <Grid>
        <FieldCard l="Famiglie raggiungibili" v="18.420" src="ISTAT" c={C.green} />
        <FieldCard l="Popolazione stimata" v="42.880" src="ISTAT" c={C.green} />
        <FieldCard l="Copertura dell'area" v="67%" src="Dati geografici" c={C.green} />
        <FieldCard l="Quantità consigliata" v="19.500" src="Analisi interna" c={C.green} />
        <FieldCard l="Quantità inserita" v="20.000" src="Step 1" c={C.white} />
        <FieldCard l="Scorta operativa" v="500" src="Calcolo" c={C.green} />
        <FieldCard l="Stato copertura" v="Sufficiente ✓" src="Analisi interna" c={C.green} />
      </Grid>

      {/* 2 — Zona & Analisi GIS */}
      <SectionHead n="2" title="Zona & Analisi GIS" sub="Dati geografici prodotti dal motore PostGIS" col={C.blue} />
      <Grid>
        <FieldCard l="Superficie analizzata" v="4,2 km²" src="Dati geografici / PostGIS" c={C.blue} />
        <FieldCard l="Densità media" v="4.200 ab./km²" src="ISTAT" c={C.blue} />
        <FieldCard l="Comuni nel raggio" v="3" src="Dati geografici / PostGIS" c={C.blue} />
        <FieldCard l="Layer attivo" v="Sezioni censuarie" src="GIS" c={C.white} />
        <FieldCard l="Raggio distribuzione" v="2,0 km" src="Step 2" c={C.white} />
        <FieldCard l="Livello analisi" v="Comune" src="GIS" c={C.white} />
        <FieldCard l="Waypoint GPS" v="312" src="Dati geografici / PostGIS" c={C.blue} />
        <FieldCard l="Buffer applicato" v="200 m" src="GIS" c={C.white} />
      </Grid>

      {/* 3 — Demografici */}
      <SectionHead n="3" title="Profilo demografico" sub="Dati ISTAT per sezione censuaria — Analisi interna" col={C.green} />
      <Grid>
        <FieldCard l="Età media area" v="41,2 anni" src="ISTAT" c={C.green} />
        <FieldCard l="Nuclei familiari medi" v="2,3 comp." src="ISTAT" c={C.green} />
        <FieldCard l="Peso sul totale" v="3,8%" src="ISTAT" c={C.white} />
        <FieldCard l="Classifica densità" v="#2 su 3 comuni" src="Analisi interna" c={C.white} />
        <FieldCard l="Classifica famiglie" v="#1 su 3 comuni" src="Analisi interna" c={C.white} />
      </Grid>

      {/* 4 — AI & Score */}
      <SectionHead n="4" title="Analisi AI & Score" sub="Stesse progress bar del preventivo — Analisi interna" col={C.purple} />
      <Grid>
        <ScoreBar l="Qualità area (Family Index)" v={82} c={C.green} d="Qualità residenziale dell'area su 100. Più alto = zona più adatta alla distribuzione porta a porta." />
        <ScoreBar l="Potenziale copertura (Reach Score)" v={74} c={C.blue} d="Stima di quante famiglie puoi raggiungere efficacemente." />
        <ScoreBar l="Efficienza campagna (ROI Score)" v={88} c={C.green} d="Rapporto qualità/costo nell'area. Più alto = maggiore efficienza della spesa." />
        <ScoreBar l="Affidabilità stima (Confidence)" v={91} c={C.purple} d="Quanto sono precisi i dati mostrati. Più alto = stime più accurate." />
      </Grid>

      {/* 5 — Mercato & OMI */}
      <SectionHead n="5" title="Mercato & Valori OMI" sub="Agenzia delle Entrate — Osservatorio del Mercato Immobiliare" col={C.teal} />
      <Grid>
        <FieldCard l="Fascia OMI zona" v="B - Semicentrale" src="Agenzia delle Entrate – OMI" c={C.teal} />
        <FieldCard l="Valore min. residenziale" v="€ 1.850/mq" src="Agenzia delle Entrate – OMI" c={C.teal} />
        <FieldCard l="Valore max. residenziale" v="€ 2.400/mq" src="Agenzia delle Entrate – OMI" c={C.teal} />
        <FieldCard l="Tipologia prevalente" v="Abitazione civile" src="Agenzia delle Entrate – OMI" c={C.white} />
        <FieldCard l="Zone OMI nel raggio" v="2 zone" src="Agenzia delle Entrate – OMI" c={C.white} />
      </Grid>

      {/* 6 — Smart Pairing */}
      <SectionHead n="6" title="Smart Pairing" sub="Riduzione costo tramite campagne compatibili — AI interna" col={C.yellow} />
      <Grid>
        <FieldCard l="Smart Pairing attivo" v="Sì" src="Analisi interna" c={C.green} />
        <FieldCard l="Risparmio applicato" v="-15%" src="Analisi interna" c={C.green} />
        <FieldCard l="Campagne compatibili" v="2 trovate" src="Analisi interna" c={C.white} />
        <FieldCard l="Data compatibile" v="Condivisa" src="Step 3" c={C.white} />
      </Grid>

      {/* 7 — Output finali */}
      <SectionHead n="7" title="Report & Output finali" sub="Documenti e prove generate al termine della campagna" col={C.indigo} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        <ReportCard icon="📄" l="Report PDF" desc="Documento professionale scaricabile con tutti i dati, KPI, mappa percorso e statistiche della campagna." note="Disponibile dopo campagna" />
        <ReportCard icon="📍" l="Tracking GPS percorso" desc="Mappa del percorso reale degli operatori con waypoint certificati, orari di passaggio e storico 30 giorni." note="Incluso — in tempo reale" />
        <ReportCard icon="📸" l="Foto geolocalizzate" desc="30+ fotografie scattate durante la distribuzione, ciascuna con coordinate GPS e timestamp certificato." note="Opzionale — Report Fotografico" />
        <ReportCard icon="🌡️" l="Heatmap copertura" desc="Visualizzazione grafica della densità di distribuzione sull'area: zone ad alta e bassa copertura." note="Inclusa nel Report Avanzato" />
        <ReportCard icon="⏱️" l="Timeline distribuzione" desc="Ricostruzione cronologica step-by-step della distribuzione con orari certificati per ogni waypoint." note="Report Avanzato" />
        <ReportCard icon="📊" l="Dashboard finale" desc="22+ KPI aggregati: famiglie per comune, copertura per operatore, breakdown zona per zona." note="Report Avanzato" />
        <ReportCard icon="🤖" l="AI Advisory Card" desc="Valutazione AI della campagna con rating ★ e suggerimenti operativi personalizzati." note="Inclusa nel preventivo" />
        <ReportCard icon="🔗" l="Smart Pairing recap" desc="Riepilogo del risparmio ottenuto e delle campagne condivise nella stessa data/zona." note="Quando attivo" />
      </div>
    </motion.div>
  );
}

/* ─── TAB: HAND TO HAND ─── */
function H2HOutputs() {
  return (
    <motion.div key="h2h" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ExampleBanner />

      {/* 1 — POI & Traffico */}
      <SectionHead n="1" title="POI & Traffico pedonale" sub="Punti di interesse e flussi rilevati — Google Places / Analisi interna" col={C.blue} />
      <Grid>
        <FieldCard l="POI rilevanti" v="1.240" src="Google Places" c={C.blue} />
        <FieldCard l="Hotspot ad alto passaggio" v="38" src="Analisi interna" c={C.purple} />
        <FieldCard l="Fermate / stazioni" v="12" src="Trasporto pubblico / GTFS" c={C.blue} />
        <FieldCard l="Scuole / eventi" v="7" src="Analisi interna" c={C.blue} />
        <FieldCard l="Attività vicine" v="420" src="Google Places" c={C.white} />
        <FieldCard l="Hotspot principale" v="Centro città" src="Analisi interna" c={C.white} />
        <FieldCard l="Forza hotspot" v="87/100" src="Analisi interna" c={C.purple} />
      </Grid>

      {/* 2 — Flussi & Fasce orarie */}
      <SectionHead n="2" title="Flussi & Fasce orarie" sub="Analisi del traffico pedonale per orario — Analisi interna" col={C.orange} />
      <Grid>
        <FieldCard l="Flusso potenziale" v="78/100" src="Analisi interna" c={C.blue} />
        <FieldCard l="Densità passaggio" v="82/100" src="Analisi interna" c={C.blue} />
        <FieldCard l="Fasce consigliate" v="8–10, 12–14, 17–19" src="Analisi interna" c={C.white} />
        <FieldCard l="Contatti stimati/gg" v="~8.500" src="Analisi interna" c={C.green} />
        <FieldCard l="Operatori consigliati" v="3" src="Analisi interna" c={C.white} />
      </Grid>

      {/* 3 — AI Score */}
      <SectionHead n="3" title="Analisi AI & Score" sub="Score H2H — stesse barre del preventivo" col={C.purple} />
      <Grid>
        <ScoreBar l="Potenziale copertura" v={78} c={C.blue} d="Stima di quante persone puoi raggiungere efficacemente." />
        <ScoreBar l="Efficienza campagna" v={83} c={C.green} d="Rapporto qualità/costo nell'area selezionata." />
        <ScoreBar l="Affidabilità stima" v={88} c={C.purple} d="Precisione dei dati. Più alto = stime più accurate." />
      </Grid>

      {/* 4 — Output finali */}
      <SectionHead n="4" title="Report & Output finali" sub="Documenti generati al termine della campagna" col={C.indigo} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        <ReportCard icon="📄" l="Report PDF" desc="Documento completo con punti distribuzione, orari, contatti stimati e riepilogo operativo." note="Disponibile dopo campagna" />
        <ReportCard icon="📍" l="Tracking GPS percorso" desc="Mappa percorso operatori con i punti di sosta, tempi per ogni hotspot e movimenti certificati." note="Incluso — in tempo reale" />
        <ReportCard icon="📸" l="Foto geolocalizzate" desc="Fotografie dei principali punti di distribuzione con GPS e timestamp certificato." note="Opzionale — Report Fotografico" />
        <ReportCard icon="🌡️" l="Heatmap pedonale" desc="Mappa a colori della densità di passaggio nelle aree selezionate nelle ore di distribuzione." note="Report Avanzato" />
        <ReportCard icon="📋" l="Report operativo" desc="Riepilogo completo: ore, punti, operatori, contatti, anomalie rilevate e note operative." note="Report Avanzato" />
        <ReportCard icon="🤖" l="AI Advisory Card" desc="Valutazione AI della configurazione H2H con suggerimenti su fasce orarie e hotspot." note="Inclusa nel preventivo" />
      </div>
    </motion.div>
  );
}

/* ─── TAB: BUSINESS DISTRIBUTION ─── */
function BizOutputs() {
  return (
    <motion.div key="biz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ExampleBanner />

      {/* 1 — Attività commerciali */}
      <SectionHead n="1" title="Attività commerciali" sub="Database attività rilevate — Google Places" col={C.purple} />
      <Grid>
        <FieldCard l="Attività rilevate" v="3.820" src="Google Places" c={C.purple} />
        <FieldCard l="Attività target" v="2.140" src="Google Places" c={C.green} />
        <FieldCard l="Competitor presenti" v="142" src="Google Places" c={C.red} />
        <FieldCard l="Categorie principali" v="Ristorazione, Retail" src="Google Places" c={C.blue} />
        <FieldCard l="Aree commerciali" v="8" src="Analisi interna" c={C.purple} />
        <FieldCard l="Densità commerciale" v="76/100" src="Analisi interna" c={C.purple} />
        <FieldCard l="Profilo commerciale" v="Retail + Servizi" src="Analisi interna" c={C.white} />
        <FieldCard l="Zona più forte" v="Centro storico" src="Analisi interna" c={C.white} />
      </Grid>

      {/* 2 — Analisi mercato */}
      <SectionHead n="2" title="Analisi mercato" sub="Valori economici e profilo commerciale — Analisi interna / OMI" col={C.teal} />
      <Grid>
        <FieldCard l="Reddito medio stimato" v="€ 28.400/anno" src="Analisi interna" c={C.teal} />
        <FieldCard l="Cluster commerciali" v="8" src="Analisi interna" c={C.purple} />
        <FieldCard l="Fatturato medio zona" v="Medio–alto" src="Analisi interna" c={C.white} />
        <FieldCard l="Stagionalità" v="Costante" src="Analisi interna" c={C.white} />
      </Grid>

      {/* 3 — AI Score */}
      <SectionHead n="3" title="Analisi AI & Score" sub="Score B2B — stesse barre del preventivo" col={C.purple} />
      <Grid>
        <ScoreBar l="Potenziale copertura" v={74} c={C.blue} d="Stima di quante attività puoi raggiungere efficacemente." />
        <ScoreBar l="Efficienza campagna" v={81} c={C.green} d="Rapporto qualità/costo nell'area commerciale." />
        <ScoreBar l="Affidabilità stima" v={86} c={C.purple} d="Precisione dei dati. Più alto = stime più accurate." />
        <ScoreBar l="Business score zona" v={76} c={C.purple} d="Score complessivo dell'area per campagne B2B." />
      </Grid>

      {/* 4 — Output finali */}
      <SectionHead n="4" title="Report & Output finali" sub="Documenti generati al termine della campagna" col={C.indigo} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        <ReportCard icon="📄" l="Report PDF" desc="Documento professionale con attività visitate, categorie, zone coperte e dati aggregati per comune." note="Disponibile dopo campagna" />
        <ReportCard icon="📍" l="Tracking GPS percorso" desc="Mappa percorso con attività commerciali visitate, indirizzi e orari di passaggio certificati." note="Incluso — in tempo reale" />
        <ReportCard icon="📸" l="Foto geolocalizzate" desc="Fotografia di ogni consegna con GPS e timestamp: prova documentale per ogni attività visitata." note="Opzionale — Report Fotografico" />
        <ReportCard icon="🌡️" l="Heatmap attività" desc="Mappa densità delle attività commerciali raggiungibili nell'area selezionata." note="Report Avanzato" />
        <ReportCard icon="📊" l="Dashboard Business" desc="KPI aggregati: attività per categoria, copertura per zona, breakdown comune per comune." note="Report Avanzato" />
        <ReportCard icon="🏆" l="Business Score report" desc="Punteggio e ranking per ogni area e categoria di attività con priorità operative." note="Incluso nel preventivo" />
        <ReportCard icon="🔍" l="Competitor report" desc="Mappa delle attività concorrenti nell'area con densità e posizionamento relativo." note="Report Avanzato" />
        <ReportCard icon="🤖" l="AI Advisory Card" desc="Valutazione AI della configurazione B2B con suggerimenti su categorie e zone prioritarie." note="Inclusa nel preventivo" />
      </div>
    </motion.div>
  );
}

/* ─── TABS CONFIG ─── */
const TABS = [
  { id: "d2d",  label: "Door to Door",          icon: "📬", col: C.orange, Component: D2DOutputs },
  { id: "h2h",  label: "Hand to Hand",           icon: "🤝", col: C.blue,   Component: H2HOutputs },
  { id: "biz",  label: "Business Distribution",  icon: "🏢", col: C.purple, Component: BizOutputs },
];

/* ─── MAIN PAGE ─── */
export default function OutputLibrary({ onNav }) {
  const [active, setActive] = useState("d2d");
  const tab = TABS.find(t => t.id === active);
  const { Component } = tab;

  return (
    <div style={{ minHeight: "100vh", background: C.navy, paddingBottom: 80 }}>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(180deg, #080E1A 0%, ${C.navy} 100%)`, padding: "52px 28px 40px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <button
            onClick={() => onNav("home")}
            style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.35)", fontFamily: F.sans, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 28 }}
          >
            ← Home
          </button>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 14 }}>
            Output Library
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: "clamp(26px,5vw,46px)", color: C.white, letterSpacing: "-1.5px", lineHeight: 1.06, margin: "0 0 14px" }}>
            Tutti gli Output disponibili
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.5)", lineHeight: 1.65, maxWidth: 640, margin: 0 }}>
            Ogni servizio genera output differenti. Questa pagina mostra tutti gli indicatori realmente prodotti dal sistema, con gli stessi componenti e le stesse fonti usate nel configuratore.
          </p>
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(8,14,26,.92)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", display: "flex" }}>
          {TABS.map(t => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                style={{
                  padding: "17px 24px", border: "none", background: "transparent",
                  borderBottom: `2px solid ${on ? t.col : "transparent"}`,
                  color: on ? C.white : "rgba(255,255,255,.4)",
                  fontFamily: F.sans, fontSize: 13, fontWeight: on ? 800 : 500,
                  cursor: "pointer", transition: "all .15s",
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 28px 0" }}>
        <AnimatePresence mode="wait">
          <Component key={active} />
        </AnimatePresence>

        {/* CTA */}
        <div style={{ marginTop: 48, padding: "32px 28px", borderRadius: 18, background: "linear-gradient(135deg, rgba(232,87,26,.1) 0%, rgba(99,102,241,.07) 100%)", border: "1px solid rgba(232,87,26,.2)", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: F.serif, fontSize: "clamp(18px,3vw,26px)", color: C.white, letterSpacing: "-1px", marginBottom: 6 }}>
              Pronto a generare i tuoi output reali?
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", lineHeight: 1.6 }}>
              Avvia il configuratore: selezioni zona e quantità, il sistema calcola tutto automaticamente.
            </div>
          </div>
          <button
            onClick={() => onNav("step1")}
            style={{ padding: "13px 32px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)", color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(232,87,26,.32)", whiteSpace: "nowrap" }}
          >
            Calcola la tua copertura →
          </button>
        </div>
      </div>
    </div>
  );
}
