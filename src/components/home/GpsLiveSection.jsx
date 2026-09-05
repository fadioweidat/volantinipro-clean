import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const POINTS = [
  "Percorso GPS registrato durante la consegna",
  "Avanzamento zona per zona in tempo reale",
  "Prove fotografiche geolocalizzate",
  "Storico della distribuzione consultabile",
];

// Anteprima demo realistica del tracking operativo SaaS
const DEMO = {
  zone: "Zona 03 · Milano Bovisa – Dergano",
  sub: "Aggiornato 4 min fa · Squadra Alpha · 2 operatori attivi",
  status: "In distribuzione",
  kpisTop: [
    { label: "Operatori attivi", val: "2 / 2" },
    { label: "Avanzamento zona", val: "68%" },
    { label: "Tempo di attività", val: "2h 14m" },
    { label: "Distanza percorsa", val: "8.4 km" },
    { label: "Ultimo aggiornamento", val: "10:28:36" },
  ],
  progress: 68,
  flyersDelivered: "5.440 / 8.000 volantini",
  zonesServed: "5 / 8 zone",
  photos: 12,
  distance: "8.4 km",
  photoList: [
    { street: "Via Bovisasca 14", time: "09:42", type: "cassette", label: "Cassette postali interne" },
    { street: "P.zza Bausan 8", time: "10:15", type: "androne", label: "Androne scala A" },
    { street: "Via Imbonati 32", time: "10:48", type: "ingresso", label: "Ingresso civico 32" },
    { street: "Via Dergano 19", time: "11:22", type: "bifamiliare", label: "Cassetta condominiale" },
  ],
  timeline: [
    { t: "11:22", op: "OP-01", event: "Foto caricata", loc: "Via Dergano 19", isPhoto: true },
    { t: "11:15", op: "OP-01", event: "WP4 raggiunto", loc: "P.zza Bausan", isWp: true },
    { t: "10:48", op: "OP-01", event: "Foto caricata", loc: "Via Imbonati 32", isPhoto: true },
    { t: "10:32", op: "OP-01", event: "WP3 raggiunto", loc: "Via Imbonati", isWp: true },
    { t: "10:18", op: "OP-01", event: "In movimento", loc: "Verso WP3", isMove: true },
  ],
};

function CameraProofIcon({ type }) {
  if (type === "cassette") {
    return (
      <svg width="100%" height="46" viewBox="0 0 100 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", borderRadius: 4, background: "#0a1324" }}>
        {/* Wall background */}
        <rect width="100" height="46" fill="#0d182e" />
        <line x1="0" y1="23" x2="100" y2="23" stroke="#152442" strokeWidth="1" />
        {/* Mailbox grid */}
        <rect x="14" y="8" width="72" height="30" rx="2" fill="#182846" stroke="#2a3f68" strokeWidth="1" />
        {/* Mailbox slots */}
        <rect x="18" y="12" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        <rect x="41" y="12" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        <rect x="64" y="12" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        <rect x="18" y="22" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        <rect x="41" y="22" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        <rect x="64" y="22" width="18" height="6" rx="1" fill="#0c1527" stroke="#374f7c" strokeWidth="0.8" />
        {/* Flyer inserted (orange accent) */}
        <path d="M22 13 L32 13 L30 17 L20 17 Z" fill="#E8571A" opacity="0.9" />
        <path d="M45 23 L55 23 L53 27 L43 27 Z" fill="#E8571A" opacity="0.9" />
        {/* Time watermark */}
        <rect x="60" y="31" width="24" height="6" rx="1" fill="rgba(0,0,0,0.6)" />
        <text x="62" y="35.5" fill="#4ADE80" fontSize="4.5" fontFamily="monospace" fontWeight="bold">09:42 GPS</text>
      </svg>
    );
  }
  if (type === "androne") {
    return (
      <svg width="100%" height="46" viewBox="0 0 100 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", borderRadius: 4, background: "#0a1324" }}>
        <rect width="100" height="46" fill="#0c162a" />
        {/* Doorway / Arch */}
        <path d="M25 46 L25 14 Q50 6 75 14 L75 46" stroke="#2a3f68" strokeWidth="1.2" fill="#132038" />
        <rect x="34" y="16" width="32" height="30" fill="#0a1222" stroke="#223456" strokeWidth="0.8" />
        <line x1="50" y1="16" x2="50" y2="46" stroke="#223456" strokeWidth="0.8" />
        {/* Door handle & flyer slot */}
        <circle cx="46" cy="30" r="1.5" fill="#94A3B8" />
        <circle cx="54" cy="30" r="1.5" fill="#94A3B8" />
        <rect x="38" y="22" width="10" height="3" rx="0.5" fill="#E8571A" opacity="0.85" />
        {/* Watermark */}
        <rect x="60" y="31" width="24" height="6" rx="1" fill="rgba(0,0,0,0.6)" />
        <text x="62" y="35.5" fill="#4ADE80" fontSize="4.5" fontFamily="monospace" fontWeight="bold">10:15 GPS</text>
      </svg>
    );
  }
  if (type === "ingresso") {
    return (
      <svg width="100%" height="46" viewBox="0 0 100 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", borderRadius: 4, background: "#0a1324" }}>
        <rect width="100" height="46" fill="#0b1528" />
        {/* Gate / Fence structure */}
        <rect x="15" y="10" width="70" height="36" fill="#111d33" stroke="#223659" strokeWidth="1" />
        <line x1="25" y1="10" x2="25" y2="46" stroke="#1d2e4d" strokeWidth="1" />
        <line x1="38" y1="10" x2="38" y2="46" stroke="#1d2e4d" strokeWidth="1" />
        <line x1="51" y1="10" x2="51" y2="46" stroke="#1d2e4d" strokeWidth="1" />
        <line x1="64" y1="10" x2="64" y2="46" stroke="#1d2e4d" strokeWidth="1" />
        <line x1="77" y1="10" x2="77" y2="46" stroke="#1d2e4d" strokeWidth="1" />
        {/* External mailbox with flyer */}
        <rect x="30" y="18" width="22" height="16" rx="1.5" fill="#1c2d4a" stroke="#E8571A" strokeWidth="1" />
        <rect x="33" y="21" width="16" height="3" fill="#0a1220" />
        <path d="M35 22 L47 22 L45 28 L33 28 Z" fill="#E8571A" opacity="0.9" />
        {/* Watermark */}
        <rect x="60" y="31" width="24" height="6" rx="1" fill="rgba(0,0,0,0.6)" />
        <text x="62" y="35.5" fill="#4ADE80" fontSize="4.5" fontFamily="monospace" fontWeight="bold">10:48 GPS</text>
      </svg>
    );
  }
  return (
    <svg width="100%" height="46" viewBox="0 0 100 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", borderRadius: 4, background: "#0a1324" }}>
      <rect width="100" height="46" fill="#0d182e" />
      {/* Villa wall & bell panel */}
      <rect x="18" y="8" width="64" height="34" rx="2" fill="#15243e" stroke="#253a60" strokeWidth="1" />
      <rect x="26" y="14" width="20" height="22" rx="1" fill="#0c1526" stroke="#334b75" strokeWidth="0.8" />
      <circle cx="36" cy="19" r="2" fill="#E8571A" />
      <rect x="52" y="14" width="22" height="12" rx="1" fill="#1a2b47" stroke="#334b75" strokeWidth="0.8" />
      <line x1="55" y1="18" x2="71" y2="18" stroke="#E8571A" strokeWidth="2" strokeLinecap="round" />
      {/* Watermark */}
      <rect x="60" y="31" width="24" height="6" rx="1" fill="rgba(0,0,0,0.6)" />
      <text x="62" y="35.5" fill="#4ADE80" fontSize="4.5" fontFamily="monospace" fontWeight="bold">11:22 GPS</text>
    </svg>
  );
}

export default function GpsLiveSection({ onConfigure }) {
  const reduceMotion = useReducedMotion();
  const pathVariants = {
    hidden: { pathLength: 0, opacity: reduceMotion ? 1 : 0 },
    show: { pathLength: 1, opacity: 1, transition: { duration: reduceMotion ? 0 : 1.4, ease: "easeInOut" } },
  };

  return (
    <section
      id="gps-live"
      className="section-tight gps-live-section"
      aria-labelledby="gps-live-title"
      style={{ background: "#0D1527", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <style>{`
        .gps-live-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,38%) minmax(0,62%); gap: 36px; align-items: center; }
        .gps-live-card-body { display: flex; flex-direction: column; gap: 10px; }
        .gps-kpi-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; background: #0A1120; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 6px 10px; margin-bottom: 2px; }
        .gps-kpi-item { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .gps-kpi-lbl { font-family: ${F.sans}; font-size: 8px; font-weight: 700; color: #7E8C9F; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gps-kpi-val { font-family: ${F.sans}; font-size: 11px; font-weight: 800; color: #F8FAFC; font-variant-numeric: tabular-nums; }
        .gps-stat-box { background: #131E33; border: 1px solid rgba(255,255,255,0.07); border-radius: 9px; padding: 8px 10px; transition: border-color 0.2s; }
        .gps-stat-box:hover { border-color: rgba(232,87,26,0.3); }
        .gps-photo-thumb { flex: 1; min-width: 0; border-radius: 7px; background: #131E33; border: 1px solid rgba(255,255,255,0.08); padding: 5px; display: flex; flex-direction: column; gap: 4px; position: relative; overflow: hidden; transition: border-color 0.2s; }
        .gps-photo-thumb:hover { border-color: rgba(232,87,26,0.4); }
        .gps-map-control-btn { width: 22px; height: 22px; border-radius: 4px; background: rgba(11,16,32,0.92); border: 1px solid rgba(255,255,255,0.15); color: #F8FAFC; font-family: ${F.sans}; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
        .gps-map-control-btn:hover { border-color: ${C_ORANGE}; color: ${C_ORANGE}; }
        @media (max-width: 900px) {
          .gps-live-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .gps-kpi-bar { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
        }
        @media (max-width: 540px) {
          .gps-kpi-bar { grid-template-columns: repeat(2, 1fr) !important; }
          .gps-photos-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <div className="gps-live-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 10 }}>
            GPS live
          </div>
          <h2 id="gps-live-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Segui la distribuzione mentre avviene.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: "#AEB9C9", margin: "12px 0 18px" }}>
            Gli operatori registrano il percorso GPS durante la consegna. Tu vedi avanzamento, zone servite e prove raccolte sul campo in tempo reale.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gap: 9 }}>
            {POINTS.map((p) => (
              <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontFamily: F.sans, fontSize: 13, lineHeight: 1.45, color: "#D2DAE6" }}>
                <span style={{ flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: "50%", background: "rgba(232,87,26,0.15)", border: "1px solid rgba(232,87,26,0.4)", color: C_ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ padding: "11px 24px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>

        {/* Mockup Pannello Dispatch / GPS Operativo */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#0B1020", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 20px 50px rgba(0,0,0,0.45)" }}
        >
          {/* Header Mockup */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C_ORANGE }} />
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#F8FAFC", letterSpacing: "-0.01em" }}>{DEMO.zone}</span>
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "#8E9AA8", marginTop: 2 }}>
                {DEMO.sub}
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#4ADE80" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              ● {DEMO.status}
            </span>
          </div>

          {/* KPI bar compatta sopra la mappa */}
          <div className="gps-kpi-bar">
            {DEMO.kpisTop.map((kpi, idx) => (
              <div key={idx} className="gps-kpi-item">
                <span className="gps-kpi-lbl">{kpi.label}</span>
                <span className="gps-kpi-val" style={{ color: idx === 0 ? "#4ADE80" : idx === 1 ? C_ORANGE : "#F8FAFC" }}>{kpi.val}</span>
              </div>
            ))}
          </div>

          <div className="gps-live-card-body">
            {/* Mappa tecnica cartografica realistica Bovisa - Dergano */}
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#060A14", border: "1px solid rgba(255,255,255,0.08)" }}>
              <svg viewBox="0 0 460 220" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto" }}>
                <defs>
                  {/* Pattern griglia tecnica sottile */}
                  <pattern id="darkMapGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                  </pattern>
                  {/* Gradiente zona assegnata */}
                  <linearGradient id="polyZoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(232,87,26,0.12)" />
                    <stop offset="100%" stopColor="rgba(232,87,26,0.02)" />
                  </linearGradient>
                  {/* Glow filtro per marker live */}
                  <filter id="liveMarkerGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Sfondo mappa dark */}
                <rect width="460" height="220" fill="#060A14" />
                <rect width="460" height="220" fill="url(#darkMapGrid)" />

                {/* Parchi e Aree Verdi Urbane */}
                <g fill="#0c1d18" stroke="rgba(34,197,94,0.12)" strokeWidth="0.8">
                  {/* Parco Bovisa / Giardini */}
                  <polygon points="28,26 82,24 88,60 32,62" rx="3" />
                  {/* Giardino Dergano */}
                  <polygon points="340,140 435,138 440,192 345,195" rx="3" />
                  {/* Area Verde Politecnico */}
                  <polygon points="120,24 210,22 205,52 115,54" rx="3" />
                </g>
                <text x="35" y="44" fill="rgba(74,222,128,0.35)" fontSize="5.5" fontFamily={F.sans} fontWeight="700" letterSpacing="0.05em">PARCO BOVISA</text>
                <text x="350" y="165" fill="rgba(74,222,128,0.35)" fontSize="5.5" fontFamily={F.sans} fontWeight="700" letterSpacing="0.05em">PARCO DERGANO</text>

                {/* Edifici / Isolati Residenziali e Commerciali (Building Footprints) */}
                <g fill="#0e1728" stroke="rgba(255,255,255,0.04)" strokeWidth="0.7">
                  {/* Isolati Ovest (Bovisasca) */}
                  <rect x="25" y="72" width="22" height="28" rx="2" />
                  <rect x="52" y="72" width="26" height="28" rx="2" />
                  <rect x="25" y="106" width="53" height="32" rx="2" />
                  <rect x="25" y="145" width="53" height="35" rx="2" />

                  {/* Isolati Centrali Bovisa */}
                  <rect x="90" y="65" width="38" height="24" rx="2" />
                  <rect x="134" y="65" width="42" height="24" rx="2" />
                  <rect x="90" y="95" width="38" height="42" rx="2" />
                  <rect x="134" y="95" width="42" height="42" rx="2" />
                  <rect x="90" y="145" width="86" height="35" rx="2" />

                  {/* Isolati Campus Politecnico Bovisa */}
                  <rect x="185" y="62" width="50" height="28" rx="2" fill="#111c33" stroke="rgba(148,163,184,0.12)" />
                  <rect x="240" y="62" width="44" height="28" rx="2" fill="#111c33" stroke="rgba(148,163,184,0.12)" />
                  <rect x="185" y="96" width="99" height="40" rx="2" fill="#111c33" stroke="rgba(148,163,184,0.12)" />

                  {/* Isolati Imbonati / Dergano Est */}
                  <rect x="295" y="58" width="40" height="32" rx="2" />
                  <rect x="340" y="58" width="46" height="32" rx="2" />
                  <rect x="392" y="58" width="45" height="32" rx="2" />

                  <rect x="295" y="96" width="40" height="40" rx="2" />
                  <rect x="340" y="96" width="46" height="40" rx="2" />
                  <rect x="392" y="96" width="45" height="40" rx="2" />

                  <rect x="295" y="145" width="40" height="35" rx="2" />
                  <rect x="185" y="145" width="99" height="35" rx="2" />
                </g>

                {/* Linea Ferroviaria Stazione Bovisa (Tratteggio Tecnico) */}
                <g stroke="#26344d" strokeWidth="2.2" fill="none">
                  <path d="M 5 190 Q 75 140 115 10 L 115 5" />
                  <path d="M 12 195 Q 82 145 122 10 L 122 5" />
                </g>
                <g stroke="#1a2538" strokeWidth="1" strokeDasharray="2 3">
                  <path d="M 8 192 Q 78 142 118 10" />
                </g>
                {/* Icona Stazione Bovisa */}
                <g transform="translate(68, 122)">
                  <rect x="-3" y="-3" width="22" height="10" rx="2" fill="#10192d" stroke="#3b82f6" strokeWidth="0.8" />
                  <text x="0" y="4.5" fill="#60A5FA" fontSize="4.5" fontFamily={F.sans} fontWeight="800">STAZ. BOVISA</text>
                </g>

                {/* Rete Stradale Reale (Road Network Layers) */}
                {/* Strade Secondarie / Quartiere */}
                <g stroke="#142036" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 20 68 L 445 68" />
                  <path d="M 20 92 L 445 92" />
                  <path d="M 20 140 L 445 140" />
                  <path d="M 85 20 L 85 200" />
                  <path d="M 130 20 L 130 200" />
                  <path d="M 180 20 L 180 200" />
                  <path d="M 290 20 L 290 200" />
                  <path d="M 335 20 L 335 200" />
                  <path d="M 388 20 L 388 200" />
                </g>

                {/* Strade Principali (Arterie Primarie) */}
                <g stroke="#1e2e4a" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {/* Via Bovisasca */}
                  <path d="M 20 185 L 20 20" />
                  {/* Viale Bodio (Arteria Sud Diagonale) */}
                  <path d="M 15 185 L 445 185" />
                  {/* Via Imbonati */}
                  <path d="M 290 205 L 290 15" />
                  {/* Via Dergano */}
                  <path d="M 180 140 L 445 140" />
                  {/* Piazza Bausan (Rotonda / Snodo) */}
                  <circle cx="130" cy="92" r="14" fill="#0c1424" stroke="#253859" strokeWidth="2.5" />
                </g>

                {/* Linee mezzeria stradale sottili */}
                <g stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" fill="none" strokeDasharray="3 3">
                  <path d="M 15 185 L 445 185" />
                  <path d="M 290 205 L 290 15" />
                  <path d="M 20 185 L 20 20" />
                </g>

                {/* Etichette Toponomastica Reale Milano Bovisa / Dergano */}
                <text x="24" y="35" fill="rgba(255,255,255,0.35)" fontSize="6" fontFamily={F.sans} fontWeight="800" letterSpacing="0.06em">VIA BOVISASCA</text>
                <text x="296" y="32" fill="rgba(255,255,255,0.35)" fontSize="6" fontFamily={F.sans} fontWeight="800" letterSpacing="0.06em">VIA IMBONATI</text>
                <text x="130" y="94.5" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="5.5" fontFamily={F.sans} fontWeight="800">P.ZZA BAUSAN</text>
                <text x="195" y="136" fill="rgba(255,255,255,0.35)" fontSize="6" fontFamily={F.sans} fontWeight="800" letterSpacing="0.06em">VIA DERGANO</text>
                <text x="210" y="181" fill="rgba(255,255,255,0.35)" fontSize="6.5" fontFamily={F.sans} fontWeight="800" letterSpacing="0.08em">VIALE BODIO</text>

                {/* Nomi Quartieri / Toponimi Chiave */}
                <text x="45" y="86" fill="rgba(232,87,26,0.35)" fontSize="8.5" fontFamily={F.sans} fontWeight="900" letterSpacing="0.08em">BOVISA</text>
                <text x="350" y="86" fill="rgba(232,87,26,0.35)" fontSize="8.5" fontFamily={F.sans} fontWeight="900" letterSpacing="0.08em">DERGANO</text>

                {/* POI: Politecnico di Milano Bovisa */}
                <g transform="translate(186, 30)">
                  <rect x="0" y="0" width="86" height="12" rx="2" fill="#0f1a30" stroke="rgba(232,87,26,0.35)" strokeWidth="0.8" />
                  <text x="43" y="8" textAnchor="middle" fill="#CBD5E1" fontSize="5" fontFamily={F.sans} fontWeight="800">POLITECNICO DI MILANO BOVISA</text>
                </g>

                {/* Poligono Zona Assegnata (Bordo Arancione Tratteggiato, Fill Trasparente) */}
                <polygon
                  points="16,182 16,30 110,18 285,18 438,45 442,185 270,192 125,185"
                  fill="url(#polyZoneGrad)"
                  stroke={C_ORANGE}
                  strokeWidth="1.6"
                  strokeDasharray="5 3"
                />

                {/* Percorso GPS Reale di Distribuzione (Porta a porta con svolte e zig-zag realistici per isolati) */}
                <motion.path
                  d="
                    M 20 180
                    L 20 140 L 40 140 L 40 148 L 55 148 L 55 140 L 85 140
                    L 85 110 L 70 110 L 70 100 L 85 100 L 85 92
                    L 118 92 L 118 78 L 105 78 L 105 68 L 130 68
                    L 130 92 L 155 92 L 155 80 L 170 80 L 170 92 L 180 92
                    L 180 68 L 220 68 L 220 92 L 250 92 L 250 68 L 290 68
                    L 290 92 L 315 92 L 315 110 L 335 110 L 335 92 L 360 92
                    L 360 115 L 345 115 L 345 130 L 360 130 L 360 140
                    L 310 140 L 310 152 L 290 152 L 290 140 L 260 140
                  "
                  fill="none"
                  stroke={C_ORANGE}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={pathVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                />

                {/* Traccia secondaria OP-02 (Settore Nord Bovisa - Politecnico) */}
                <motion.path
                  d="
                    M 130 68 L 180 68 L 180 35 L 205 35 L 205 68 L 245 68 L 245 45 L 275 45
                  "
                  fill="none"
                  stroke="rgba(232,87,26,0.55)"
                  strokeWidth="2.2"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={pathVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                />

                {/* 4 Waypoint Ufficiali: WP1, WP2, WP3, WP4 */}
                {[
                  { cx: 20, cy: 180, label: "WP1", time: "09:12", street: "Via Bovisasca" },
                  { cx: 130, cy: 92, label: "WP2", time: "09:48", street: "P.zza Bausan" },
                  { cx: 290, cy: 68, label: "WP3", time: "10:22", street: "Via Imbonati" },
                  { cx: 360, cy: 140, label: "WP4", time: "11:05", street: "P.zza Bausan est" },
                ].map((wp, i) => (
                  <g key={i}>
                    <circle cx={wp.cx} cy={wp.cy} r="4.5" fill="#0B1020" stroke={C_ORANGE} strokeWidth="1.8" />
                    <circle cx={wp.cx} cy={wp.cy} r="2" fill={C_ORANGE} />
                    <rect x={wp.cx + 6} y={wp.cy - 7} width="46" height="11" rx="2" fill="rgba(8,14,27,0.92)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
                    <text x={wp.cx + 9} y={wp.cy + 0.5} fill="#FFFFFF" fontSize="5.2" fontFamily={F.sans} fontWeight="800">
                      {wp.label} — {wp.time}
                    </text>
                  </g>
                ))}

                {/* Marker Operatore OP-02 (Attivo / Settore Nord) */}
                <g transform="translate(275, 45)">
                  <circle cx="0" cy="0" r="7" fill="rgba(59,130,246,0.2)" />
                  <circle cx="0" cy="0" r="3.8" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.2" />
                  {/* Tooltip OP-02 */}
                  <rect x="-35" y="-17" width="70" height="12" rx="2.5" fill="rgba(11,16,32,0.92)" stroke="rgba(59,130,246,0.5)" strokeWidth="0.7" />
                  <text x="0" y="-8.5" textAnchor="middle" fill="#93C5FD" fontSize="5" fontFamily={F.sans} fontWeight="800">
                    OP-02 · Attivo (10:26)
                  </text>
                </g>

                {/* Marker Operatore OP-01 (LIVE - Radar Pulse + Freccia Direzione Movimento) */}
                <motion.g
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.8 }}
                  transform="translate(260, 140)"
                >
                  {/* Radar pulse anelli */}
                  <circle cx="0" cy="0" r="16" fill="rgba(232,87,26,0.14)" filter="url(#liveMarkerGlow)" />
                  <circle cx="0" cy="0" r="9" fill="rgba(232,87,26,0.3)" />
                  <circle cx="0" cy="0" r="5" fill={C_ORANGE} stroke="#FFFFFF" strokeWidth="1.8" />

                  {/* Freccia direzione movimento verso ovest */}
                  <path d="M -8 0 L -12 -3 L -12 3 Z" fill="#FFFFFF" />

                  {/* Tooltip operatore OP-01 con dettagli completi */}
                  <g transform="translate(-55, -34)">
                    <rect x="0" y="0" width="112" height="28" rx="3.5" fill="rgba(8,13,26,0.96)" stroke={C_ORANGE} strokeWidth="1" />
                    <circle cx="8" cy="8" r="2.5" fill="#22C55E" />
                    <text x="14" y="10" fill="#FFFFFF" fontSize="6.2" fontFamily={F.sans} fontWeight="900">
                      OP-01 · Squadra Alpha (LIVE)
                    </text>
                    <text x="8" y="17.5" fill="#CBD5E1" fontSize="5.4" fontFamily={F.sans} fontWeight="700">
                      Via Dergano 19
                    </text>
                    <text x="8" y="24" fill="#94A3B8" fontSize="5" fontFamily={F.sans} fontWeight="600">
                      Ultimo segnale: 10:28 · ±3m GPS
                    </text>
                  </g>
                </motion.g>
              </svg>

              {/* HUD: Zona Assegnata in alto a sinistra */}
              <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(8,13,26,0.92)", backdropFilter: "blur(4px)", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(232,87,26,0.35)", fontFamily: F.sans, fontSize: 9, color: "#F8FAFC", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C_ORANGE }} />
                Zona assegnata: Bovisa–Dergano · 1.4 km²
              </div>

              {/* Controlli Mappa a destra (+, -, Centra) */}
              <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" aria-label="Zoom avanti" className="gps-map-control-btn">+</button>
                <button type="button" aria-label="Zoom indietro" className="gps-map-control-btn">–</button>
                <button type="button" aria-label="Centra posizione" title="Centra posizione" className="gps-map-control-btn" style={{ fontSize: 9 }}>🎯</button>
              </div>

              {/* HUD: Coordinate in basso a destra */}
              <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(8,13,26,0.9)", backdropFilter: "blur(4px)", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", fontFamily: F.sans, fontSize: 8.5, color: "#CBD5E1", fontVariantNumeric: "tabular-nums" }}>
                45.5032° N, 9.1724° E · Precisione ±5m
              </div>
            </div>

            {/* Barra avanzamento & metriche di avanzamento */}
            <div style={{ background: "#10192A", borderRadius: 9, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".06em" }}>Avanzamento</span>
                  <span style={{ fontFamily: F.sans, fontSize: 10, color: "#6B7A90" }}>({DEMO.flyersDelivered})</span>
                </div>
                <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: C_ORANGE, fontVariantNumeric: "tabular-nums" }}>{DEMO.progress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <motion.div
                  initial={reduceMotion ? false : { width: 0 }}
                  whileInView={{ width: `${DEMO.progress}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
                  style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C_ORANGE}, #FF8C5A)` }}
                />
              </div>
            </div>

            {/* 3 KPI cards sotto la barra di avanzamento */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Zone servite</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>{DEMO.zonesServed}</div>
              </div>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Foto ricevute</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#4ADE80" }}>{DEMO.photos} prove</div>
              </div>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Percorso</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>{DEMO.distance}</div>
              </div>
            </div>

            {/* Thumbnails 4 prove fotografiche geolocalizzate realistiche */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: F.sans, fontSize: 9.5, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em" }}>Ultime prove fotografiche</span>
                <span style={{ fontFamily: F.sans, fontSize: 9.5, color: C_ORANGE, fontWeight: 700, cursor: "pointer" }}>Vedi tutte →</span>
              </div>
              <div className="gps-photos-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {DEMO.photoList.map((item, idx) => (
                  <div key={idx} className="gps-photo-thumb">
                    <CameraProofIcon type={item.type} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                      <span style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, color: "#F8FAFC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.street}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 7.5, color: "#4ADE80", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{item.time}</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 7.5, color: "#7B8A9E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline attività reale */}
            <div style={{ background: "#10192A", borderRadius: 9, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 5 }}>
              <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".05em" }}>Attività recente</div>
              {DEMO.timeline.map((e, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F.sans, fontSize: 10.5, color: "#CBD5E1" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#6B7A90", fontSize: 9.5, fontWeight: 700, flexShrink: 0, width: 32 }}>{e.t}</span>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: idx === 0 ? "#22C55E" : e.isPhoto ? "#4ADE80" : e.isWp ? C_ORANGE : "#38BDF8", flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, color: "#F8FAFC", fontSize: 10 }}>{e.op} · {e.event}</span>
                  <span style={{ color: "#7B8A9E", fontSize: 9.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.loc}</span>
                </div>
              ))}
            </div>

            {/* Footer label anteprima demo */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 3, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>Anteprima dimostrativa — dati d'esempio</span>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>VolantiniPro Dispatch v2.6</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
