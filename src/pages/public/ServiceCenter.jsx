import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Step1Icon } from "../../components/Step1Icon.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = {
  navy: "#0B1020", navyMid: "#0D1829", navyLight: "#122036",
  orange: "#E8571A", white: "#F8FAFC", green: "#22C55E",
  blue: "#60A5FA", purple: "#A78BFA", indigo: "#6366F1",
  teal: "#14B8A6", slate: "#94A3B8",
};

/* ─── MINI CHARTS ─── */
function Donut({ size = 72, col = C.orange, pct = 67 }) {
  const cx = size / 2, cy = size / 2, R = size * 0.42, r = size * 0.26;
  const sweep = (pct / 100) * 2 * Math.PI;
  const a0 = -Math.PI / 2, a1 = a0 + sweep;
  const x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0);
  const x2 = cx + R * Math.cos(a1), y2 = cy + R * Math.sin(a1);
  const x3 = cx + r * Math.cos(a1), y3 = cy + r * Math.sin(a1);
  const x4 = cx + r * Math.cos(a0), y4 = cy + r * Math.sin(a0);
  const lg = pct > 50 ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={`M${x4},${y4}A${r},${r},0,${lg},1,${x3},${y3}A${R},${R},0,${lg},0,${x1},${y1}Z`} fill={`${col}18`} />
      <path d={`M${x1},${y1}A${R},${R},0,${lg},1,${x2},${y2}L${x3},${y3}A${r},${r},0,${lg},0,${x4},${y4}Z`} fill={col} opacity={0.9} />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={col} fontSize={size * 0.2} fontWeight="800" fontFamily="DM Sans,sans-serif">{pct}%</text>
    </svg>
  );
}

function Gauge({ size = 72, col = C.green, pct = 78 }) {
  const cx = size / 2, cy = size * 0.7, R = size * 0.36;
  const fa = Math.PI + (pct / 100) * Math.PI;
  const x1 = cx - R, y1 = cy, x2 = cx + R * Math.cos(fa), y2 = cy + R * Math.sin(fa), x3 = cx + R, y3 = cy;
  return (
    <svg width={size} height={size * 0.68} viewBox={`0 0 ${size} ${size * 0.68}`}>
      <path d={`M${x1},${y1}A${R},${R},0,0,1,${x3},${y3}`} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={7} strokeLinecap="round" />
      <path d={`M${x1},${y1}A${R},${R},0,${pct > 50 ? 1 : 0},1,${x2},${y2}`} fill="none" stroke={col} strokeWidth={7} strokeLinecap="round" />
      <text x={cx} y={cy - 3} textAnchor="middle" fill={col} fontSize={size * 0.2} fontWeight="800" fontFamily="DM Sans,sans-serif">{pct}%</text>
    </svg>
  );
}

function Bars({ size = 72, col = C.blue, vals = [60, 85, 45, 90, 70] }) {
  const mx = Math.max(...vals);
  const bw = Math.floor((size - 12) / vals.length) - 3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {vals.map((v, i) => {
        const h = Math.max(4, (v / mx) * (size - 16));
        return <rect key={i} x={6 + i * (bw + 3)} y={size - h - 6} width={bw} height={h} rx={3} fill={col} opacity={0.65 + i * 0.07} />;
      })}
    </svg>
  );
}

function Radar({ size = 72, col = C.purple, vals = [0.9, 0.7, 0.85, 0.6, 0.8, 0.75] }) {
  const cx = size / 2, cy = size / 2, R = size * 0.38;
  const n = vals.length;
  const angle = i => (i * 2 * Math.PI / n) - Math.PI / 2;
  const pts = vals.map((v, i) => `${cx + R * v * Math.cos(angle(i))},${cy + R * v * Math.sin(angle(i))}`).join(" ");
  const grid = [0.33, 0.66, 1].map(s =>
    Array.from({ length: n }, (_, i) => `${cx + R * s * Math.cos(angle(i))},${cy + R * s * Math.sin(angle(i))}`).join(" ")
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {grid.map((g, i) => <polygon key={i} points={g} fill="none" stroke={`${col}18`} strokeWidth={1} />)}
      {Array.from({ length: n }, (_, i) => <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(angle(i))} y2={cy + R * Math.sin(angle(i))} stroke={`${col}14`} strokeWidth={1} />)}
      <polygon points={pts} fill={`${col}28`} stroke={col} strokeWidth={1.5} />
    </svg>
  );
}

function Line({ size = 72, col = C.indigo, id = "l" }) {
  const raw = [18, 32, 24, 48, 38, 60, 50, 68, 62, 76];
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx - mn || 1;
  const pts = raw.map((v, i) => ({ x: 4 + (i / (raw.length - 1)) * (size - 8), y: (size - 6) - ((v - mn) / rng) * (size - 18) + 4 }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs><linearGradient id={`gl-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.22" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${pts[pts.length-1].x},${size} L${pts[0].x},${size}Z`} fill={`url(#gl-${id})`} />
      <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={3.5} fill={col} />
    </svg>
  );
}

function Heat({ size = 72, col = C.orange }) {
  const c = 5, cs = (size - 8) / c;
  const v = [.2,.6,.9,.4,.7, .5,.8,.3,.9,.6, .7,.4,.8,.2,.9, .3,.7,.5,.8,.4, .6,.9,.2,.7,.5];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {v.slice(0, c*c).map((val, i) => (
        <rect key={i} x={4 + (i % c) * cs} y={4 + Math.floor(i / c) * cs} width={cs - 2} height={cs - 2} rx={2} fill={col} opacity={val * 0.88} />
      ))}
    </svg>
  );
}

function Ring({ size = 72, col = C.teal, pct = 82 }) {
  const cx = size / 2, cy = size / 2, R = size * 0.36, circ = 2 * Math.PI * R;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={7} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={col} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={col} fontSize={size * 0.2} fontWeight="800" fontFamily="DM Sans,sans-serif">{pct}%</text>
    </svg>
  );
}

function MiniChart({ type, col, id }) {
  if (type === "donut")  return <Donut  size={72} col={col} pct={67} />;
  if (type === "gauge")  return <Gauge  size={72} col={col} pct={78} />;
  if (type === "bars")   return <Bars   size={72} col={col} />;
  if (type === "radar")  return <Radar  size={72} col={col} />;
  if (type === "line")   return <Line   size={72} col={col} id={id} />;
  if (type === "heat")   return <Heat   size={72} col={col} />;
  if (type === "ring")   return <Ring   size={72} col={col} pct={82} />;
  return <Gauge size={72} col={col} pct={75} />;
}

/* ─── SERVICE OUTPUT DATA ─── */
const SERVICES = [
  {
    id: "d2d",
    name: "Door to Door",
    icon: "📬",
    col: C.orange,
    sub: "Distribuzione residenziale in cassetta",
    outputs: [
      {
        icon: "📄",
        name: "Report PDF",
        desc: "Documento completo della campagna: zona distribuita, quantità, percorso operatori e riepilogo dati.",
        chart: "line", col: C.indigo,
        benefit: "Hai la prova documentale completa da conservare o condividere con il tuo team.",
      },
      {
        icon: "📍",
        name: "Tracking GPS percorso",
        desc: "Mappa interattiva con il percorso reale degli operatori, waypoint certificati e orari di passaggio.",
        chart: "heat", col: C.green,
        benefit: "Vedi esattamente dove e quando è avvenuta ogni consegna, senza possibilità di errore.",
      },
      {
        icon: "👨‍👩‍👧",
        name: "Famiglie raggiungibili",
        desc: "Stima certificata del numero di nuclei familiari presenti nell'area selezionata, elaborata su dati ufficiali.",
        chart: "donut", col: C.orange,
        benefit: "Sai quante famiglie riceveranno il tuo volantino prima ancora di iniziare la campagna.",
      },
      {
        icon: "🗺️",
        name: "Mappa di distribuzione",
        desc: "Visualizzazione geografica della zona coperta: comuni, quartieri e aree incluse nella campagna.",
        chart: "heat", col: C.blue,
        benefit: "Vedi la tua campagna disegnata sulla mappa, zona per zona.",
      },
      {
        icon: "📊",
        name: "Copertura dell'area",
        desc: "Percentuale dell'area selezionata effettivamente raggiunta rispetto al totale delle abitazioni presenti.",
        chart: "gauge", col: C.orange,
        benefit: "Conosci in numeri chiari quanta parte del territorio hai realmente coperto.",
      },
      {
        icon: "🏙️",
        name: "Comuni coinvolti",
        desc: "Elenco dettagliato di tutti i comuni inclusi nella distribuzione, con dati per singolo territorio.",
        chart: "bars", col: C.blue,
        benefit: "Pianifichi campagne successive sapendo già dove hai distribuito e con quali risultati.",
      },
      {
        icon: "📸",
        name: "Foto geolocalizzate",
        desc: "30 o più fotografie scattate durante la distribuzione, ciascuna con coordinate GPS e timestamp certificato.",
        chart: "ring", col: C.blue,
        benefit: "Hai la prova visiva del lavoro svolto: ogni foto è georeferenziata e non modificabile.",
      },
      {
        icon: "🔗",
        name: "Smart Pairing",
        desc: "Risparmio automatico quando la tua area coincide con un'altra campagna già programmata nella stessa data.",
        chart: "gauge", col: C.green,
        benefit: "Riduci il costo della distribuzione fino al 20% senza rinunciare a nulla.",
      },
    ],
  },
  {
    id: "h2h",
    name: "Hand to Hand",
    icon: "🤝",
    col: C.blue,
    sub: "Distribuzione diretta mano a mano",
    outputs: [
      {
        icon: "📄",
        name: "Report PDF",
        desc: "Documento completo con punti di distribuzione, orari, contatti stimati e riepilogo operativo.",
        chart: "line", col: C.indigo,
        benefit: "Hai un documento professionale da condividere con clienti o stakeholder.",
      },
      {
        icon: "📍",
        name: "Tracking GPS percorso",
        desc: "Mappa del percorso degli operatori con i punti di sosta, i tempi di distribuzione e i movimenti certificati.",
        chart: "heat", col: C.green,
        benefit: "Verifica dove si sono fermati gli operatori e quanto tempo hanno dedicato a ogni punto.",
      },
      {
        icon: "👥",
        name: "Contatti stimati",
        desc: "Stima del numero di persone fisicamente raggiunte dagli operatori in base ai flussi pedonali dell'area.",
        chart: "gauge", col: C.blue,
        benefit: "Conosci il pubblico effettivamente contattato, non solo la zona coperta.",
      },
      {
        icon: "📌",
        name: "Mappa hotspot",
        desc: "Visualizzazione dei punti ad alto passaggio pedonale selezionati per la distribuzione: piazze, ingressi, fermate.",
        chart: "heat", col: C.blue,
        benefit: "Vedi esattamente i luoghi dove il tuo volantino è stato distribuito con maggiore intensità.",
      },
      {
        icon: "🕐",
        name: "Fasce orarie distribuzione",
        desc: "Dettaglio delle ore in cui è avvenuta la distribuzione, con indicazione del traffico pedonale per fascia.",
        chart: "bars", col: C.orange,
        benefit: "Distribuisci quando il tuo pubblico è presente: massimizzi ogni volantino consegnato.",
      },
      {
        icon: "📸",
        name: "Foto geolocalizzate",
        desc: "Fotografie scattate in ogni punto di distribuzione, con GPS e timestamp certificato per ogni immagine.",
        chart: "ring", col: C.blue,
        benefit: "Documenti il lavoro con prove visive che non possono essere contestate.",
      },
      {
        icon: "🌡️",
        name: "Heatmap pedonale",
        desc: "Mappa a colori che mostra la densità di passaggio nelle aree selezionate nelle ore di distribuzione.",
        chart: "heat", col: C.orange,
        benefit: "Visualizzi in un colpo d'occhio dove la tua campagna ha avuto più impatto.",
      },
      {
        icon: "📋",
        name: "Report operativo finale",
        desc: "Riepilogo completo dell'intera operazione: ore, punti, operatori, contatti, anomalie e note.",
        chart: "bars", col: C.indigo,
        benefit: "Un documento completo che puoi usare per confrontare le campagne e ottimizzare le future.",
      },
    ],
  },
  {
    id: "biz",
    name: "Business Distribution",
    icon: "🏢",
    col: C.purple,
    sub: "Distribuzione mirata a imprese e attività",
    outputs: [
      {
        icon: "📄",
        name: "Report PDF",
        desc: "Documento professionale con attività visitate, categorie, zone coperte e dati aggregati per comune.",
        chart: "line", col: C.indigo,
        benefit: "Hai una reportistica strutturata da consegnare a chi ha commissionato la campagna.",
      },
      {
        icon: "📍",
        name: "Tracking GPS percorso",
        desc: "Mappa del percorso con le attività commerciali visitate, gli indirizzi e gli orari di passaggio certificati.",
        chart: "heat", col: C.green,
        benefit: "Verifica la copertura reale delle attività commerciali visitate dagli operatori.",
      },
      {
        icon: "🏪",
        name: "Aziende raggiungibili",
        desc: "Elenco e conta delle attività commerciali, uffici e imprese presenti nella zona selezionata.",
        chart: "bars", col: C.purple,
        benefit: "Sai quante e quali aziende puoi contattare ancora prima di avviare la campagna.",
      },
      {
        icon: "🗂️",
        name: "Categorie commerciali",
        desc: "Segmentazione delle attività per settore: ristorazione, retail, servizi, artigianato, uffici, ecc.",
        chart: "radar", col: C.purple,
        benefit: "Selezioni solo le categorie rilevanti per il tuo prodotto, eliminando gli sprechi.",
      },
      {
        icon: "🗺️",
        name: "Mappa zone business",
        desc: "Visualizzazione geografica delle aree commerciali con concentrazione di attività per quartiere o comune.",
        chart: "heat", col: C.purple,
        benefit: "Vedi dove si concentra il tessuto commerciale prima di scegliere dove distribuire.",
      },
      {
        icon: "🏆",
        name: "Business score",
        desc: "Punteggio di priorità per ogni area o categoria di attività, basato su densità e potenziale commerciale.",
        chart: "gauge", col: C.purple,
        benefit: "Sai quali zone e quali tipologie di attività vale più la pena raggiungere per prime.",
      },
      {
        icon: "🔍",
        name: "Competitor mappati",
        desc: "Mappa delle attività dello stesso settore nella zona, utile per capire la saturazione del mercato locale.",
        chart: "radar", col: C.orange,
        benefit: "Conosci la concorrenza sul territorio prima ancora di distribuire il tuo volantino.",
      },
      {
        icon: "📸",
        name: "Foto geolocalizzate",
        desc: "Fotografie di ogni consegna con GPS e timestamp: prova documentale per ogni attività visitata.",
        chart: "ring", col: C.purple,
        benefit: "Documenti ogni visita con prove fotografiche verificabili e archiviate per 90 giorni.",
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
        <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{out.icon}</span>
        <div style={{ fontFamily: F.serif, fontSize: 17, color: C.white, letterSpacing: "-.2px", lineHeight: 1.2 }}>{out.name}</div>
      </div>

      {/* Description */}
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.65 }}>
        {out.desc}
      </div>

      {/* Chart */}
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <MiniChart type={out.chart} col={out.col} id={`${out.name}-${index}`} />
      </div>

      {/* Benefit */}
      <div style={{ padding: "12px 14px", borderRadius: 10, background: `${out.col}0d`, border: `1px solid ${out.col}28`, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: out.col, fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>💡</span>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.72)", lineHeight: 1.6 }}>
          {out.benefit}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── QUOTE SELECTION HEADER ─── */
function QuoteSelectionHeader({ onNav }) {
  return (
    <div style={{ background: `linear-gradient(180deg, #0B1020 0%, ${C.navy} 100%)`, padding: "52px 28px 64px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <button
          onClick={() => onNav("home")}
          style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.35)", fontFamily: F.sans, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 28 }}
        >
          ← Home
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 50, gap: 20 }}>
          <div>
            <h1 style={{ fontFamily: F.serif, fontSize: "clamp(40px, 5vw, 64px)", color: C.white, letterSpacing: "-1.5px", lineHeight: 1.05, margin: 0 }}>
              Richiedi un<br/>Preventivo
            </h1>
          </div>
          <div style={{ maxWidth: 400 }}>
            <p style={{ fontFamily: F.sans, fontSize: 18, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5 }}>
              Scegli il percorso più adatto alle esigenze della tua campagna.
            </p>
          </div>
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
            <div style={{ position: "absolute", top: 24, right: 24, background: `${C.green}26`, color: C.green, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
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
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.green }} /> {item}
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
                onClick={() => onNav("step1")}
                style={{ background: C.green, color: C.white, border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 14px ${C.green}30` }}
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
            <div style={{ position: "absolute", top: 24, right: 24, background: `${C.orange}26`, color: C.orange, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
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
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.orange }} /> {item}
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
                onClick={() => onNav("quick")}
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
            <div style={{ position: "absolute", top: 24, right: 24, background: `${C.blue}26`, color: C.blue, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: F.sans, display: "flex", alignItems: "center", gap: 6 }}>
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
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.blue, marginTop: 8 }} /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", marginBottom: 4 }}>TEMPO MEDIO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>Risposta in 24h</div>
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
  const [active, setActive] = useState("d2d");

  const svc = SERVICES.find(s => s.id === active);

  return (
    <div style={{ minHeight: "100vh", background: C.navy, paddingBottom: 80 }}>

      <QuoteSelectionHeader onNav={onNav} />

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
            Seleziona un servizio per vedere tutti gli output reali che produce: report, mappe, GPS, foto, heatmap e tutto ciò che trovi nel tuo portale cliente.
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
                <span style={{ fontSize: 18 }}>{s.icon}</span>
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
              <div style={{ width: 44, height: 44, borderRadius: 11, background: `${svc.col}18`, border: `1px solid ${svc.col}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                {svc.icon}
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
        <div style={{ padding: "36px 32px", borderRadius: 18, background: "linear-gradient(135deg, rgba(232,87,26,.1) 0%, rgba(99,102,241,.07) 100%)", border: "1px solid rgba(232,87,26,.2)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <div style={{ fontFamily: F.serif, fontSize: "clamp(18px,3.5vw,28px)", color: C.white, letterSpacing: "-1px" }}>
            Pronto a ricevere questi output?
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.48)", maxWidth: 480, lineHeight: 1.65 }}>
            Configura la tua campagna {svc.name}: scegli la zona, calcola quante famiglie raggiungi e ricevi tutti gli output sopra nel tuo portale.
          </div>
          <button
            onClick={() => onNav("step1")}
            style={{ padding: "14px 36px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)", color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(232,87,26,.32)" }}
          >
            Configura {svc.name} →
          </button>
        </div>

      </div>
    </div>
  );
}
