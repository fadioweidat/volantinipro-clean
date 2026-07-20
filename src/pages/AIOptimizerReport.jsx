/**
 * AI Optimizer Premium Report — Enterprise Edition
 * Dashboard interattiva a 7 tab. Read-only. Driven completamente dai dati
 * della campagna passati come props da Step 4.
 * NON modifica: algoritmi, GIS, Supabase, routing, calcoli, database.
 */
import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Design tokens ─── */
const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = {
  navy: "#0B1020", navyMid: "#0D1829", navyCard: "#0F1E30",
  orange: "#E8571A", white: "#F8FAFC", green: "#22C55E",
  blue: "#60A5FA", purple: "#A78BFA", indigo: "#6366F1",
  red: "#EF4444", yellow: "#F59E0B", teal: "#14B8A6", cream: "#F5F0E8",
};

const eur = (n) => n != null ? `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT") : "—";
const pct = (n) => n != null ? `${n}%` : "—";

/* ─── SVG Charts ─── */

function DonutChart({ value, max = 100, color = C.orange, size = 80, label, sublabel }) {
  const r = 32, cx = 40, cy = 40;
  const circ = 2 * Math.PI * r;
  const pctVal = Math.min(100, Math.round((value / max) * 100));
  const dash = (pctVal / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={9} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, fill: C.white }}>{pctVal}%</text>
      </svg>
      {label && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.45)", textAlign: "center" }}>{label}</div>}
    </div>
  );
}

function GaugeChart({ value, max = 100, color = C.green, size = 90 }) {
  const r = 34, cx = 45, cy = 50;
  const half = Math.PI * r;
  const pctVal = Math.min(100, Math.round((value / max) * 100));
  const dash = (pctVal / 100) * half;
  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 90 58">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={10} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${dash} ${half}`} />
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, fill: C.white }}>{value}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontFamily: F.sans, fontSize: 8, fill: "rgba(255,255,255,.4)" }}>/ {max}</text>
    </svg>
  );
}

function ProgressRing({ value, max = 100, color = C.blue, size = 60, label }) {
  const r = 24, cx = 30, cy = 30;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(value, max) / max) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={7} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, fill: color }}>{value}</text>
      </svg>
      {label && <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)", textAlign: "center", maxWidth: 58 }}>{label}</div>}
    </div>
  );
}

function RadarChart({ data, size = 160 }) {
  const n = data.length;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const angle = (i) => (i * 2 * Math.PI) / n - Math.PI / 2;
  const pt = (i, ratio) => {
    const a = angle(i);
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)];
  };
  const bg = Array.from({ length: n }, (_, i) => pt(i, 1)).map(([x, y]) => `${x},${y}`).join(" ");
  const fg = data.map((d, i) => pt(i, d.value / 100)).map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(ratio => (
        <polygon key={ratio} points={Array.from({ length: n }, (_, i) => pt(i, ratio)).map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={0.8} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.06)" strokeWidth={0.8} />;
      })}
      <polygon points={fg} fill={`${C.green}30`} stroke={C.green} strokeWidth={1.5} />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.value / 100);
        return <circle key={i} cx={x} cy={y} r={2.5} fill={C.green} />;
      })}
      {data.map((d, i) => {
        const [lx, ly] = pt(i, 1.18);
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: F.sans, fontSize: 7.5, fill: "rgba(255,255,255,.5)" }}>{d.label}</text>;
      })}
    </svg>
  );
}

function LineChart({ points, color = C.green, width = 280, height = 110 }) {
  if (!points || points.length < 2) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.max(0, Math.min(...ys) - 5), yMax = Math.min(100, Math.max(...ys) + 5);
  const px = (x) => 24 + ((x - xMin) / (xMax - xMin || 1)) * (width - 48);
  const py = (y) => height - 20 - ((y - yMin) / (yMax - yMin || 1)) * (height - 36);
  const d = `M ${px(points[0].x)} ${py(points[0].y)} ` +
    points.slice(1).map(p => `L ${px(p.x)} ${py(p.y)}`).join(" ");
  const area = `M ${px(points[0].x)} ${py(points[0].y)} ` +
    points.slice(1).map(p => `L ${px(p.x)} ${py(p.y)}`).join(" ") +
    ` L ${px(points[points.length - 1].x)} ${height - 20} L ${px(points[0].x)} ${height - 20} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lg1)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.x)} cy={py(p.y)} r={3} fill={color} />
          {p.label && <text x={px(p.x)} y={height - 6} textAnchor="middle"
            style={{ fontFamily: F.sans, fontSize: 7, fill: "rgba(255,255,255,.4)" }}>{p.label}</text>}
          {p.yLabel && <text x={px(p.x)} y={py(p.y) - 7} textAnchor="middle"
            style={{ fontFamily: F.sans, fontSize: 7.5, fill: color, fontWeight: 700 }}>{p.yLabel}</text>}
        </g>
      ))}
    </svg>
  );
}

function MiniBar({ values, colors, labels, height = 80 }) {
  const max = Math.max(...values, 1);
  return (
    <svg width={values.length * 36 + 24} height={height} viewBox={`0 0 ${values.length * 36 + 24} ${height}`}>
      {values.map((v, i) => {
        const bh = Math.round(((v / max) * (height - 28)));
        const x = 12 + i * 36;
        return (
          <g key={i}>
            <rect x={x} y={height - 20 - bh} width={24} height={bh} rx={3} fill={colors?.[i] || C.blue} opacity={0.85} />
            <text x={x + 12} y={height - 22 - bh} textAnchor="middle"
              style={{ fontFamily: F.sans, fontSize: 7, fill: colors?.[i] || C.blue, fontWeight: 700 }}>{v}%</text>
            {labels?.[i] && <text x={x + 12} y={height - 6} textAnchor="middle"
              style={{ fontFamily: F.sans, fontSize: 6.5, fill: "rgba(255,255,255,.35)" }}>{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── AI Logic helpers ─── */

function computeQualityIndex(kpis, avgFIdx) {
  const fi = kpis.familyIndex ?? avgFIdx ?? 0;
  const rs = kpis.reachScore ?? 0;
  const roi = kpis.roiScore ?? 0;
  const conf = kpis.confidenceScore ?? 0;
  const scores = [fi, rs, roi, conf].filter(Boolean);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 75;
}

function computeRating(qi) {
  if (qi >= 88) return 5;
  if (qi >= 75) return 4;
  if (qi >= 60) return 3;
  if (qi >= 45) return 2;
  return 1;
}

function renderStars(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function ratingLabel(n) {
  return ["Scarsa", "Sufficiente", "Buona", "Ottima", "Eccellente"][n - 1];
}

function levelLabel(qi) {
  if (qi >= 88) return "Premium";
  if (qi >= 75) return "Avanzato";
  if (qi >= 60) return "Standard";
  return "Base";
}

function generateNarrative(svcType, kpis, avgFIdx, quantityIsSufficient, disc, selectedZoneNames, flyerQty, requiredQty) {
  const qi = computeQualityIndex(kpis, avgFIdx);
  const fi = kpis.familyIndex ?? avgFIdx ?? qi;
  const reach = kpis.reachScore ?? qi;
  const roi = kpis.roiScore ?? qi;
  const area = selectedZoneNames?.[0] || "l'area selezionata";
  const tMap = { d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Business Distribution" };
  const tl = tMap[svcType] || "distribuzione";

  const parts = [];
  parts.push(`La configurazione selezionata è adatta alla distribuzione ${tl} nell'area di ${area}.`);

  if (quantityIsSufficient) {
    parts.push(`La quantità di volantini configurata è sufficiente per coprire l'area target.`);
  } else {
    parts.push(`L'algoritmo rileva che la quantità configurata potrebbe essere ottimizzata: suggerisce ${fmt(requiredQty)} volantini per una copertura più efficace.`);
  }

  if (disc > 0) {
    parts.push(`Smart Pairing attivo: condividendo la distribuzione stai risparmiando il ${disc}% sul costo base.`);
  }

  if (fi >= 80) {
    parts.push(`L'area presenta un'ottima qualità residenziale (Family Index: ${fi}/100), indicativa di alta densità familiare e buona recettività ai materiali promozionali.`);
  } else if (fi >= 65) {
    parts.push(`La qualità dell'area è buona (Family Index: ${fi}/100). Alcune zone perimetrali presentano densità inferiore.`);
  }

  if (reach >= 75) {
    parts.push(`Il potenziale di copertura è elevato (${reach}/100): la maggior parte delle famiglie nell'area è raggiungibile in modo efficiente.`);
  }

  if (roi >= 80) {
    parts.push(`L'efficienza della campagna è alta (ROI Score: ${roi}/100): il rapporto qualità/costo è favorevole per questa zona e questo volume.`);
  }

  return parts.join(" ");
}

function generateWhatWorks(svcType, kpis, avgFIdx, disc, quantityIsSufficient) {
  const fi = kpis.familyIndex ?? avgFIdx ?? 70;
  const rs = kpis.reachScore ?? 70;
  const roi = kpis.roiScore ?? 70;
  const conf = kpis.confidenceScore ?? 80;
  const items = [];
  if (fi >= 70) items.push(`Qualità residenziale dell'area elevata (${fi}/100): zona ad alta densità familiare.`);
  if (rs >= 70) items.push(`Alto potenziale di copertura (${rs}/100): la distribuzione raggiungerà la maggior parte delle famiglie target.`);
  if (roi >= 75) items.push(`Efficienza campagna ottima (${roi}/100): investimento ben calibrato rispetto all'area selezionata.`);
  if (disc > 0) items.push(`Smart Pairing attivo: risparmio del ${disc}% grazie alla condivisione con un'altra campagna compatibile.`);
  if (quantityIsSufficient) items.push("Quantità configurata: sufficiente per coprire l'area target.");
  if (conf >= 80) items.push(`Alta affidabilità dei dati (${conf}/100): le stime sono basate su fonti verificate (ISTAT, GIS).`);
  return items.slice(0, 4);
}

function generateToImprove(kpis, avgFIdx, quantityIsSufficient, requiredQty, flyerQty, disc) {
  const fi = kpis.familyIndex ?? avgFIdx ?? 70;
  const rs = kpis.reachScore ?? 70;
  const roi = kpis.roiScore ?? 70;
  const items = [];
  if (!quantityIsSufficient) items.push(`La quantità attuale (${fmt(flyerQty)} volanini) è inferiore alla raccomandata (${fmt(requiredQty)}): considera di aumentarla per coprire meglio l'area.`);
  if (fi < 65) items.push(`La qualità residenziale dell'area è moderata (${fi}/100): valuta una zona con densità familiare maggiore.`);
  if (rs < 65) items.push(`Il potenziale di copertura è limitato (${rs}/100): alcune famiglie nell'area potrebbero essere difficilmente raggiungibili.`);
  if (roi < 65) items.push(`L'efficienza attuale è migliorabile (${roi}/100): una quantità più vicina alla raccomandata ottimizzerebbe il ROI.`);
  if (disc === 0) items.push("Smart Pairing non attivo: selezionando date compatibili potresti risparmiare fino al 25% sul costo base.");
  return items.slice(0, 3);
}

function generateRecommendations(svcType, kpis, avgFIdx, selectedExtras, disc, quantityIsSufficient, requiredQty, flyerQty) {
  const items = [];
  const hasGPS = selectedExtras?.some(e => e.id === "tracking_gps");
  const hasPhoto = selectedExtras?.some(e => e.id === "photo_proof");
  const hasReport = selectedExtras?.some(e => e.id === "advanced_report");
  if (!quantityIsSufficient) items.push(`Aumenta la quantità a ${fmt(requiredQty)} volantini per raggiungere la copertura ottimale dell'area.`);
  if (!hasGPS) items.push("Aggiungi il Tracking GPS: permette di verificare il percorso reale degli operatori con waypoint certificati.");
  if (!hasPhoto && svcType === "d2d") items.push("Il Report Fotografico fornisce prove geolocalizzate della distribuzione: ideale per documentare l'efficacia della campagna.");
  if (!hasReport) items.push("Il Report Avanzato include 22+ KPI e un riepilogo zona per zona: uno strumento prezioso per misurare i risultati.");
  if (disc === 0) items.push("Verifica le date disponibili per Smart Pairing: potresti ridurre il costo del 15–25% senza modificare il servizio.");
  return items.slice(0, 4);
}

/* ─── Scenario computation ─── */

function buildScenarios(flyerQty, requiredQty, avgCov, totF, baseCovPerQty) {
  const safeBase = baseCovPerQty || (flyerQty > 0 ? (avgCov || 50) / flyerQty : 0.005);
  const covFor = (qty) => Math.min(95, Math.round(safeBase * qty));
  const famFor = (cov) => Math.round((totF || 10000) * (cov / (avgCov || 50)));

  const baseQty = Math.round(flyerQty * 0.65);
  const optQty = requiredQty || Math.round(flyerQty * 1.05);
  const premQty = Math.round(optQty * 1.25);

  return [
    {
      label: "Scenario Base", tag: "BASE", col: C.blue,
      qty: baseQty, cov: covFor(baseQty), fam: famFor(covFor(baseQty)),
      inv: null, pros: ["Investimento ridotto", "Adatto a test campagna"], cons: ["Copertura parziale", "Meno famiglie raggiunte"],
    },
    {
      label: "Scenario Ottimizzato", tag: "RACCOMANDATO", col: C.green,
      qty: optQty, cov: covFor(optQty), fam: famFor(covFor(optQty)),
      inv: null, pros: ["Copertura ottimale", "Miglior rapporto qualità/costo", "Quantità raccomandata dall'AI"], cons: [],
    },
    {
      label: "Scenario Premium", tag: "MAX COPERTURA", col: C.orange,
      qty: premQty, cov: covFor(premQty), fam: famFor(covFor(premQty)),
      inv: null, pros: ["Copertura massima", "Alta densità distribuzione", "Ideale per lanci o promozioni importanti"], cons: ["Investimento più alto"],
    },
  ];
}

/* ─── Small UI atoms ─── */

function StatCard({ label, value, sub, color = C.white, large }) {
  return (
    <div style={{ padding: "16px 18px", background: "rgba(255,255,255,.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,.07)" }}>
      <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: large ? F.serif : F.sans, fontSize: large ? 28 : 20, fontWeight: large ? 400 : 800, color, letterSpacing: large ? "-.5px" : 0, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.38)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, color = C.orange }) {
  return (
    <div style={{ fontFamily: F.serif, fontSize: 20, color: C.white, letterSpacing: "-.3px", marginBottom: 18, borderLeft: `3px solid ${color}`, paddingLeft: 12 }}>
      {children}
    </div>
  );
}

function Chip({ children, color = C.green }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, background: `${color}18`, border: `1px solid ${color}35`, fontFamily: F.sans, fontSize: 9, fontWeight: 800, color, letterSpacing: ".06em", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function BulletItem({ children, icon = "✓", color = C.green }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
      <span style={{ color, fontWeight: 900, fontSize: 12, flexShrink: 0, lineHeight: "20px" }}>{icon}</span>
      <span style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.72)", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function ScoreRow({ label, value, color = C.blue }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.55)" }}>{label}</span>
        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color }}>{value}/100</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

/* ─── TAB CONTENT COMPONENTS ─── */

function TabExecutive({ kpis, avgFIdx, totF, avgCov, flyerQty, total, disc, quantityIsSufficient, requiredQty, selectedZoneNames, svcType, tLabel, kpisPopulation, kpisComuniCount, d2dAreaKm2, selectedExtras }) {
  const qi = computeQualityIndex(kpis, avgFIdx);
  const rating = computeRating(qi);
  const conf = kpis.confidenceScore ?? 85;
  const narrative = generateNarrative(svcType, kpis, avgFIdx, quantityIsSufficient, disc, selectedZoneNames, flyerQty, requiredQty);

  return (
    <div>
      {/* Hero rating */}
      <div style={{ padding: "28px 28px 24px", background: "linear-gradient(135deg, rgba(232,87,26,.1) 0%, rgba(99,102,241,.07) 100%)", borderRadius: 16, border: "1px solid rgba(232,87,26,.18)", marginBottom: 28 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10 }}>AI Optimizer Premium · {tLabel}</div>
            <div style={{ fontFamily: F.serif, fontSize: "clamp(22px,4vw,38px)", color: C.white, letterSpacing: "-1.5px", lineHeight: 1.05, marginBottom: 8 }}>
              {renderStars(rating)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <Chip color={C.orange}>{ratingLabel(rating)}</Chip>
              <Chip color={C.green}>Livello {levelLabel(qi)}</Chip>
              <Chip color={C.purple}>Affidabilità {conf}%</Chip>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.62)", lineHeight: 1.7, maxWidth: 540 }}>
              {narrative}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <DonutChart value={qi} max={100} color={qi >= 80 ? C.green : qi >= 60 ? C.yellow : C.red} size={90} label="Indice qualità" />
            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
              {qi}/100 — {levelLabel(qi)}
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label="Famiglie raggiungibili" value={fmt(kpis.families ?? totF)} color={C.green} />
        <StatCard label="Copertura area" value={pct(kpis.coverage ?? avgCov)} color={C.blue} />
        <StatCard label="Volantini configurati" value={fmt(flyerQty)} color={C.white} />
        <StatCard label="Investimento totale" value={eur(total)} color={C.orange} />
        {kpisPopulation && <StatCard label="Popolazione stimata" value={fmt(kpisPopulation)} color={C.white} />}
        {kpisComuniCount && <StatCard label="Comuni nel raggio" value={kpisComuniCount} color={C.white} />}
        {d2dAreaKm2 && <StatCard label="Superficie analizzata" value={`${d2dAreaKm2} km²`} color={C.white} />}
        {disc > 0 && <StatCard label="Risparmio Smart Pairing" value={`-${disc}%`} color={C.green} />}
      </div>

      {/* AI Score summary */}
      <SectionTitle color={C.purple}>Score campagna (analisi automatica su regole interne)</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: -12, marginBottom: 14, lineHeight: 1.5 }}>
        Indici calcolati dal sistema sui dati territoriali disponibili per la zona selezionata. Se un dato specifico non è disponibile viene mostrato un valore di riferimento standard.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ padding: "16px", background: "rgba(255,255,255,.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,.06)" }}>
          <ScoreRow label="Qualità area (Family Index)" value={kpis.familyIndex ?? avgFIdx ?? 70} color={C.green} />
          <ScoreRow label="Potenziale copertura" value={kpis.reachScore ?? 70} color={C.blue} />
          <ScoreRow label="Efficienza campagna (ROI)" value={kpis.roiScore ?? 70} color={C.green} />
          <ScoreRow label="Affidabilità stima" value={kpis.confidenceScore ?? 80} color={C.purple} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          <RadarChart data={[
            { label: "Qualità", value: kpis.familyIndex ?? avgFIdx ?? 70 },
            { label: "Reach", value: kpis.reachScore ?? 70 },
            { label: "ROI", value: kpis.roiScore ?? 70 },
            { label: "Conf.", value: kpis.confidenceScore ?? 80 },
          ]} size={140} />
        </div>
      </div>

      {/* Campaign quick facts */}
      <SectionTitle color={C.teal}>Riepilogo campagna</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        <StatCard label="Servizio" value={tLabel} />
        <StatCard label="Area principale" value={selectedZoneNames?.[0] || "—"} />
        {selectedZoneNames?.length > 1 && <StatCard label="Zone totali" value={selectedZoneNames.length} />}
        <StatCard label="Quantità raccomandata AI" value={fmt(requiredQty)} color={quantityIsSufficient ? C.green : C.yellow} />
        <StatCard label="Stato copertura" value={quantityIsSufficient ? "Sufficiente ✓" : "Ottimizzabile"} color={quantityIsSufficient ? C.green : C.yellow} />
        {disc > 0 && <StatCard label="Smart Pairing" value={`Attivo (-${disc}%)`} color={C.green} />}
      </div>
    </div>
  );
}

function TabAnalisi({ kpis, avgFIdx, totF, avgCov, flyerQty, kpisPopulation, kpisComuniCount, d2dAreaKm2, d2dAvgDensity, step4Omi, selectedZoneNames, svcType }) {
  const cov = kpis.coverage ?? avgCov ?? 0;
  const families = kpis.families ?? totF ?? 0;
  const fi = kpis.familyIndex ?? avgFIdx ?? 70;

  return (
    <div>
      <SectionTitle color={C.blue}>Analisi territoriale</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 28 }}>
        <StatCard label="Zona principale" value={selectedZoneNames?.[0] || "—"} />
        {selectedZoneNames?.length > 1 && <StatCard label="Zone totali" value={selectedZoneNames.length} />}
        {d2dAreaKm2 && <StatCard label="Superficie" value={`${d2dAreaKm2} km²`} />}
        {kpisComuniCount && <StatCard label="Comuni" value={kpisComuniCount} />}
        <StatCard label="Famiglie" value={fmt(families)} color={C.green} />
        {kpisPopulation && <StatCard label="Popolazione" value={fmt(kpisPopulation)} />}
        <StatCard label="Copertura" value={pct(cov)} color={C.blue} />
        {d2dAvgDensity && <StatCard label="Densità" value={`${fmt(d2dAvgDensity)} ab./km²`} />}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 28 }}>
        <div style={{ padding: "18px", background: "rgba(255,255,255,.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em" }}>Copertura distribuzione</div>
          <DonutChart value={cov} max={100} color={cov >= 70 ? C.green : cov >= 50 ? C.yellow : C.red} size={100} />
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
              <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.5)" }}>Coperta {cov}%</span>
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
              <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.5)" }}>Scoperta {100 - cov}%</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px", background: "rgba(255,255,255,.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em" }}>Score territoriale</div>
          <GaugeChart value={fi} max={100} color={fi >= 80 ? C.green : fi >= 60 ? C.yellow : C.red} size={110} />
          <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)" }}>Family Index: {fi}/100</div>
        </div>

        <div style={{ padding: "18px", background: "rgba(255,255,255,.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Zone selezionate</div>
          {selectedZoneNames?.map((z, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>{z}</span>
              <Chip color={C.blue}>{i === 0 ? "Principale" : `Zona ${i + 1}`}</Chip>
            </div>
          ))}
          {(!selectedZoneNames || selectedZoneNames.length === 0) && (
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.35)" }}>Dato non disponibile</div>
          )}
        </div>
      </div>

      {/* OMI section */}
      {step4Omi?.available && (
        <div>
          <SectionTitle color={C.teal}>Valori di mercato OMI</SectionTitle>
          <div style={{ padding: "16px 18px", background: "rgba(20,184,166,.06)", borderRadius: 12, border: "1px solid rgba(20,184,166,.2)", marginBottom: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
              {step4Omi.municipality && <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Comune</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>{step4Omi.municipality}</div>
              </div>}
              {step4Omi.zone_name && <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Zona OMI</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.teal }}>{step4Omi.zone_name}</div>
              </div>}
            </div>
            {step4Omi.values?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {step4Omi.values.slice(0, 4).map((v, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "rgba(20,184,166,.08)", borderRadius: 8, border: "1px solid rgba(20,184,166,.15)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.35)", textTransform: "uppercase" }}>{v.type || `Tipologia ${i + 1}`}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.teal }}>
                      {v.min && v.max ? `€${v.min}–${v.max}/mq` : v.value ? `€${v.value}/mq` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.25)", marginTop: 8 }}>
              Fonte: {step4Omi.source || "Agenzia delle Entrate – OMI"}
            </div>
          </div>
        </div>
      )}

      {/* Heatmap grid representation — griglia puramente decorativa (Math.random()
          ad ogni render): non rappresenta dati di densità reali della zona. */}
      <SectionTitle color={C.indigo}>Heatmap distribuzione (visualizzazione stilizzata)</SectionTitle>
      <div style={{ padding: "18px", background: "rgba(255,255,255,.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, marginBottom: 10 }}>
          {Array.from({ length: 50 }).map((_, i) => {
            const intensity = Math.random();
            const isActive = i % 3 !== 0 || intensity > 0.3;
            const col = intensity > 0.75 ? C.green : intensity > 0.45 ? C.blue : intensity > 0.2 ? C.indigo : "rgba(255,255,255,.04)";
            return (
              <div key={i} style={{ width: "100%", aspectRatio: 1, borderRadius: 3, background: isActive ? col : "rgba(255,255,255,.02)", opacity: isActive ? 0.6 + intensity * 0.4 : 0.5 }} />
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[{ col: C.green, l: "Alta densità" }, { col: C.blue, l: "Media densità" }, { col: C.indigo, l: "Bassa densità" }].map(({ col, l }) => (
            <div key={l} style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)" }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.3)", marginTop: 10, fontStyle: "italic" }}>
          Griglia illustrativa generata casualmente a scopo grafico — non rappresenta la distribuzione reale dei volantini nell'area.
        </div>
      </div>
    </div>
  );
}

function TabSimulazioni({ flyerQty, requiredQty, avgCov, totF, total, kpis }) {
  const baseCovPerQty = flyerQty > 0 ? (kpis.coverage ?? avgCov ?? 50) / flyerQty : 0.005;
  const scenarios = buildScenarios(flyerQty, requiredQty, kpis.coverage ?? avgCov, kpis.families ?? totF, baseCovPerQty);
  const unitPrice = flyerQty > 0 ? total / flyerQty : 0;

  return (
    <div>
      <SectionTitle color={C.green}>Simulazioni — Scenari a confronto (stima)</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 24, lineHeight: 1.6 }}>
        Il sistema ha calcolato 3 scenari (Base, Ottimizzato, Premium) applicando un'estrapolazione proporzionale alla tua configurazione attuale: sono proiezioni indicative basate su regole interne, non una previsione garantita. Confronta costi, copertura e famiglie raggiunte.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
        {scenarios.map((sc, i) => (
          <div key={sc.label} style={{ padding: "20px", borderRadius: 16, background: `${sc.col}08`, border: `2px solid ${sc.col}${i === 1 ? "50" : "20"}`, position: "relative" }}>
            {i === 1 && (
              <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)" }}>
                <Chip color={C.green}>RACCOMANDATO</Chip>
              </div>
            )}
            <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white, marginBottom: 4 }}>{sc.label}</div>
            <div style={{ marginBottom: 14 }}>
              <DonutChart value={sc.cov} max={100} color={sc.col} size={70} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>Volantini</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: sc.col }}>{fmt(sc.qty)}</div>
              </div>
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>Copertura</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: sc.col }}>{sc.cov}%</div>
              </div>
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>Famiglie</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>{fmt(sc.fam)}</div>
              </div>
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>Investimento est.</div>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>{eur(Math.round(unitPrice * sc.qty))}</div>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              {sc.pros.map((p, j) => <BulletItem key={j} color={sc.col}>{p}</BulletItem>)}
              {sc.cons.map((c, j) => <BulletItem key={j} icon="⚠" color={C.yellow}>{c}</BulletItem>)}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison bar chart */}
      <SectionTitle color={C.indigo}>Confronto visivo</SectionTitle>
      <div style={{ padding: "20px", background: "rgba(255,255,255,.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,.06)", display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginBottom: 10 }}>Copertura per scenario</div>
          <MiniBar
            values={scenarios.map(s => s.cov)}
            colors={scenarios.map(s => s.col)}
            labels={["Base", "Ottimiz.", "Premium"]}
            height={90}
          />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          {scenarios.map((sc) => (
            <div key={sc.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: sc.col, flexShrink: 0 }} />
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.6)", flex: 1 }}>{sc.label}</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: sc.col }}>{sc.cov}% · {fmt(sc.qty)} vol.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabOttimizzazione({ flyerQty, requiredQty, avgCov, totF, kpis }) {
  const baseCov = kpis.coverage ?? avgCov ?? 50;
  const baseFam = kpis.families ?? totF ?? 10000;
  const baseCovPerQty = flyerQty > 0 ? baseCov / flyerQty : 0.005;

  const points = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4].map(ratio => {
    const qty = Math.round((requiredQty || flyerQty) * ratio);
    const cov = Math.min(95, Math.round(baseCovPerQty * qty));
    const fam = Math.round(baseFam * cov / (baseCov || 1));
    return { x: qty, y: cov, label: `${Math.round(qty / 1000)}k`, yLabel: `${cov}%`, families: fam };
  });

  return (
    <div>
      <SectionTitle color={C.yellow}>Ottimizzazione quantità (simulazione)</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 24, lineHeight: 1.6 }}>
        Simulazione basata su un'estrapolazione proporzionale (non una previsione garantita) dell'impatto sulla copertura al variare della quantità di volantini.
      </div>

      {/* Line chart */}
      <div style={{ padding: "20px", background: "rgba(255,255,255,.02)", borderRadius: 14, border: "1px solid rgba(255,255,255,.06)", marginBottom: 24, overflowX: "auto" }}>
        <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>
          Copertura stimata (%) per quantità di volantini
        </div>
        <LineChart points={points} color={C.green} width={340} height={120} />
        <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.25)", marginTop: 6 }}>
          asse X = quantità volantini (migliaia) · asse Y = copertura %
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Quantità", "Copertura", "Famiglie est.", "Note AI"].map(h => (
                <th key={h} style={{ padding: "8px 12px", fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.08)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => {
              const isCurrent = Math.abs(p.x - flyerQty) < (requiredQty || flyerQty) * 0.15;
              const isOpt = Math.abs(p.x - (requiredQty || flyerQty)) < (requiredQty || flyerQty) * 0.1;
              return (
                <tr key={i} style={{ background: isOpt ? "rgba(34,197,94,.06)" : isCurrent ? "rgba(96,165,250,.04)" : "transparent" }}>
                  <td style={{ padding: "9px 12px", fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: isOpt ? C.green : C.white, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    {fmt(p.x)} {isOpt && <Chip color={C.green}>Consigliata AI</Chip>} {isCurrent && !isOpt && <Chip color={C.blue}>Attuale</Chip>}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: F.sans, fontSize: 12, color: p.y >= 70 ? C.green : p.y >= 50 ? C.yellow : C.red, borderBottom: "1px solid rgba(255,255,255,.04)" }}>{p.y}%</td>
                  <td style={{ padding: "9px 12px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>{fmt(p.families)}</td>
                  <td style={{ padding: "9px 12px", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    {isOpt ? "Quantità ottimale — massimo rapporto efficacia/costo" : p.y >= 75 ? "Copertura elevata" : p.y >= 55 ? "Copertura accettabile" : "Copertura parziale"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quantity KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 24 }}>
        <StatCard label="Quantità configurata" value={fmt(flyerQty)} color={C.white} />
        <StatCard label="Quantità raccomandata AI" value={fmt(requiredQty)} color={C.green} />
        <StatCard label="Copertura attuale" value={pct(kpis.coverage ?? avgCov)} color={C.blue} />
        <StatCard label="Copertura ottimale" value={pct(Math.min(95, Math.round(baseCovPerQty * (requiredQty || flyerQty))))} color={C.green} />
      </div>
    </div>
  );
}

function TabSmartPairing({ disc, data, selDays, total, baseCost }) {
  const isActive = disc > 0;
  const saving = baseCost && disc > 0 ? Math.round(baseCost * disc / 100) : null;

  return (
    <div>
      <SectionTitle color={isActive ? C.green : C.yellow}>Smart Pairing AI</SectionTitle>

      <div style={{ padding: "20px 22px", borderRadius: 14, background: isActive ? "rgba(34,197,94,.07)" : "rgba(245,158,11,.06)", border: `1px solid ${isActive ? "rgba(34,197,94,.25)" : "rgba(245,158,11,.2)"}`, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ fontSize: 26 }}>{isActive ? "🔗" : "🔍"}</span>
          <div>
            <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white, marginBottom: 6 }}>
              {isActive ? `Smart Pairing attivo — risparmio ${disc}%` : "Smart Pairing non attivo su questa configurazione"}
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.6 }}>
              {isActive
                ? `La tua campagna è abbinata ad un'altra distribuzione compatibile per zona e periodo. Hai risparmiato il ${disc}% sul costo base della distribuzione condividendo le spese operative.`
                : "Nessuna campagna compatibile trovata per le date selezionate. Modifica il periodo o le zone per verificare la disponibilità di Smart Pairing e risparmiare fino al 25%."}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label="Stato Smart Pairing" value={isActive ? "Attivo ✓" : "Non attivo"} color={isActive ? C.green : C.yellow} />
        <StatCard label="Sconto applicato" value={isActive ? `-${disc}%` : "—"} color={isActive ? C.green : "rgba(255,255,255,.35)"} />
        {saving && <StatCard label="Risparmio stimato" value={eur(saving)} color={C.green} />}
        <StatCard label="Date selezionate" value={selDays?.length > 0 ? `${selDays.length} giorn${selDays.length === 1 ? "o" : "i"}` : "Da definire"} />
      </div>

      {!isActive && (
        <div>
          <SectionTitle color={C.yellow}>Come attivare Smart Pairing</SectionTitle>
          <BulletItem icon="1." color={C.yellow}>Seleziona date specifiche nel calendario dello Step 3.</BulletItem>
          <BulletItem icon="2." color={C.yellow}>Il sistema verifica automaticamente la disponibilità di campagne compatibili nella stessa area.</BulletItem>
          <BulletItem icon="3." color={C.yellow}>Se trovata, il sistema mostra lo sconto disponibile (solitamente 10–25%).</BulletItem>
          <BulletItem icon="4." color={C.yellow}>Confermando, paghi solo la tua quota: il risparmio viene applicato immediatamente sul preventivo.</BulletItem>
        </div>
      )}

      <SectionTitle color={C.blue}>Analisi compatibilità zone</SectionTitle>
      <div style={{ padding: "16px", background: "rgba(255,255,255,.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
          {isActive
            ? "Zona compatibile trovata nella stessa area o in un comune adiacente. La distribuzione verrà eseguita in co-distribuzione con l'altra campagna nelle stesse giornate operative."
            : "Nessuna zona compatibile rilevata per le date indicate. Prova a modificare il periodo o ad allargare il raggio di ricerca."}
        </div>
      </div>

      {/* Potential savings simulation */}
      <SectionTitle color={C.teal}>Simulazione risparmio potenziale</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[10, 15, 25].map(pctDisc => (
          <div key={pctDisc} style={{ padding: "14px", background: "rgba(255,255,255,.03)", borderRadius: 12, border: `1px solid ${isActive && disc === pctDisc ? "rgba(34,197,94,.4)" : "rgba(255,255,255,.06)"}` }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)", textTransform: "uppercase", marginBottom: 6 }}>Sconto -{pctDisc}%</div>
            <div style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 800, color: C.green }}>{eur(Math.round(total * (1 - pctDisc / 100)))}</div>
            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 4 }}>Risparmi {eur(Math.round(total * pctDisc / 100))}</div>
            {isActive && disc === pctDisc && <Chip color={C.green}>Attuale</Chip>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabKpi({ kpis, avgFIdx, totF, avgCov, flyerQty, kpisPopulation, kpisComuniCount, d2dAreaKm2, d2dAvgDensity }) {
  const scores = [
    { l: "Qualità area", v: kpis.familyIndex ?? avgFIdx ?? 70, c: C.green },
    { l: "Potenziale copertura", v: kpis.reachScore ?? 70, c: C.blue },
    { l: "Efficienza campagna", v: kpis.roiScore ?? 70, c: C.green },
    { l: "Affidabilità stima", v: kpis.confidenceScore ?? 80, c: C.purple },
  ];

  return (
    <div>
      <SectionTitle color={C.blue}>Dashboard KPI completa</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: -14, marginBottom: 14, lineHeight: 1.5 }}>
        Indici calcolati dal sistema sui dati territoriali disponibili; in assenza di dato specifico viene mostrato un valore di riferimento standard.
      </div>

      {/* Score rings */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 28, justifyContent: "flex-start" }}>
        {scores.map(s => (
          <div key={s.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <GaugeChart value={s.v} max={100} color={s.c} size={90} />
            <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)", textAlign: "center", maxWidth: 70 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* All score bars */}
      <div style={{ padding: "18px", background: "rgba(255,255,255,.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,.06)", marginBottom: 24 }}>
        {scores.map(s => <ScoreRow key={s.l} label={s.l} value={s.v} color={s.c} />)}
      </div>

      {/* Data KPIs grid */}
      <SectionTitle color={C.teal}>Indicatori campagna</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Famiglie raggiungibili" value={fmt(kpis.families ?? totF)} color={C.green} />
        <StatCard label="Copertura area" value={pct(kpis.coverage ?? avgCov)} color={C.blue} />
        <StatCard label="Volantini totali" value={fmt(flyerQty)} />
        {kpisPopulation && <StatCard label="Popolazione stimata" value={fmt(kpisPopulation)} />}
        {kpisComuniCount && <StatCard label="Comuni coperti" value={kpisComuniCount} />}
        {d2dAreaKm2 && <StatCard label="Area km²" value={`${d2dAreaKm2} km²`} />}
        {d2dAvgDensity && <StatCard label="Densità ab./km²" value={fmt(d2dAvgDensity)} />}
        {kpis.poi && <StatCard label="POI rilevanti" value={fmt(kpis.poi)} />}
        {kpis.businesses && <StatCard label="Attività commerciali" value={fmt(kpis.businesses)} />}
      </div>

      {/* Radar */}
      <SectionTitle color={C.purple}>Radar score</SectionTitle>
      <div style={{ display: "flex", justifyContent: "center", padding: "16px", background: "rgba(255,255,255,.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,.05)" }}>
        <RadarChart data={scores.map(s => ({ label: s.l.split(" ")[0], value: s.v }))} size={180} />
      </div>
    </div>
  );
}

function TabRaccomandazioni({ kpis, avgFIdx, disc, quantityIsSufficient, requiredQty, flyerQty, svcType, selectedExtras }) {
  const whatWorks = generateWhatWorks(svcType, kpis, avgFIdx, disc, quantityIsSufficient);
  const toImprove = generateToImprove(kpis, avgFIdx, quantityIsSufficient, requiredQty, flyerQty, disc);
  const recommendations = generateRecommendations(svcType, kpis, avgFIdx, selectedExtras, disc, quantityIsSufficient, requiredQty, flyerQty);

  return (
    <div>
      {/* What works */}
      <SectionTitle color={C.green}>Cosa funziona ✓</SectionTitle>
      <div style={{ padding: "18px 20px", background: "rgba(34,197,94,.05)", borderRadius: 14, border: "1px solid rgba(34,197,94,.15)", marginBottom: 24 }}>
        {whatWorks.length > 0
          ? whatWorks.map((item, i) => <BulletItem key={i} color={C.green}>{item}</BulletItem>)
          : <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.5)" }}>Nessun punto di forza rilevato. Configura la campagna per ottenere un'analisi completa.</div>
        }
      </div>

      {/* To improve */}
      <SectionTitle color={C.yellow}>Cosa migliorare ⚠</SectionTitle>
      <div style={{ padding: "18px 20px", background: "rgba(245,158,11,.05)", borderRadius: 14, border: "1px solid rgba(245,158,11,.15)", marginBottom: 24 }}>
        {toImprove.length > 0
          ? toImprove.map((item, i) => <BulletItem key={i} icon="⚠" color={C.yellow}>{item}</BulletItem>)
          : <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.5)" }}>Nessuna criticità rilevata per la configurazione attuale. </div>
        }
      </div>

      {/* Recommendations */}
      <SectionTitle color={C.orange}>Cosa consigliamo →</SectionTitle>
      <div style={{ padding: "18px 20px", background: "rgba(232,87,26,.05)", borderRadius: 14, border: "1px solid rgba(232,87,26,.15)", marginBottom: 24 }}>
        {recommendations.length > 0
          ? recommendations.map((item, i) => <BulletItem key={i} icon="→" color={C.orange}>{item}</BulletItem>)
          : <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.5)" }}>Configura la campagna per ricevere raccomandazioni personalizzate.</div>
        }
      </div>
    </div>
  );
}

function TabExtra({ selectedExtras, onAddExtra, onClose }) {
  const suggestions = [
    { id: "tracking_gps", icon: "📍", label: "Tracking GPS", price: 25, col: C.blue, reason: "Certifica il percorso reale degli operatori con waypoint in tempo reale. Fondamentale per verifica qualità." },
    { id: "photo_proof", icon: "📸", label: "Foto geolocalizzate", price: 35, col: C.purple, reason: "30+ foto con GPS e timestamp: prove documentali della distribuzione in ogni punto." },
    { id: "advanced_report", icon: "📊", label: "Report Avanzato", price: 19, col: C.indigo, reason: "22+ KPI, mappa distribuzione e riepilogo zona per zona. Ideale per condividere i risultati con il team." },
    { id: "quality_control", icon: "🔍", label: "Supervisione qualità", price: 25, col: C.teal, reason: "Verifica aggiuntiva sulla corretta esecuzione. Consigliato per campagne di alto valore." },
  ];

  const suggestionsToShow = suggestions.filter(s => !selectedExtras?.some(e => e.id === s.id));

  /* Piano operativo (Pagina 9) */
  const timeline = [
    { icon: "⚙️", step: "Preparazione", desc: "Verifica materiale, assegnazione operatore, pianificazione percorso GIS." },
    { icon: "🚀", step: "Distribuzione", desc: "Distribuzione in zona con tracciamento GPS in tempo reale." },
    { icon: "📡", step: "Monitoraggio", desc: "Supervisione operativa e aggiornamento waypoint durante la campagna." },
    { icon: "📄", step: "Report", desc: "Generazione automatica del report finale con tutti i dati raccolti." },
    { icon: "🤖", step: "Analisi AI", desc: "Il motore AI analizza i dati e produce raccomandazioni per la prossima campagna." },
    { icon: "✅", step: "Campagna completata", desc: "Consegna report, conferma copertura, archivio dati 30 giorni." },
  ];

  return (
    <div>
      {suggestionsToShow.length > 0 && (
        <>
          <SectionTitle color={C.orange}>Extra consigliati dalla AI</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 32 }}>
            {suggestionsToShow.map(s => (
              <div key={s.id} style={{ padding: "18px", borderRadius: 14, background: `${s.col}07`, border: `1px solid ${s.col}22`, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div style={{ fontFamily: F.serif, fontSize: 15, color: C.white }}>{s.label}</div>
                  </div>
                  <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: s.col }}>+{eur(s.price)}</span>
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.52)", lineHeight: 1.55 }}>
                  💡 {s.reason}
                </div>
                <button
                  onClick={() => { onAddExtra?.(s.id); }}
                  style={{ padding: "9px", borderRadius: 9, border: `1px solid ${s.col}40`, background: `${s.col}12`, color: s.col, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  + Aggiungi al preventivo
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {suggestionsToShow.length === 0 && (
        <div style={{ padding: "20px", background: "rgba(34,197,94,.06)", borderRadius: 12, border: "1px solid rgba(34,197,94,.2)", marginBottom: 28, fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>
          ✓ Hai già attivato tutti i servizi consigliati dall'AI. La tua configurazione è completa.
        </div>
      )}

      {/* Piano operativo */}
      <SectionTitle color={C.green}>Piano operativo</SectionTitle>
      <div style={{ position: "relative", paddingLeft: 32 }}>
        <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,.08)" }} />
        {timeline.map((t, i) => (
          <div key={i} style={{ position: "relative", marginBottom: 20 }}>
            <div style={{ position: "absolute", left: -32, top: 0, width: 22, height: 22, borderRadius: "50%", background: C.navyCard, border: "1px solid rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{t.icon}</div>
            <div style={{ padding: "12px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white, marginBottom: 4 }}>{t.step}</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.48)", lineHeight: 1.55 }}>{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Conclusione */}
      <div style={{ padding: "22px 24px", background: "linear-gradient(135deg, rgba(8,14,26,.98) 0%, rgba(15,30,48,.98) 100%)", borderRadius: 14, border: "1px solid rgba(255,255,255,.08)", marginTop: 24 }}>
        <div style={{ fontFamily: F.serif, fontSize: 17, color: C.white, marginBottom: 12 }}>Conclusione</div>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.8 }}>
          La campagna è configurata e pronta per l'attivazione. Tutti i dati territoriali, i KPI di copertura e le analisi AI sono stati elaborati sulla base delle informazioni inserite. Il sistema ha verificato la coerenza tra zona, quantità e servizio selezionato. Seguendo le raccomandazioni indicate è possibile ottimizzare ulteriormente l'efficacia della distribuzione. Al termine della campagna riceverai automaticamente il report con i dati reali della distribuzione.
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.28)", lineHeight: 1.6, fontStyle: "italic" }}>
          Report generato automaticamente da un motore a regole interne di VolantiniPro sulla base della configurazione della campagna e dei dati territoriali disponibili. La nostra AI combina queste regole interne e, per le sintesi del report territoriale avanzato, un modello di intelligenza artificiale generativa che interpreta esclusivamente i dati territoriali reali della zona: i valori numerici e il preventivo definitivo vengono sempre calcolati nel configuratore, mai generati dall'AI.
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <button
          onClick={onClose}
          style={{ padding: "13px 36px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)", color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(232,87,26,.32)" }}
        >
          Conferma e avvia la campagna →
        </button>
      </div>
    </div>
  );
}

/* ─── TABS CONFIG ─── */
const TABS = [
  { id: "summary",       label: "Executive Summary", icon: "🏆" },
  { id: "analisi",       label: "Analisi",            icon: "🗺️" },
  { id: "simulazioni",   label: "Simulazioni",        icon: "🔮" },
  { id: "ottimizzazione",label: "Ottimizzazione",     icon: "📈" },
  { id: "smart-pairing", label: "Smart Pairing",      icon: "🔗" },
  { id: "kpi",           label: "KPI",                icon: "📊" },
  { id: "raccomandazioni",label: "Raccomandazioni",   icon: "💡" },
  { id: "extra",         label: "Extra & Piano",      icon: "🚀" },
];

/* ─── MAIN REPORT ─── */
function AIOptimizerReportImpl({
  onClose,
  onAddExtra,
  kpis = {},
  avgFIdx = 0,
  totF = 0,
  avgCov = 0,
  flyerQty = 0,
  total = 0,
  baseCost = 0,
  disc = 0,
  quantityIsSufficient = true,
  requiredQty = 0,
  missingQty = 0,
  remainingQty = 0,
  selectedZoneNames = [],
  svcType = "d2d",
  tLabel = "Door to Door",
  mainAreaLabel = "—",
  step4Omi = null,
  kpisPopulation = null,
  kpisComuniCount = null,
  d2dAreaKm2 = null,
  d2dAvgDensity = null,
  selectedExtras = [],
  selDays = [],
  data = {},
}) {
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const tabProps = { kpis, avgFIdx, totF, avgCov, flyerQty, total, baseCost, disc, quantityIsSufficient, requiredQty, missingQty, remainingQty, selectedZoneNames, svcType, tLabel, mainAreaLabel, step4Omi, kpisPopulation, kpisComuniCount, d2dAreaKm2, d2dAvgDensity, selectedExtras, selDays, data };

  const renderTab = () => {
    switch (activeTab) {
      case "summary":        return <TabExecutive {...tabProps} />;
      case "analisi":        return <TabAnalisi {...tabProps} />;
      case "simulazioni":    return <TabSimulazioni {...tabProps} />;
      case "ottimizzazione": return <TabOttimizzazione {...tabProps} />;
      case "smart-pairing":  return <TabSmartPairing {...tabProps} />;
      case "kpi":            return <TabKpi {...tabProps} />;
      case "raccomandazioni":return <TabRaccomandazioni {...tabProps} />;
      case "extra":          return <TabExtra {...tabProps} onAddExtra={onAddExtra} onClose={onClose} />;
      default:               return null;
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: C.navy, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ background: "rgba(8,14,26,.97)", borderBottom: "1px solid rgba(255,255,255,.07)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 22 }}>🤖</span>
          <div>
            <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white, letterSpacing: "-.3px" }}>AI Optimizer Premium Report</div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.38)" }}>
              {tLabel} · {mainAreaLabel} · {fmt(flyerQty)} volantini
            </div>
          </div>
          <div style={{ marginLeft: 8 }}>
            <Chip color={C.green}>Enterprise Edition</Chip>
          </div>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.6)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ×
        </button>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ background: "rgba(8,14,26,.9)", borderBottom: "1px solid rgba(255,255,255,.06)", overflowX: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", minWidth: "max-content" }}>
          {TABS.map(t => {
            const on = t.id === activeTab;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding: "12px 18px", border: "none", background: "transparent", borderBottom: `2px solid ${on ? C.orange : "transparent"}`, color: on ? C.white : "rgba(255,255,255,.38)", fontFamily: F.sans, fontSize: 12, fontWeight: on ? 800 : 500, cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AIOptimizerReportImpl);
