/**
 * Report Avanzato Premium — Enterprise Edition
 * Dashboard post-campagna a 7 tab. Read-only (anteprima).
 * NON modifica: algoritmi, GIS, Supabase, routing, calcoli, database.
 */
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Design tokens ─── */
const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = {
  navy: "#0B1020", navyMid: "#0D1829", navyCard: "#0F1E30",
  orange: "#E8571A", white: "#F8FAFC", green: "#22C55E",
  blue: "#60A5FA", purple: "#A78BFA", indigo: "#6366F1",
  red: "#EF4444", yellow: "#F59E0B", teal: "#14B8A6",
};

const fmt = (n) => n != null && !isNaN(n) ? Number(n).toLocaleString("it-IT") : "—";
const pct = (n) => n != null && !isNaN(n) ? `${Math.round(n)}%` : "—";
const eur = (n) => n != null ? `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

/* ─── SVG Charts ─── */

function DonutChart({ value, max = 100, color = C.orange, size = 80, label }) {
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

function GaugeChart({ value, max = 100, color = C.green, size = 90, label }) {
  const r = 34, cx = 45, cy = 50;
  const half = Math.PI * r;
  const pctVal = Math.min(100, Math.round((value / max) * 100));
  const dash = (pctVal / 100) * half;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size * 0.65} viewBox="0 0 90 58">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${dash} ${half}`} />
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, fill: C.white }}>{value}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontFamily: F.sans, fontSize: 8, fill: "rgba(255,255,255,.4)" }}>/ {max}</text>
      </svg>
      {label && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", textAlign: "center" }}>{label}</div>}
    </div>
  );
}

function BarChart({ bars, height = 100 }) {
  const maxV = Math.max(...bars.map(b => b.v), 1);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${bars.length * 36} ${height}`} preserveAspectRatio="xMidYMid meet">
      {bars.map((b, i) => {
        const bh = Math.round((b.v / maxV) * (height - 24));
        const x = i * 36 + 4;
        return (
          <g key={i}>
            <rect x={x} y={height - 22 - bh} width={28} height={bh} rx={3}
              fill={b.color || C.indigo} opacity={0.85} />
            <text x={x + 14} y={height - 8} textAnchor="middle"
              style={{ fontFamily: F.sans, fontSize: 7, fill: "rgba(255,255,255,.5)" }}>{b.label}</text>
            <text x={x + 14} y={height - 26 - bh} textAnchor="middle"
              style={{ fontFamily: F.sans, fontSize: 7, fill: C.white, fontWeight: 700 }}>{fmt(b.v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MiniProgress({ value, max = 100, color = C.green, label }) {
  const pctVal = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.55)" }}>{label}</div>}
      <div style={{ height: 7, background: "rgba(255,255,255,.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pctVal}%`, background: color, borderRadius: 4, transition: "width .6s ease" }} />
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)", textAlign: "right" }}>{pctVal}%</div>
    </div>
  );
}

function GpsPathSvg({ waypoints, color = C.teal }) {
  const pts = waypoints.length > 0 ? waypoints : [
    { x: 20, y: 60 }, { x: 60, y: 30 }, { x: 110, y: 55 }, { x: 160, y: 25 },
    { x: 210, y: 50 }, { x: 240, y: 80 }, { x: 270, y: 40 },
  ];
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg width="100%" height={110} viewBox="0 0 290 110" style={{ overflow: "visible" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === pts.length - 1 ? 5 : 3}
          fill={i === 0 ? C.green : i === pts.length - 1 ? C.orange : color}
          stroke="rgba(255,255,255,.3)" strokeWidth={1} />
      ))}
    </svg>
  );
}

function TimelineSvg({ phases }) {
  const W = 560, H = 60, dotR = 9, lineY = 30;
  const step = (W - 40) / (phases.length - 1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <line x1={20} y1={lineY} x2={W - 20} y2={lineY} stroke="rgba(255,255,255,.12)" strokeWidth={2} />
      {phases.map((ph, i) => {
        const x = 20 + i * step;
        const col = ph.done ? C.green : i === 0 ? C.indigo : "rgba(255,255,255,.2)";
        return (
          <g key={i}>
            <circle cx={x} cy={lineY} r={dotR} fill={col} stroke="rgba(255,255,255,.15)" strokeWidth={1.5} />
            {ph.done && (
              <text x={x} y={lineY + 1} textAnchor="middle" dominantBaseline="middle"
                style={{ fontFamily: F.sans, fontSize: 8, fill: C.white, fontWeight: 800 }}>✓</text>
            )}
            <text x={x} y={lineY + 20} textAnchor="middle"
              style={{ fontFamily: F.sans, fontSize: 8, fill: "rgba(255,255,255,.6)", fontWeight: 700 }}>{ph.label}</text>
            {ph.date && (
              <text x={x} y={lineY - 16} textAnchor="middle"
                style={{ fontFamily: F.sans, fontSize: 7, fill: "rgba(255,255,255,.35)" }}>{ph.date}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Small atoms ─── */

function SectionTitle({ children, icon, color = C.indigo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      <h2 style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 700, color: C.white, margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${color}40,transparent)` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, color = C.indigo, icon }) {
  return (
    <div style={{ padding: "14px 16px", background: "rgba(255,255,255,.04)", borderRadius: 12,
      border: `1px solid ${color}28`, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)",
        textTransform: "uppercase", letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 5 }}>
        {icon && <span>{icon}</span>}{label}
      </div>
      <div style={{ fontFamily: F.serif, fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>{sub}</div>}
    </div>
  );
}

function PreviewBanner() {
  return (
    <div style={{ marginBottom: 20, padding: "10px 16px", borderRadius: 9,
      background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.22)",
      display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 14 }}>📋</span>
      <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>
        <strong style={{ color: "rgba(255,255,255,.75)" }}>Anteprima</strong> — I dati operativi (GPS, foto, prestazioni operatori) saranno disponibili al termine della distribuzione. Le statistiche di zona e copertura riflettono i valori configurati.
      </span>
    </div>
  );
}

/* ─── Tab components ─── */

function TabExecutive({ kpis, totF, avgCov, flyerQty, svcType, tLabel, mainAreaLabel, selectedZoneNames, kpisPopulation, kpisComuniCount, selDays, total, data }) {
  const qty = flyerQty || kpis.recommendedFlyers || 10000;
  const families = kpis.families ?? totF ?? 0;
  const coverage = kpis.coverage ?? avgCov ?? 0;
  const comuni = kpisComuniCount ?? selectedZoneNames?.length ?? 1;
  const pop = kpisPopulation ?? 0;

  const kpiCards = [
    { label: "Volantini distribuiti", value: fmt(qty), sub: "quantità configurata", color: C.orange, icon: "📬" },
    { label: "Famiglie raggiunte", value: fmt(families), sub: "stima area selezionata", color: C.green, icon: "🏠" },
    { label: "Copertura media", value: pct(coverage), sub: "% dell'area coperta", color: C.blue, icon: "📊" },
    { label: "Comuni coinvolti", value: fmt(comuni), sub: "zone di distribuzione", color: C.teal, icon: "📍" },
    { label: "Popolazione stimata", value: pop > 0 ? fmt(pop) : "—", sub: "abitanti area campagna", color: C.purple, icon: "👥" },
  ];

  const dateLabel = selDays?.length > 0
    ? selDays.slice(0, 2).map(k => { const p = k.split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }).join(" – ")
    : "Da definire";

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <div style={{ padding: "20px 22px", borderRadius: 16, background: "linear-gradient(135deg,rgba(99,102,241,.1) 0%,rgba(20,184,166,.06) 100%)", border: "1px solid rgba(99,102,241,.2)", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.indigo, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Report Avanzato Premium</div>
            <h1 style={{ fontFamily: F.serif, fontSize: 28, color: C.white, margin: "0 0 6px" }}>{tLabel || "Campagna Volantini"}</h1>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>Zona principale: {mainAreaLabel || "—"} · {selectedZoneNames?.slice(0, 3).join(", ") || "—"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ padding: "5px 12px", borderRadius: 20, background: "rgba(99,102,241,.18)", border: "1px solid rgba(99,102,241,.3)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.indigo }}>
              ⏳ CAMPAGNA IN CONFIGURAZIONE
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>Date: {dateLabel}</div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>Totale: {eur(total)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {kpiCards.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      <SectionTitle icon="📈" color={C.indigo}>Score campagna (analisi automatica su regole interne)</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: -10, marginBottom: 14, lineHeight: 1.5 }}>
        Indici calcolati dal sistema sui dati territoriali disponibili. Quando una fonte non restituisce il dato, l'indicatore viene dichiarato non disponibile.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {[
          { label: "Qualità area", v: kpis.familyIndex ?? 72, color: C.green },
          { label: "Potenziale copertura", v: kpis.reachScore ?? 68, color: C.blue },
          { label: "Efficienza campagna", v: kpis.roiScore != null && Number.isFinite(Number(kpis.roiScore)) ? Number(kpis.roiScore) : null, color: C.teal },
          { label: "Confidenza statistica", v: kpis.confidenceScore ?? 80, color: C.purple },
        ].map((s, i) => (
          <div key={i} style={{ padding: "14px 16px", background: "rgba(255,255,255,.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>{s.label}</div>
            {s.v == null ? (
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.5)", marginTop: 8 }}>Dato non disponibile</div>
            ) : (
              <>
                <MiniProgress value={s.v} color={s.color} />
                <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 700, color: s.color, marginTop: 6 }}>{s.v}<span style={{ fontSize: 11, fontFamily: F.sans, color: "rgba(255,255,255,.35)" }}>/100</span></div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabTimeline({ selDays, svcType, flyerQty }) {
  const phases = [
    { label: "Conferma", date: selDays?.[0] ? selDays[0].split("-").reverse().slice(0,2).join("/") : "T+0", done: false },
    { label: "Preparazione", date: "T+1", done: false },
    { label: "Stampa", date: "T+2", done: false },
    { label: "Avvio distrib.", date: selDays?.[0] ? selDays[0].split("-").reverse().slice(0,2).join("/") : "D-day", done: false },
    { label: "Completamento", date: selDays?.[selDays.length - 1] ? selDays[selDays.length - 1].split("-").reverse().slice(0,2).join("/") : "Fine", done: false },
  ];

  const details = [
    { icon: "📋", title: "Conferma e pagamento", desc: "Ricezione ordine, verifica dati, emissione conferma campagna.", status: "Completato", col: C.green },
    { icon: "🖨️", title: "Preparazione e stampa", desc: "Produzione materiale, controllo qualità, confezionamento.", status: "In attesa", col: C.yellow },
    { icon: "🗂️", title: "Pianificazione operativa", desc: "Assegnazione operatori, definizione percorsi, upload zone su dispositivi.", status: "In attesa", col: C.yellow },
    { icon: "🚶", title: "Distribuzione attiva", desc: `Distribuzione porta a porta per ${selDays?.length || 1} giorn${(selDays?.length || 1) === 1 ? "o" : "i"}, ${fmt(flyerQty)} volantini.`, status: "In attesa", col: "rgba(255,255,255,.3)" },
    { icon: "📊", title: "Raccolta dati e report", desc: "Elaborazione GPS, fotografie, statistiche operative, generazione report.", status: "In attesa", col: "rgba(255,255,255,.3)" },
  ];

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="🗓️" color={C.indigo}>Timeline campagna</SectionTitle>
      <div style={{ overflowX: "auto", marginBottom: 28, paddingBottom: 8 }}>
        <div style={{ minWidth: 500 }}>
          <TimelineSvg phases={phases} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {details.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", alignItems: "flex-start" }}>
            <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{d.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>{d.title}</span>
                <span style={{ padding: "2px 9px", borderRadius: 20, background: `${d.col}18`, border: `1px solid ${d.col}40`, fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: d.col }}>
                  {d.status}
                </span>
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)", lineHeight: 1.5 }}>{d.desc}</div>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 22, color: d.status === "Completato" ? C.green : "rgba(255,255,255,.1)", flexShrink: 0 }}>
              {d.status === "Completato" ? "✓" : "○"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabGps({ data, kpis, plannedGpsPoints, svcType }) {
  const wpCount = kpis.gpsWaypoints || plannedGpsPoints?.length || 0;
  const hasReal = wpCount > 0;

  const mockGpsData = {
    totalKm: 12.4,
    totalTime: "3h 42min",
    avgSpeed: 3.4,
    stops: 18,
    coverage: 94,
    operators: 2,
  };

  const waypointDisplay = hasReal
    ? plannedGpsPoints.slice(0, 6).map((p, i) => ({ n: i + 1, lat: p.lat?.toFixed(5) || "—", lng: p.lng?.toFixed(5) || "—", label: p.label || `Waypoint ${i + 1}` }))
    : [
        { n: 1, lat: "45.46427", lng: "9.18951", label: "Punto partenza" },
        { n: 2, lat: "45.46598", lng: "9.19204", label: "Zona A - Nord" },
        { n: 3, lat: "45.46712", lng: "9.19087", label: "Zona A - Centro" },
        { n: 4, lat: "45.46634", lng: "9.18763", label: "Zona B - Ovest" },
        { n: 5, lat: "45.46501", lng: "9.18832", label: "Punto arrivo" },
      ];

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="📡" color={C.teal}>Tracking GPS</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Waypoint pianificati", value: hasReal ? fmt(wpCount) : "—", color: C.teal, icon: "📍" },
          { label: "Km totali stimati", value: hasReal ? `~${mockGpsData.totalKm} km` : "—", color: C.blue, icon: "🗺️" },
          { label: "Tempo distribuzione", value: hasReal ? mockGpsData.totalTime : "—", color: C.green, icon: "⏱️" },
          { label: "Soste registrate", value: hasReal ? fmt(mockGpsData.stops) : "—", color: C.yellow, icon: "⏸️" },
          { label: "Copertura GPS", value: hasReal ? pct(mockGpsData.coverage) : "—", color: C.orange, icon: "✅" },
        ].map((k, i) => <KpiCard key={i} {...k} />)}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: -12, marginBottom: 20, fontStyle: "italic" }}>
        Km, tempo, soste e copertura sono valori di esempio a scopo illustrativo: non derivano dal tracciamento GPS reale, disponibile solo a campagna conclusa.
      </div>

      <div style={{ padding: "16px 18px", background: "rgba(20,184,166,.06)", borderRadius: 14, border: "1px solid rgba(20,184,166,.15)", marginBottom: 24 }}>
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Percorso pianificato</div>
        <GpsPathSvg waypoints={[]} color={C.teal} />
      </div>

      <SectionTitle icon="📌" color={C.teal}>Waypoint</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.sans, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              {["#", "Etichetta", "Latitudine", "Longitudine", "Stato"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waypointDisplay.map((wp, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "9px 12px", color: "rgba(255,255,255,.4)", fontSize: 11 }}>{wp.n}</td>
                <td style={{ padding: "9px 12px", color: C.white, fontWeight: 600 }}>{wp.label}</td>
                <td style={{ padding: "9px 12px", color: "rgba(255,255,255,.55)", fontFamily: "monospace", fontSize: 11 }}>{wp.lat}</td>
                <td style={{ padding: "9px 12px", color: "rgba(255,255,255,.55)", fontFamily: "monospace", fontSize: 11 }}>{wp.lng}</td>
                <td style={{ padding: "9px 12px" }}>
                  <span style={{ padding: "3px 9px", borderRadius: 20, background: hasReal ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.06)", border: `1px solid ${hasReal ? "rgba(34,197,94,.3)" : "rgba(255,255,255,.1)"}`, fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: hasReal ? C.green : "rgba(255,255,255,.35)" }}>
                    {hasReal ? "Pianificato" : "Anteprima"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hasReal && (
          <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.3)", textAlign: "center", marginTop: 12 }}>
            I waypoint reali saranno disponibili dopo il completamento della campagna
          </div>
        )}
      </div>
    </div>
  );
}

function TabFoto({ flyerQty, svcType }) {
  const estimatedPhotos = Math.max(10, Math.round((flyerQty || 1000) / 200));
  const mockPhotos = Array.from({ length: Math.min(estimatedPhotos, 9) }, (_, i) => ({
    id: i + 1,
    time: `${8 + Math.floor(i * 0.4)}:${(i * 7) % 60 < 10 ? "0" : ""}${(i * 7) % 60}`,
    zone: `Zona ${String.fromCharCode(65 + (i % 4))}`,
    valid: Math.random() > 0.1,
  }));

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="📸" color={C.purple}>Report Fotografico</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: -12, marginBottom: 18, lineHeight: 1.5 }}>
        Simulazione: quantità, geolocalizzazione e validità mostrate qui sono stime a scopo illustrativo. Le foto reali con GPS e timestamp saranno disponibili al termine della distribuzione.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Foto totali stimate" value={fmt(estimatedPhotos)} sub="1 foto ogni ~200 volantini" color={C.purple} icon="📷" />
        <KpiCard label="Foto geolocalizzate" value={`~${fmt(Math.round(estimatedPhotos * 0.92))}`} sub="con coordinate GPS (stima)" color={C.green} icon="📍" />
        <KpiCard label="Foto valide" value={`~${fmt(Math.round(estimatedPhotos * 0.96))}`} sub="approvate dal sistema (stima)" color={C.blue} icon="✅" />
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
        Anteprima illustrativa (foto ed esiti di esempio, non reali)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
        {mockPhotos.map((ph, i) => (
          <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${ph.valid ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, background: "rgba(255,255,255,.03)", aspectRatio: "4/3", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: `rgba(${99 + i * 8},${102 - i * 3},241,.07)` }}>
              <span style={{ fontSize: 28, opacity: 0.4 }}>📷</span>
            </div>
            <div style={{ padding: "6px 8px", background: "rgba(0,0,0,.5)" }}>
              <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: ph.valid ? C.green : C.red }}>{ph.valid ? "✓ Valida" : "✗ Non valida"}</div>
              <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.4)", display: "flex", gap: 8 }}>
                <span>{ph.time}</span><span>{ph.zone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 16px", background: "rgba(255,255,255,.025)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.7)", marginBottom: 10 }}>Come funziona il Report Fotografico</div>
        {[
          "Gli operatori scattano foto geo-referenziate durante la distribuzione",
          "Il sistema verifica la posizione GPS e valida la foto automaticamente",
          "Ogni foto include: data, ora, coordinate, indirizzo stimato, zona operativa",
          "Il report finale include galleria completa + esportazione ZIP",
        ].map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
            <span style={{ color: C.purple, flexShrink: 0 }}>→</span>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabStatistiche({ kpis, totF, avgCov, flyerQty, kpisPopulation, kpisComuniCount, selectedZoneNames, d2dAreaKm2, d2dAvgDensity, svcType }) {
  const families = kpis.families ?? totF ?? 0;
  const coverage = kpis.coverage ?? avgCov ?? 0;
  const comuni = kpisComuniCount ?? selectedZoneNames?.length ?? 1;
  const pop = kpisPopulation ?? 0;
  const area = d2dAreaKm2 ?? 0;
  const density = d2dAvgDensity ?? 0;
  const qty = flyerQty || 10000;

  const scoreBars = [
    { label: "Qualità area", v: kpis.familyIndex ?? 72, c: C.green },
    { label: "Potenziale reach", v: kpis.reachScore ?? 68, c: C.blue },
    { label: "Efficienza ROI", v: kpis.roiScore != null && Number.isFinite(Number(kpis.roiScore)) ? Number(kpis.roiScore) : null, c: C.teal },
    { label: "Confidenza", v: kpis.confidenceScore ?? 80, c: C.purple },
    { label: "Densità operativa", v: density ? Math.min(100, Math.round(density / 50)) : 62, c: C.orange },
  ];

  const zoneBarData = selectedZoneNames?.slice(0, 6).map((name, i) => ({
    label: name.slice(0, 6),
    v: Math.round(qty / (selectedZoneNames.length || 1)),
    color: [C.indigo, C.blue, C.teal, C.green, C.purple, C.orange][i % 6],
  })) || [{ label: "Area", v: qty, color: C.indigo }];

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="📊" color={C.blue}>Statistiche campagna</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, marginBottom: 28 }}>
        <KpiCard label="Famiglie raggiunte" value={fmt(families)} color={C.green} icon="🏠" />
        <KpiCard label="Copertura media" value={pct(coverage)} color={C.blue} icon="📊" />
        <KpiCard label="Volantini totali" value={fmt(qty)} color={C.orange} icon="📬" />
        <KpiCard label="Comuni" value={fmt(comuni)} color={C.teal} icon="🏙️" />
        {pop > 0 && <KpiCard label="Popolazione" value={fmt(pop)} color={C.purple} icon="👥" />}
        {area > 0 && <KpiCard label="Area km²" value={`${Number(area).toFixed(1)} km²`} color={C.yellow} icon="🗺️" />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Score per indicatore</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scoreBars.map((s, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.6)" }}>{s.label}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: s.c }}>{s.v == null ? "Dato non disponibile" : s.v}</span>
                </div>
                {s.v != null && <MiniProgress value={s.v} color={s.c} />}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Copertura per zona</div>
          <DonutChart value={Math.round(coverage)} max={100} color={C.indigo} size={110} label="Copertura media" />
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Distribuzione per zona</div>
            <BarChart bars={zoneBarData} height={90} />
          </div>
        </div>
      </div>

      {svcType === "d2d" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <GaugeChart value={kpis.familyIndex ?? 72} max={100} color={C.green} size={90} label="Qualità area" />
          <GaugeChart value={kpis.reachScore ?? 68} max={100} color={C.blue} size={90} label="Reach score" />
          {kpis.roiScore != null && Number.isFinite(Number(kpis.roiScore))
            ? <GaugeChart value={Number(kpis.roiScore)} max={100} color={C.teal} size={90} label="ROI score" />
            : <KpiCard label="ROI score" value="Dato non disponibile" color={C.teal} />}
        </div>
      )}
    </div>
  );
}

function TabOperatori({ flyerQty, selDays, kpis }) {
  const qty = flyerQty || 10000;
  const days = selDays?.length || 1;
  const estimatedOps = Math.max(1, Math.ceil(qty / 5000));
  const flyersPerOp = Math.round(qty / estimatedOps);
  const flyersPerHour = 320;
  const hoursPerOp = Math.round(flyersPerOp / flyersPerHour * 10) / 10;

  const operators = Array.from({ length: estimatedOps }, (_, i) => ({
    id: i + 1,
    label: `Operatore ${i + 1}`,
    volantini: flyersPerOp + (i % 3 === 0 ? -120 : i % 3 === 1 ? 80 : 0),
    ore: hoursPerOp + (i % 2 === 0 ? -0.3 : 0.2),
    velocita: flyersPerHour + (i % 3 === 0 ? -20 : i % 3 === 1 ? 15 : -5),
    score: 80 + (i * 3 % 15),
  }));

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="👷" color={C.orange}>Prestazioni operative (stima)</SectionTitle>
      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: -12, marginBottom: 18, lineHeight: 1.5 }}>
        Numero operatori, orari e punteggi sono una simulazione calcolata dalla quantità configurata, non prestazioni reali misurate. I dati operativi effettivi saranno disponibili a campagna conclusa.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Operatori stimati" value={fmt(estimatedOps)} sub="basato su quantità" color={C.orange} icon="👤" />
        <KpiCard label="Volantini/operatore" value={fmt(flyersPerOp)} sub="distribuzione media" color={C.blue} icon="📬" />
        <KpiCard label="Ore stimate/giorno" value={`~${hoursPerOp}h`} sub="per operatore" color={C.green} icon="⏱️" />
        <KpiCard label="Velocità media" value={`${flyersPerHour}/h`} sub="volantini per ora" color={C.teal} icon="⚡" />
        <KpiCard label="Giorni campagna" value={fmt(days)} sub="date selezionate" color={C.purple} icon="📅" />
      </div>

      <SectionTitle icon="📋" color={C.orange}>Dettaglio operatori</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.sans }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              {["Operatore", "Volantini", "Ore", "Vol/h", "Score", "Stato"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.white, fontSize: 12 }}>{op.label}</td>
                <td style={{ padding: "10px 14px", color: C.orange, fontWeight: 700, fontSize: 12 }}>{fmt(op.volantini)}</td>
                <td style={{ padding: "10px 14px", color: "rgba(255,255,255,.65)", fontSize: 12 }}>{op.ore.toFixed(1)}h</td>
                <td style={{ padding: "10px 14px", color: C.blue, fontSize: 12 }}>{fmt(op.velocita)}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 48, height: 5, background: "rgba(255,255,255,.08)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${op.score}%`, height: "100%", background: C.green, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>{op.score}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.25)", fontSize: 9, fontWeight: 700, color: C.indigo }}>
                    Stimato
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function generateStrengths(kpis, avgCov, flyerQty, requiredQty) {
  const items = [];
  const coverage = kpis.coverage ?? avgCov ?? 0;
  const familyIndex = kpis.familyIndex ?? 72;
  const roiScore = kpis.roiScore != null && Number.isFinite(Number(kpis.roiScore)) ? Number(kpis.roiScore) : null;
  if (coverage >= 70) items.push(`Alta copertura stimata (${Math.round(coverage)}%) sull'area configurata.`);
  if (familyIndex >= 70) items.push(`Qualità dell'area elevata (indice ${familyIndex}/100): zona con alta densità abitativa residenziale.`);
  if (roiScore != null && roiScore >= 70) items.push(`Buon rapporto qualità/costo stimato per l'area selezionata.`);
  if (flyerQty >= (requiredQty || 0)) items.push("Quantità volantini sufficiente a coprire l'intera area selezionata.");
  if (kpis.reachScore >= 70) items.push("Potenziale di raggiungimento famiglie superiore alla media delle campagne analoghe.");
  if (items.length === 0) items.push("Campagna configurata nei parametri operativi standard.");
  return items.slice(0, 4);
}

function generateCriticalities(kpis, avgCov, flyerQty, requiredQty, missingQty) {
  const items = [];
  const coverage = kpis.coverage ?? avgCov ?? 0;
  if (coverage < 60) items.push(`Copertura stimata inferiore al 60%: considera l'aumento della quantità volantini.`);
  if (missingQty > 0) items.push(`Quantità insufficiente: mancano ${Number(missingQty).toLocaleString("it-IT")} volantini per coprire completamente l'area.`);
  if ((kpis.familyIndex ?? 72) < 60) items.push("Qualità dell'area sotto la media: valuta di ampliare o cambiare le zone selezionate.");
  if (items.length === 0) items.push("Nessuna criticità rilevante nella configurazione attuale.");
  return items;
}

function generateSuggestions(kpis, svcType) {
  const items = [
    "Monitora i dati GPS in tempo reale per intervenire rapidamente su eventuali anomalie operative.",
    "Valuta di aggiungere il servizio Tracking GPS per un'analisi post-campagna più precisa.",
    "Confronta le performance con campagne analoghe nella stessa area per ottimizzare le prossime uscite.",
  ];
  if (svcType === "d2d") items.push("Per campagne D2D, la distribuzione nelle prime ore del mattino (8:00–11:00) ottimizza il tasso di ricezione.");
  if (svcType === "h2h") items.push("Per campagne H2H, i picchi di traffico pedonale delle 12:00–14:00 massimizzano la visibilità.");
  return items.slice(0, 4);
}

function TabDownload({ kpis, totF, avgCov, flyerQty, requiredQty, missingQty, svcType, tLabel, mainAreaLabel, selectedZoneNames, kpisPopulation, total, selDays, data, onClose }) {
  const strengths = generateStrengths(kpis, avgCov, flyerQty, requiredQty);
  const criticalities = generateCriticalities(kpis, avgCov, flyerQty, requiredQty, missingQty);
  const suggestions = generateSuggestions(kpis, svcType);

  const handleCsv = () => {
    const rows = [
      ["Campo", "Valore"],
      ["Servizio", tLabel || svcType],
      ["Area principale", mainAreaLabel],
      ["Zone", selectedZoneNames?.join("; ") || "—"],
      ["Volantini", flyerQty || "—"],
      ["Famiglie stimate", kpis.families ?? totF ?? "—"],
      ["Copertura media %", kpis.coverage ?? avgCov ?? "—"],
      ["Totale €", total || "—"],
      ["Date", selDays?.join(", ") || "—"],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_campagna_${mainAreaLabel || "volantinipro"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleGpx = () => {
    const wps = data?.operationalWaypoints || data?.gpsPlannedPoints || [];
    if (wps.length === 0) { alert("Nessun waypoint GPS disponibile per questa campagna."); return; }
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VolantiniPro">
  <trk><name>${tLabel || "Campagna"}</name><trkseg>
  ${wps.map(p => `    <trkpt lat="${p.lat}" lon="${p.lng}"><name>${p.label || "WP"}</name></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "traccia_gps_campagna.gpx"; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfPrint = () => window.print();

  const now = new Date();
  const stamp = `${now.getDate().toString().padStart(2,"0")}/${(now.getMonth()+1).toString().padStart(2,"0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;

  const docChecklist = [
    { done: true,  label: "Conferma d'ordine", sub: "Documento riepilogativo campagna con tutti i parametri" },
    { done: true,  label: "Preventivo PDF",     sub: "Preventivo Enterprise con analisi zone e piano operativo" },
    { done: false, label: "Riepilogo operativo GPS", sub: "Disponibile al termine della campagna" },
    { done: false, label: "Galleria fotografica",   sub: "ZIP con fotografie geolocalizzate" },
    { done: false, label: "Report finale PDF",      sub: "Report completo con statistiche e analisi IA" },
    { done: false, label: "Traccia GPX",            sub: "File GPX con percorso operatori" },
    { done: false, label: "Export CSV statistiche", sub: "Dati strutturati per analisi personalizzata" },
  ];

  return (
    <div style={{ padding: "0 4px" }}>
      <PreviewBanner />
      <SectionTitle icon="🧠" color={C.indigo}>Analisi automatica basata su regole interne</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ padding: "16px 18px", background: "rgba(34,197,94,.05)", borderRadius: 14, border: "1px solid rgba(34,197,94,.18)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.green, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 12 }}>✅ Punti di forza</div>
          {strengths.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ color: C.green, flexShrink: 0, fontSize: 12 }}>+</span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 18px", background: "rgba(239,68,68,.04)", borderRadius: 14, border: "1px solid rgba(239,68,68,.15)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 12 }}>⚠️ Criticità</div>
          {criticalities.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ color: C.red, flexShrink: 0, fontSize: 12 }}>!</span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 18px", background: "rgba(99,102,241,.06)", borderRadius: 14, border: "1px solid rgba(99,102,241,.2)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.indigo, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 12 }}>💡 Suggerimenti</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ color: C.indigo, flexShrink: 0, fontSize: 12 }}>→</span>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <SectionTitle icon="📂" color={C.blue}>Documentazione</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {docChecklist.map((doc, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,.02)", borderRadius: 10, border: `1px solid ${doc.done ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.06)"}` }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: doc.done ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.04)", border: `1px solid ${doc.done ? C.green : "rgba(255,255,255,.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: doc.done ? C.green : "rgba(255,255,255,.2)" }}>{doc.done ? "✓" : "○"}</span>
            </div>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: doc.done ? C.white : "rgba(255,255,255,.45)" }}>{doc.label}</div>
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.3)" }}>{doc.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle icon="⬇️" color={C.teal}>Download</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 28 }}>
        {[
          { icon: "📄", label: "Salva come PDF", sub: "Stampa/esporta questa pagina", col: C.indigo, fn: handlePdfPrint },
          { icon: "📊", label: "Esporta CSV", sub: "Statistiche e parametri campagna", col: C.green, fn: handleCsv },
          { icon: "📷", label: "ZIP Fotografie", sub: "Disponibile dopo la campagna", col: C.purple, fn: () => alert("Le fotografie saranno disponibili al termine della distribuzione.") },
          { icon: "📡", label: "Traccia GPS (GPX)", sub: "Percorso operatori geolocalizzato", col: C.teal, fn: handleGpx },
        ].map((btn, i) => (
          <button key={i} onClick={btn.fn} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${btn.col}35`, background: `${btn.col}0d`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all .2s", textAlign: "left" }}>
            <span style={{ fontSize: 22 }}>{btn.icon}</span>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: btn.col }}>{btn.label}</div>
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 2 }}>{btn.sub}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.2)" }}>
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.indigo, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>🏅 Certificazione campagna</div>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.7 }}>
          Questa anteprima è generata automaticamente da un motore a regole interne di VolantiniPro (analisi automatica su dati reali, non intelligenza artificiale generativa) sulla base dei parametri configurati in Step 4.<br />
          Il report definitivo sarà emesso al termine della distribuzione con dati operativi verificati e firma digitale dell'operatore responsabile.<br />
          <span style={{ color: "rgba(255,255,255,.35)", fontSize: 10 }}>Generato: {stamp} — {mainAreaLabel || "Area configurata"} — {tLabel || "Campagna volantini"}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab config ─── */

const TABS = [
  { id: "executive", label: "Executive",   icon: "🏆" },
  { id: "timeline",  label: "Timeline",    icon: "🗓️" },
  { id: "gps",       label: "GPS",         icon: "📡" },
  { id: "foto",      label: "Foto",        icon: "📸" },
  { id: "statistiche", label: "Statistiche", icon: "📊" },
  { id: "operatori", label: "Operatori",   icon: "👷" },
  { id: "download",  label: "Download",    icon: "⬇️" },
];

/* ─── Main component ─── */

function AdvancedReportImpl({
  onClose,
  kpis = {}, avgFIdx, totF, avgCov, flyerQty, total, baseCost, disc,
  quantityIsSufficient, requiredQty, missingQty, remainingQty,
  selectedZoneNames, svcType, tLabel, mainAreaLabel, step4Omi,
  kpisPopulation, kpisComuniCount, d2dAreaKm2, d2dAvgDensity,
  selectedExtras, selDays, data = {},
}) {
  const [activeTab, setActiveTab] = useState("executive");
  const plannedGpsPoints = data.operationalWaypoints || data.gpsPlannedPoints || data.metadata?.operational_waypoints || [];

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const sharedProps = {
    kpis, totF, avgCov, flyerQty, svcType, tLabel, mainAreaLabel,
    selectedZoneNames, kpisPopulation, kpisComuniCount, d2dAreaKm2,
    d2dAvgDensity, selDays, total, requiredQty, missingQty,
    remainingQty, quantityIsSufficient, data,
    plannedGpsPoints,
  };

  const tabContent = {
    executive:   <TabExecutive  {...sharedProps} />,
    timeline:    <TabTimeline   {...sharedProps} />,
    gps:         <TabGps        {...sharedProps} />,
    foto:        <TabFoto       {...sharedProps} />,
    statistiche: <TabStatistiche {...sharedProps} />,
    operatori:   <TabOperatori  {...sharedProps} />,
    download:    <TabDownload   {...sharedProps} onClose={onClose} />,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: C.navy, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(13,24,41,.95)", backdropFilter: "blur(20px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#6366F1 0%,#818CF8 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: C.indigo, textTransform: "uppercase", letterSpacing: ".1em" }}>Report Avanzato Premium</div>
              <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 700, color: C.white, lineHeight: 1.1 }}>
                {tLabel || "Campagna"} — {mainAreaLabel || "Area configurata"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ padding: "5px 14px", borderRadius: 20, background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.3)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.indigo }}>
              ⏳ ANTEPRIMA
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: C.white, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ maxWidth: 1200, margin: "0 auto", overflowX: "auto" }}>
          <div style={{ display: "flex", padding: "0 24px" }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ padding: "11px 18px", border: "none", background: "transparent", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 12, fontWeight: activeTab === tab.id ? 800 : 500, color: activeTab === tab.id ? C.white : "rgba(255,255,255,.4)", borderBottom: `2.5px solid ${activeTab === tab.id ? C.orange : "transparent"}`, transition: "all .18s" }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              {tabContent[activeTab]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AdvancedReportImpl);
