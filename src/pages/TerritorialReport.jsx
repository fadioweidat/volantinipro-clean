import React, { useMemo, useState, useCallback } from "react";

/**
 * Report Territoriale Avanzato — dashboard modulare, service-adaptive (D2D / H2H / Business).
 * Pure presentational component: riceve tutti i dati già calcolati da Step2 via props.
 * Nessuna chiamata API qui dentro (Step2 resta l'unica fonte di dati / fetch).
 */

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = { white: "#FFFFFF", navy: "#060D18" };

const SERVICE_COLOR = { d2d: "#4ADE80", h2h: "#38BDF8", b2b: "#FB923C" };
const GRAY = "rgba(255,255,255,.45)";
const CRITICAL = "#F87171";
const COMPARE = "#A855F7";

const NAV_SECTIONS = [
  { id: "panoramica", label: "Panoramica", services: ["d2d", "h2h", "b2b"] },
  { id: "copertura", label: "Copertura e quantità", businessLabel: "Copertura e materiali", services: ["d2d", "h2h", "b2b"] },
  { id: "zone", label: "Zone e priorità", businessLabel: "Zone commerciali", services: ["d2d", "h2h", "b2b"] },
  { id: "demografia", label: "Demografia e target", services: ["d2d", "h2h"] },
  { id: "edifici", label: "Edifici e territorio", services: ["d2d"] },
  { id: "economia", label: "Economia e immobili", services: ["d2d", "h2h"] },
  { id: "mobilita", label: "Mobilità e POI", services: ["h2h"] },
  { id: "imprese", label: "Attività, categorie e aree produttive", services: ["b2b"] },
  { id: "operativo", label: "Percorso e capacità operativa", services: ["b2b"] },
  { id: "score", label: "Score e raccomandazioni", businessLabel: "Score Business e raccomandazioni", services: ["d2d", "h2h", "b2b"] },
  { id: "fonti", label: "Fonti e metodologia", services: ["d2d", "h2h", "b2b"] },
];

function fmtInt(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v)).toLocaleString("it-IT");
}

function NA({ compact = false, children }) {
  return (
    <div
      style={{
        padding: compact ? "8px 12px" : "14px 16px",
        borderRadius: 10,
        background: "rgba(255,255,255,.03)",
        border: "1px dashed rgba(255,255,255,.16)",
        color: GRAY,
        fontFamily: F.sans,
        fontSize: 11.5,
        lineHeight: 1.45,
      }}
    >
      {children || "Dato non disponibile."}
    </div>
  );
}

function Accordion({ title, tone = "#60A5FA", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,.08)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", background: "rgba(255,255,255,.025)", border: "none", cursor: "pointer",
          fontFamily: F.sans, fontSize: 12.5, fontWeight: 800, color: tone, textAlign: "left",
        }}
      >
        <span>{title}</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "14px 16px" }}>{children}</div>}
    </div>
  );
}

function HBar({ label, value, max, color, valueLabel }) {
  const pctVal = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span title={label} style={{ width: "clamp(190px, 28%, 260px)", flexShrink: 0, fontSize: 11.5, color: "rgba(255,255,255,.72)", lineHeight: 1.25, overflowWrap: "anywhere" }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pctVal}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ width: 90, flexShrink: 0, textAlign: "right", fontSize: 11.5, fontWeight: 800, color }} className="vp-data-number">
        {valueLabel != null ? valueLabel : (fmtInt(value) ?? "—")}
      </span>
    </div>
  );
}

function KpiCard({ label, value, unit, source, color, unavailable }) {
  return (
    <div style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${unavailable ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.1)"}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minHeight: 84 }}>
      <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.72)" }}>{label}</div>
      <div style={{ fontFamily: F.sans, fontSize: 21, fontWeight: 800, color: unavailable ? GRAY : (color || C.white) }}>
        {unavailable ? "Dato non disponibile" : `${value}${unit ? ` ${unit}` : ""}`}
      </div>
      {source && !unavailable && <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Fonte: {source}</div>}
    </div>
  );
}

function SectionHeader({ title, eyebrow, tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
      {eyebrow && <span style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 800, color: tone, textTransform: "uppercase", letterSpacing: ".08em" }}>{eyebrow}</span>}
      <span style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 700, color: C.white }}>{title}</span>
    </div>
  );
}

function ZoneTable({ rows, columns, isMobile }) {
  if (!rows || rows.length === 0) return <NA>Nessuna zona disponibile per questa configurazione.</NA>;
  if (isMobile) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row, idx) => (
          <article key={row.id || idx} style={{ display: "grid", gap: 7, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)" }}>
            {columns.map((column) => (
              <div key={column.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 10, alignItems: "start" }}>
                <span style={{ color: "rgba(255,255,255,.45)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".04em" }}>{column.label}</span>
                <span style={{ color: "rgba(255,255,255,.86)", fontSize: 11, textAlign: "right", overflowWrap: "anywhere" }}>{column.render ? column.render(row) : (row[column.key] ?? "—")}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontFamily: F.sans, fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || "left", padding: "8px 10px", color: "rgba(255,255,255,.5)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid rgba(255,255,255,.1)", overflowWrap: "anywhere" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "9px 10px", color: "rgba(255,255,255,.85)", textAlign: c.align || "left", overflowWrap: "anywhere", verticalAlign: "top" }}>
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HEADER
// ---------------------------------------------------------------------------

const REPORT_SUBTITLE = "Report professionale basato sui dati territoriali disponibili, sulle fonti collegate e sui modelli di analisi specifici per il servizio selezionato.";
const AI_EXPLANATION = "L’AI organizza, confronta e interpreta i dati realmente disponibili per produrre priorità territoriali, criticità e raccomandazioni operative. Non genera dati territoriali mancanti e non sostituisce le fonti ufficiali.";

const SERVICE_EXPLANATIONS = {
  d2d: "L’analisi valuta famiglie, fabbisogno operativo, NIL, densità territoriale, quantità assegnata, copertura e capacità distributiva. I dati edilizi vengono utilizzati soltanto quando è disponibile una fonte verificata.",
  h2h: "L’analisi valuta punti di interesse, stazioni, fermate, scuole, università, aree commerciali e potenziale di attrazione territoriale. Non vengono presentati flussi pedonali certi senza una fonte specifica.",
  b2b: "L’analisi valuta attività commerciali, uffici, imprese, punti di consegna e aree produttive. Quando le fonti aziendali o ATECO non sono disponibili, il report viene indicato come parziale.",
};

function reportTerritoryTitle(p) {
  const rawLabel = String(p.territory?.label || "").trim();
  const modeLabel = String(p.territory?.modeLabel || "Territorio selezionato").trim();
  if (!rawLabel) return modeLabel;
  if (rawLabel.includes("·")) return rawLabel.replace(/\s*·\s*/g, " · ");
  if (/^Raggio\s/i.test(rawLabel)) return rawLabel;
  return `${rawLabel} · ${modeLabel}`;
}

function ContextChip({ label, value, tone }) {
  return (
    <span style={{ padding: "5px 10px", borderRadius: 999, background: `${tone || "#60A5FA"}18`, border: `1px solid ${tone || "#60A5FA"}35`, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.84)", maxWidth: "100%", overflowWrap: "anywhere" }}>
      <span style={{ color: "rgba(255,255,255,.52)", fontWeight: 700 }}>{label}: </span>{value}
    </span>
  );
}

function ReportHeader({ p, isMobile, onOpenQuantity, onToggleScenario, onExportPdf, pdfBusy }) {
  const svcColor = SERVICE_COLOR[p.service.key] || SERVICE_COLOR.d2d;
  const title = reportTerritoryTitle(p);
  const zones = p.territory.zoneStats || {};
  const businessSelected = (p.overviewKpis || []).find((item) => item.label?.toLowerCase().includes("selezionate"))?.value;
  const businessAvailable = (p.overviewKpis || []).find((item) => item.label?.toLowerCase().includes("disponibili"))?.value;
  const areaCountLabel = p.service.key === "b2b"
    ? `${businessSelected ?? "—"} / ${businessAvailable ?? "—"}`
    : `${zones.involved ?? p.territory.zoneCount ?? "—"} / ${zones.available ?? p.territory.zoneCount ?? "—"}`;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(6,13,24,.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: isMobile ? "16px 4px 18px" : "20px 4px 22px", marginBottom: 4 }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: svcColor, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 7 }}>{p.service.key === "b2b" ? "REPORT TERRITORIALE BUSINESS" : "ANALISI TERRITORIALE AVANZATA"}</div>
          <div style={{ display: "none", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: svcColor, textTransform: "uppercase", letterSpacing: ".08em" }}>Report Territoriale · {p.service.title}</span>
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: isMobile ? 24 : 31, fontWeight: 700, color: C.white, margin: "0 0 8px 0", lineHeight: 1.12 }}>{title}</h2>
          <div style={{ maxWidth: 760, fontFamily: F.sans, fontSize: 12.5, color: "rgba(255,255,255,.68)", lineHeight: 1.45, marginBottom: 12 }}>{p.service.key === "b2b" ? "Analizza attività, categorie commerciali, concentrazione territoriale, materiali necessari, priorità e capacità operativa." : REPORT_SUBTITLE}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ContextChip label="Servizio" value={p.service.title} tone={svcColor} />
            <ContextChip label="Quantità" value={`${fmtInt(p.quantity.inserted) ?? "—"} pz.`} tone="#38BDF8" />
            <ContextChip label="Copertura operativa" value={p.coverage.label || "Dato non disponibile"} tone="#4ADE80" />
            <ContextChip label={p.service.key === "b2b" ? "Attività selezionate / disponibili" : "Zone coinvolte / disponibili"} value={areaCountLabel} tone="#60A5FA" />
            <ContextChip label="Fonti e modelli disponibili" value={p.dataStatusLabel || "Dato non disponibile"} tone="#FBBF24" />
          </div>
          <div style={{ display: "none", flexWrap: "wrap", gap: 8 }}>
            {[
              p.territory.modeLabel,
              `${fmtInt(p.quantity.inserted) ?? "—"} pz.`,
              p.coverage.label ? `Copertura ${p.coverage.label}` : null,
              `${p.territory.zoneCount} zone`,
              p.dataStatusLabel,
            ].filter(Boolean).map((chip, i) => (
              <span key={i} style={{ padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", fontSize: 11, color: "rgba(255,255,255,.75)" }}>{chip}</span>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", marginTop: 8 }}>Ultimo aggiornamento fonti: {p.lastUpdateLabel}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
          <button onClick={p.onBack} style={btnStyle("rgba(255,255,255,.06)", "rgba(255,255,255,.16)", "rgba(255,255,255,.85)")}>← Torna alla configurazione</button>
          <button onClick={onOpenQuantity} style={btnStyle("rgba(56,189,248,.1)", "rgba(56,189,248,.35)", "#38BDF8")}>Modifica quantità</button>
          <button onClick={onToggleScenario} style={btnStyle(`rgba(168,85,247,.1)`, "rgba(168,85,247,.35)", COMPARE)}>Confronta scenari</button>
          <button onClick={onExportPdf} disabled={pdfBusy} style={btnStyle("rgba(232,87,26,.12)", "rgba(232,87,26,.4)", "#E8571A", pdfBusy)}>{pdfBusy ? "Generazione…" : "Esporta PDF"}</button>
        </div>
        <div style={{ display: "none", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
          <button onClick={p.onBack} style={btnStyle("rgba(255,255,255,.06)", "rgba(255,255,255,.16)", "rgba(255,255,255,.85)")}>← Vista Cliente</button>
          <button onClick={onOpenQuantity} style={btnStyle("rgba(56,189,248,.1)", "rgba(56,189,248,.35)", "#38BDF8")}>Modifica quantità</button>
          <button onClick={onToggleScenario} style={btnStyle(`rgba(168,85,247,.1)`, "rgba(168,85,247,.35)", COMPARE)}>Confronta scenario</button>
          <button onClick={onExportPdf} disabled={pdfBusy} style={btnStyle("rgba(232,87,26,.12)", "rgba(232,87,26,.4)", "#E8571A", pdfBusy)}>{pdfBusy ? "Generazione…" : "Esporta PDF"}</button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg, border, color, disabled) {
  return {
    padding: "9px 14px", borderRadius: 10, background: bg, border: `1px solid ${border}`, color,
    fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap",
  };
}

function QuantityPopover({ p, onClose }) {
  const q = p.quantity;
  return (
    <div style={{ background: "#0B1220", border: "1px solid rgba(56,189,248,.3)", borderRadius: 14, padding: 18, marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>Modifica quantità</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button onClick={() => q.onSelectDecision("keepCurrent")} style={pillStyle(q.decision === "keepCurrent")}>Mantieni {fmtInt(q.inserted)} pz.</button>
        <button onClick={() => q.onSelectDecision("useRecommended")} style={pillStyle(q.decision === "useRecommended")}>Usa consigliata ({fmtInt(q.recommended)} pz.)</button>
        <button onClick={() => q.onSelectDecision("manual")} style={pillStyle(q.decision === "manual")}>Personalizza</button>
      </div>
      {q.decision === "manual" && (
        <input
          type="number"
          value={q.manual ?? ""}
          onChange={(e) => q.onManualChange(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.16)", color: C.white, fontFamily: F.sans, fontSize: 13, width: 180 }}
        />
      )}
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontFamily: F.sans, fontSize: 12, fontWeight: 700,
    background: active ? "rgba(56,189,248,.18)" : "rgba(255,255,255,.04)",
    border: `1px solid ${active ? "rgba(56,189,248,.5)" : "rgba(255,255,255,.14)"}`,
    color: active ? "#38BDF8" : "rgba(255,255,255,.75)",
  };
}

function ScenarioComparePanel({ p, onClose }) {
  const q = p.quantity;
  const scenarios = [
    { label: "Scenario attuale", value: q.inserted, color: "#38BDF8" },
    { label: "Scenario consigliato", value: q.recommended, color: "#4ADE80" },
  ];
  if (q.decision === "manual" && q.manual) scenarios.push({ label: "Scenario personalizzato", value: Number(q.manual), color: COMPARE });
  const max = Math.max(...scenarios.map((s) => s.value || 0), 1);
  return (
    <div style={{ background: "#0B1220", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 14, padding: 18, marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>Confronto scenari</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {scenarios.map((s) => (
          <HBar key={s.label} label={s.label} value={s.value} max={max} color={s.color} valueLabel={`${fmtInt(s.value)} pz.`} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTIONS
// ---------------------------------------------------------------------------

function SectionPanoramica({ p, isMobile }) {
  const svcColor = SERVICE_COLOR[p.service.key];
  const kpis = p.overviewKpis;
  const serviceExplanation = SERVICE_EXPLANATIONS[p.service.key] || SERVICE_EXPLANATIONS.d2d;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title="Panoramica" eyebrow="Sintesi in 20 secondi" tone={svcColor} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <div style={{ background: `${svcColor}10`, border: `1px solid ${svcColor}35`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: svcColor, marginBottom: 8 }}>Come viene analizzato il servizio</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.82)", lineHeight: 1.55 }}>{serviceExplanation}</div>
        </div>
        <div style={{ background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.24)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: "#60A5FA", marginBottom: 8 }}>Analisi supportata da AI</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.82)", lineHeight: 1.55 }}>{AI_EXPLANATION}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Top zone</div>
          {p.topZonesPreview.length === 0 ? <NA compact>Nessuna zona classificata disponibile.</NA> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {p.topZonesPreview.map((z, i) => <HBar key={z.id || i} label={z.name} value={z.value} max={p.topZonesMax} color={svcColor} valueLabel={z.valueLabel} />)}
            </div>
          )}
        </div>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#60A5FA", marginBottom: 4 }}>Raccomandazione principale</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.45 }}>{p.advice.summary || "Selezione area non ancora finalizzata."}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: p.advice.shortage > 0 ? CRITICAL : "#4ADE80", marginBottom: 4 }}>{p.advice.shortage > 0 ? "Criticità" : "Opportunità"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.45 }}>
              {p.advice.shortage > 0 ? `Quantità insufficiente per copertura completa (mancano ${fmtInt(p.advice.shortage)} pz.).` : (p.advice.factors?.length ? `Fattori: ${p.advice.factors.join("; ")}.` : "Nessuna criticità operativa rilevata.")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>Affidabilità del risultato</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{p.reliability.label} — {p.reliability.detail}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioDurationCard({ title, quantity, dailyCapacity, showDailyCapacity, tone }) {
  const operatorDays = showDailyCapacity && dailyCapacity > 0 && quantity > 0 ? quantity / dailyCapacity : null;
  return (
    <div style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${tone}40`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: tone }}>{title}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>Quantità: <b className="vp-data-number" style={{ color: "rgba(255,255,255,.85)" }}>{fmtInt(quantity) ?? "—"} pz.</b></div>
      {!showDailyCapacity ? (
        <NA compact>Formula giorni/operatori definita solo per Door to Door con la capacità operativa attuale.</NA>
      ) : operatorDays == null ? (
        <NA compact>Durata non calcolabile.</NA>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }} className="vp-data-number">
            {fmtInt(quantity)} ÷ {fmtInt(dailyCapacity)} = {operatorDays.toLocaleString("it-IT", { maximumFractionDigits: 2 })} giorni-operatore
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)", lineHeight: 1.4 }}>
            "Giorni-operatore" = quantità ÷ capacità di un singolo operatore al giorno. Non è un numero di giorni di calendario.
          </div>
          <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.14)", fontSize: 10.5, color: "rgba(255,255,255,.55)" }}>
            Durata non calcolabile: numero operatori non disponibile.
          </div>
        </>
      )}
    </div>
  );
}

function SectionCopertura({ p, isMobile }) {
  const q = p.quantity;
  if (p.service.key === "b2b") {
    const selectedActivities = (p.overviewKpis || []).find((item) => item.label.toLowerCase().includes("selezionate"));
    const required = Number(q.recommended || 0);
    const inserted = Number(q.inserted || 0);
    const remaining = required > 0 ? Math.max(0, inserted - required) : null;
    const missing = required > 0 ? Math.max(0, required - inserted) : null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <SectionHeader title="Copertura e materiali" eyebrow="Bilancio delle copie assegnate" tone={SERVICE_COLOR.b2b} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <KpiCard label="Attività selezionate" value={selectedActivities?.value ?? null} color="#FB923C" unavailable={selectedActivities?.value == null} />
          <KpiCard label="Materiali disponibili" value={fmtInt(inserted)} unit="pz." color="#38BDF8" unavailable={!inserted} />
          <KpiCard label="Materiali necessari" value={required > 0 ? fmtInt(required) : null} unit="pz." color="#A78BFA" unavailable={required <= 0} />
          <KpiCard label="Materiali residui" value={remaining == null ? null : fmtInt(remaining)} unit="pz." color="#4ADE80" unavailable={remaining == null} />
          <KpiCard label="Materiali mancanti" value={missing == null ? null : fmtInt(missing)} unit="pz." color={missing > 0 ? CRITICAL : "#4ADE80"} unavailable={missing == null} />
          <KpiCard label="Copertura attività" value={q.coveragePctLabel} color="#4ADE80" unavailable={q.coveragePctLabel == null} />
        </div>
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(251,146,60,.07)", border: "1px solid rgba(251,146,60,.22)", color: "rgba(255,255,255,.8)", fontSize: 12, lineHeight: 1.6 }}>
          Materiali necessari = somma delle copie assegnate alle attività selezionate. Materiali residui = disponibili − necessari; se il risultato è negativo viene mostrata la quantità mancante. I POI non rappresentano un censimento completo delle imprese.
        </div>
      </div>
    );
  }
  if (q.available === false) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionHeader title="Copertura e quantità" eyebrow="Bilancio operativo" tone={SERVICE_COLOR[p.service.key]} />
        <div style={{ padding: 18, borderRadius: 12, background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.25)", color: "rgba(255,255,255,.82)", fontSize: 12, lineHeight: 1.65 }}>
          I dati territoriali necessari non sono disponibili. Il sistema non calcola copertura, fabbisogno, quantità mancante o quantità residua finché la fonte territoriale non restituisce un risultato valido.
        </div>
        <KpiCard label="Quantità inserita" value={fmtInt(q.inserted)} unit="pz." color="#38BDF8" unavailable={!q.inserted} />
      </div>
    );
  }
  const zoneStats = p.territory.zoneStats || { available: p.territory.zoneCount || 0, involved: p.territory.zoneCount || 0, full: 0, partial: 0, excluded: 0 };
  const max = Math.max(q.inserted || 0, q.recommended || 0, q.maximum || 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title={p.service.key === "b2b" ? "Copertura e materiali" : "Copertura e quantità"} eyebrow="Bilancio operativo" tone={SERVICE_COLOR[p.service.key]} />
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <HBar label="Quantità scenario corrente" value={q.inserted} max={max} color="#38BDF8" valueLabel={`${fmtInt(q.inserted)} pz.`} />
        {q.baseRequirement > 0 && <HBar label="Fabbisogno base" value={q.baseRequirement} max={max} color="#60A5FA" valueLabel={`${fmtInt(q.baseRequirement)} pz.`} />}
        {q.operationalMargin > 0 && <HBar label="Margine operativo" value={q.operationalMargin} max={max} color="#FBBF24" valueLabel={`+${fmtInt(q.operationalMargin)} pz.`} />}
        <HBar label="Fabbisogno operativo (100%)" value={q.recommended} max={max} color="#4ADE80" valueLabel={`${fmtInt(q.recommended)} pz.`} />
        {q.maximum > 0 && <HBar label="Massimo prudenziale" value={q.maximum} max={max} color="#60A5FA" valueLabel={`${fmtInt(q.maximum)} pz.`} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
          <KpiCard label="Copertura operativa" value={q.coveragePctLabel} color="#4ADE80" unavailable={q.coveragePctLabel == null} source={q.recommended > 0 ? `Formula: ${fmtInt(q.inserted)} pz. su ${fmtInt(q.recommended)} pz.` : null} />
        </div>
        <KpiCard label="Zone disponibili" value={zoneStats.available} color="#60A5FA" unavailable={!zoneStats.available} />
        <KpiCard label="Zone coinvolte" value={zoneStats.involved} color="#38BDF8" unavailable={!zoneStats.involved} />
        <KpiCard label="Zone complete" value={zoneStats.full} color="#4ADE80" />
        <KpiCard label="Zone parziali" value={zoneStats.partial} color="#FBBF24" />
        <KpiCard label="Zone escluse" value={zoneStats.excluded} color={GRAY} />
        <KpiCard label="Capacità per operatore" value={q.showDailyCapacity ? fmtInt(q.dailyCapacity) : null} unit="pz./giorno" color="#FB923C" unavailable={!q.showDailyCapacity} />
        <KpiCard label="Operatori" unavailable />
        <KpiCard label="Quantità mancante" value={q.shortage > 0 ? fmtInt(q.shortage) : "0"} color={q.shortage > 0 ? CRITICAL : "#4ADE80"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <ScenarioDurationCard title="Scenario corrente" quantity={q.inserted} dailyCapacity={q.dailyCapacity} showDailyCapacity={q.showDailyCapacity} tone="#38BDF8" />
        <ScenarioDurationCard title="Scenario consigliato" quantity={q.recommended} dailyCapacity={q.dailyCapacity} showDailyCapacity={q.showDailyCapacity} tone="#4ADE80" />
      </div>
      <Accordion title="Come viene calcolato" tone="#FBBF24">
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)", lineHeight: 1.7 }}>
          <div><b>Copertura operativa</b> = quantità inserita ÷ fabbisogno operativo × 100. Non è la stessa cosa di una copertura territoriale o di una copertura famiglie: qui il denominatore è sempre il fabbisogno operativo (100% copertura), mostrato esplicitamente sopra.</div>
          <div style={{ marginTop: 8 }}><b>Giorni-operatore</b> = quantità ÷ capacità giornaliera di un operatore ({fmtInt(q.dailyCapacity) ?? "—"} pz./giorno per Door to Door). Non viene mai mostrato un numero di giorni di calendario senza conoscere il numero di operatori realmente impiegati.</div>
        </div>
      </Accordion>
    </div>
  );
}

function SectionZone({ p, isMobile }) {
  const svc = p.service.key;
  const svcColor = SERVICE_COLOR[svc];
  const rows = p.zoneRows;
  const columns = p.zoneColumns;
  const [showAll, setShowAll] = useState(false);
  const nilShowCount = p.nilShowCount || 10;
  const visibleRows = showAll ? rows : rows.slice(0, nilShowCount);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title={svc === "b2b" ? "Zone commerciali" : "Zone e priorità"} eyebrow={p.zoneEyebrow} tone={svcColor} />
      {p.isMilanoNil && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>
          Top {Math.min(rows.length, nilShowCount)} NIL su {p.nilTotal} disponibili.
          {rows.length > nilShowCount && (
            <button onClick={() => setShowAll((v) => !v)} style={{ marginLeft: 10, background: "none", border: "none", color: "#38BDF8", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
              {showAll ? "Mostra solo le prime" : "Vedi la classifica completa"}
            </button>
          )}
        </div>
      )}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Top zone per priorità</div>
        {rows.length === 0 ? <NA>Nessuna zona classificata per questa configurazione.</NA> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleRows.slice(0, showAll ? visibleRows.length : nilShowCount).map((z, i) => (
              <HBar key={z.id || i} label={z.name} value={z.priorityValue} max={p.priorityMax} color={svcColor} valueLabel={z.priorityLabel} />
            ))}
          </div>
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Dettaglio zone</div>
        <ZoneTable rows={visibleRows} columns={columns} isMobile={isMobile} />
      </div>
    </div>
  );
}

function SectionDemografia({ p, isMobile }) {
  const d = p.demographics;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title="Demografia e target" eyebrow="Dati territoriali" tone="#38BDF8" />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard label="Popolazione residente (comune)" value={fmtInt(d.totalPopulation)} color={C.white} unavailable={!(d.totalPopulation > 0)} />
        <KpiCard label="Famiglie residenti — livello Comune" value={fmtInt(d.totalHouseholds)} color="#38BDF8" unavailable={!(d.totalHouseholds > 0)} />
        <KpiCard label="Densità abitativa" value={fmtInt(d.profileDens)} unit="ab./km²" color="#4ADE80" unavailable={!(d.profileDens > 0)} />
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Fasce d'età prevalenti (livello comune, fonte ISTAT)</div>
        {d.ageRows.length === 0 ? <NA>Dato non disponibile per questo comune.</NA> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.ageRows.map((b) => <HBar key={b.l} label={`${b.l} anni`} value={b.v} max={100} color={b.c} valueLabel={`${Math.round(Number(b.v))}%`} />)}
          </div>
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>{d.familyBreakdownTitle}</div>
        {d.familyBreakdownItems.length === 0 ? <NA>La suddivisione per NIL/settore non si applica a questo territorio: è analizzato come area unica.</NA> : (
          <ZoneTable rows={d.familyBreakdownItems.slice(0, 10)} columns={[
            { key: "name", label: "Zona", render: (r) => r.name || r.label || "—" },
            { key: "families", label: "Famiglie", align: "right", render: (r) => fmtInt(r.families || r.households || 0) ?? "Dato non disponibile" },
          ]} isMobile={isMobile} />
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Composizione nuclei familiari (single / coppie / con figli)</div>
        <NA>Dato non disponibile: la fonte censuaria di dettaglio non è collegata in questa versione dell'app.</NA>
      </div>
      {d.operationalRequirementExplanation && (
        <div style={{ background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.18)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#38BDF8", marginBottom: 8 }}>Perche famiglie residenti e fabbisogno operativo differiscono</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.78)", lineHeight: 1.55 }}>{d.operationalRequirementExplanation}</div>
        </div>
      )}
    </div>
  );
}

function SectionEdifici() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
      <SectionHeader title="Edifici e territorio" eyebrow="Contesto edilizio" tone="#4ADE80" />
      <span style={{ alignSelf: "flex-start", padding: "4px 8px", borderRadius: 999, background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.25)", color: "#F87171", fontFamily: F.sans, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>Dato non disponibile</span>
      <NA>Dato non disponibile per questo livello territoriale: nessuna fonte di tipologia edilizia (palazzi/condomini/villette/uffici/negozi/capannoni) è collegata in VolantiniPro. Anche la destinazione d'uso DUSAF risulta non collegata per questo comune.</NA>
    </div>
  );
}

function SectionEconomia({ p }) {
  const e = p.economy;
  const omiMeta = e.omiMeta || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title="Economia, capacità di spesa e valore immobiliare" eyebrow="Contesto economico" tone="#22C55E" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard label="Reddito medio (comune)" value={e.reddito ? fmtInt(e.reddito) : null} unit={e.reddito ? "€" : ""} color="#22C55E" unavailable={!e.reddito} source={e.reddito ? "Dato comunale aggregato" : null} />
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#22C55E", marginBottom: 4 }}>Quotazioni OMI (Agenzia delle Entrate)</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", marginBottom: 12 }}>
          Fonte: Agenzia delle Entrate - OMI. {omiMeta.zoneCount != null ? `${fmtInt(omiMeta.zoneCount)} zone OMI rappresentate` : "Numero zone OMI non restituito"}{omiMeta.zoneNames ? `: ${omiMeta.zoneNames}` : ""}. {omiMeta.aggregationLabel || "Metodo di aggregazione non restituito"}. {omiMeta.period ? `Periodo: ${omiMeta.period}. ` : ""}Limite geografico: zona OMI, non singolo civico.
        </div>
        {e.omiRows.length === 0 ? <NA>Dato OMI non disponibile per questa zona.</NA> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {e.omiRows.map((row) => (
              <div key={row.typology} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.16)" }}>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 3 }}>{row.typology}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#22C55E" }}>{row.min_value != null ? `${fmtInt(row.min_value)} - ${fmtInt(row.max_value)} €/mq` : "Dato non disponibile"}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 4 }}>Fascia di valore restituita dalla zona OMI</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)" }}>I valori OMI descrivono il posizionamento economico del territorio a livello di zona OMI (non del singolo civico) e non modificano automaticamente quantità o score.</div>
    </div>
  );
}

function SectionMobilita({ p, isMobile }) {
  const m = p.mobility;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title="Mobilità e POI" eyebrow="Potenziale di attrazione territoriale" tone="#38BDF8" />
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>POI per categoria (OpenStreetMap, raggio selezionato)</div>
        {m.poiByCategory.length === 0 ? <NA>Nessun POI rilevato in questo raggio o fonte non disponibile.</NA> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {m.poiByCategory.map((c) => <HBar key={c.label} label={c.label} value={c.value} max={m.poiMax} color="#38BDF8" />)}
          </div>
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Fermate e stazioni TPL (GTFS)</div>
        {!m.transport?.available || !m.transport?.stops?.length ? <NA>Nessuna fermata GTFS collegata per questa zona.</NA> : (
          <ZoneTable rows={m.transport.stops.slice(0, 10)} columns={[
            { key: "stopName", label: "Fermata" },
            { key: "stopType", label: "Tipo" },
            { key: "distanceM", label: "Distanza", align: "right", render: (r) => r.distanceM != null ? `${fmtInt(r.distanceM)} m` : "—" },
          ]} isMobile={isMobile} />
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Poli con maggiore potenziale di attrazione</div>
        {m.hotspotRows.length === 0 ? <NA>Nessun polo classificato per questo raggio.</NA> : (
          <ZoneTable rows={m.hotspotRows.slice(0, 8)} columns={[
            { key: "name", label: "Zona" },
            { key: "strength", label: "Indice", align: "right", render: (r) => `${r.strength}/100` },
            { key: "transit", label: "Fermate/stazioni", align: "right" },
            { key: "poi", label: "POI", align: "right" },
          ]} isMobile={isMobile} />
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)" }}>Gli indicatori qui mostrati descrivono potenziale di attrazione territoriale (densità di POI e trasporto), non un conteggio certo di passanti.</div>
    </div>
  );
}

function SectionImprese({ p, isMobile }) {
  const b = p.business;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title="Attività, categorie e aree produttive" eyebrow="Contesto commerciale reale" tone="#FB923C" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard label="Attività rilevate" value={fmtInt(b.bizTotal)} color="#FB923C" unavailable={!(b.bizTotal > 0)} />
        <KpiCard label="Competitor rilevati" value={fmtInt(b.competitors)} color={CRITICAL} unavailable={!(b.competitors >= 0) || b.competitors == null} />
        <KpiCard label="Densità commerciale (CDI)" value={b.cdIdx != null ? b.cdIdx : null} color="#4ADE80" unavailable={b.cdIdx == null} />
        <KpiCard label="Aree industriali/artigianali" unavailable />
        <KpiCard label="Poli logistici" unavailable />
        <KpiCard label="Punti di consegna stimati" unavailable />
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Attività per categoria (POI, non censimento ATECO)</div>
        {b.topCatsReal.length === 0 ? <NA>Dato non disponibile: nessuna categoria di attività rilevata per questa zona.</NA> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {b.topCatsReal.map((c) => <HBar key={c.label} label={c.label} value={c.pct} max={100} color="#FB923C" valueLabel={`${c.pct}%`} />)}
          </div>
        )}
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Zone con maggiore concentrazione B2B</div>
        {b.rankedRows.length === 0 ? <NA>Nessuna zona classificata per questa configurazione.</NA> : (
          <ZoneTable rows={b.rankedRows.slice(0, 8)} columns={[
            { key: "zoneName", label: "Zona" },
            { key: "score", label: "Score", align: "right", render: (r) => `${r.score}/100` },
            { key: "activities", label: "Attività", align: "right" },
            { key: "competitors", label: "Competitor", align: "right" },
          ]} isMobile={isMobile} />
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)" }}>Le categorie mostrate derivano esclusivamente dai tag POI restituiti da OpenStreetMap/Overpass, non da Google Places né da un censimento ATECO ufficiale.</div>
    </div>
  );
}

function SectionBusinessOperativo({ p, isMobile }) {
  const findKpi = (fragment) => (p.overviewKpis || []).find((item) => item.label.toLowerCase().includes(fragment));
  const selected = findKpi("selezionate");
  const operatorDays = findKpi("giornate");
  const operators = findKpi("addetti") || findKpi("operatori");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Percorso e capacità operativa" eyebrow="Piano stimato dalle visite selezionate" tone="#A78BFA" />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <KpiCard label="Attività selezionate" value={selected?.value ?? null} color="#FB923C" unavailable={selected?.unavailable || selected?.value == null} />
        <KpiCard label="Giornate-operatore" value={operatorDays?.value ?? null} color="#A78BFA" unavailable={operatorDays?.unavailable || operatorDays?.value == null} />
        <KpiCard label="Operatori consigliati" value={operators?.value ?? null} color="#4ADE80" unavailable={operators?.unavailable || operators?.value == null} />
        <KpiCard label="Distanza/percorso stimato" unavailable />
      </div>
      <div style={{ padding: 16, borderRadius: 12, background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.24)", color: "rgba(255,255,255,.78)", fontSize: 12, lineHeight: 1.6 }}>
        Il piano usa il numero di attività selezionate e il tempo medio della modalità di consegna. Le giornate-operatore non sono giorni di calendario. La durata calendario viene mostrata soltanto quando periodo e numero operatori permettono un calcolo attendibile.
      </div>
      <NA>Ordine del percorso e distanza non disponibili: non è collegato un motore di routing Business.</NA>
    </div>
  );
}

function SectionScore({ p }) {
  const s = p.score;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SectionHeader title={p.service.key === "b2b" ? "Score Business e raccomandazioni" : "Score e raccomandazioni"} eyebrow={`Score ${p.service.title}`} tone={s.color} />
      <div style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${s.color}55`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginBottom: 4 }}>Indice di efficienza e compatibilità zona</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }}>{s.description || "Indicatore interno calcolato dalle componenti effettivamente disponibili per questa configurazione. Non e un dato ufficiale ISTAT."}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.pct} / 100</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: s.color, textTransform: "uppercase" }}>{s.label}</div>
          </div>
        </div>
        <div style={{ width: "100%", height: 9, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 5 }} />
        </div>
        <Accordion title="Come viene calcolato" tone={s.color}>
          {s.components.length === 0 ? <NA>Componenti non disponibili per questa configurazione.</NA> : (
            <div style={{ display: "grid", gap: 9 }}>
              {s.components.map((c) => (
                <div key={c.name} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) auto", gap: 10, paddingBottom: 9, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.white }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)" }}>{c.description}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: s.color }} className="vp-data-number">{c.contribution}/{c.max}</div>
                </div>
              ))}
            </div>
          )}
        </Accordion>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <RecoCard tone="#60A5FA" title="Strategia principale" text={p.recommendation.strategy} />
        <RecoCard tone="#4ADE80" title="Zone prioritarie" text={p.recommendation.priorityZones} />
        <RecoCard tone={CRITICAL} title="Criticità" text={p.recommendation.criticalities} />
        <RecoCard tone={COMPARE} title="Scenario alternativo" text={p.recommendation.alternative} />
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>Livello di affidabilità della raccomandazione: {p.reliability.label} — {p.reliability.detail}</div>
    </div>
  );
}

function RecoCard({ tone, title, text }) {
  return (
    <div style={{ background: `${tone}14`, border: `1px solid ${tone}40`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: tone, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function SectionFonti({ p, isMobile }) {
  const confidenceLabels = { coverage: "Copertura e allocazione", demographics: "Demografia", buildings: "Edifici", economy: "Economia e OMI", mobility: "Mobilità e POI", business: "Imprese e aree produttive", recommendation: "Raccomandazione finale" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionHeader title="Fonti e metodologia" eyebrow="Trasparenza dei dati" tone="#60A5FA" />
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Confidenza per sezione</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {Object.entries(p.confidence || {}).map(([key, item]) => (
            <div key={key} style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.white }}>{confidenceLabels[key] || key}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: item.label === "Alta" ? "#4ADE80" : item.label === "Media" ? "#FBBF24" : CRITICAL }}>{item.label}</span>
              </div>
              <div className="vp-data-number" style={{ fontSize: 10.5, color: "rgba(255,255,255,.55)" }}>{item.available}/{item.total} fonti richieste disponibili</div>
              {item.limitation && <div style={{ marginTop: 5, fontSize: 10.5, color: "rgba(255,255,255,.42)", lineHeight: 1.4 }}>{item.limitation}</div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.white, marginBottom: 10 }}>Registro fonti</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
          {p.sourceRegistry.map((source) => (
            <article key={source.name} style={{ padding: 14, borderRadius: 11, background: "rgba(255,255,255,.03)", border: `1px solid ${source.connected ? "rgba(74,222,128,.22)" : "rgba(255,255,255,.08)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <strong style={{ fontSize: 12, color: C.white }}>{source.name}</strong>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: source.connected ? "#4ADE80" : GRAY }}>{source.connected ? "Collegato" : "Non collegato"}</span>
              </div>
              {[["Provider/dataset", source.source], ["Livello geografico", source.level], ["Periodo", source.year], ["Stato", source.kind], ["Metodo", source.method], ["Affidabilità", source.reliability], ["Limiti noti", source.limitation]].map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "105px minmax(0,1fr)", gap: 8, marginTop: 5, fontSize: 10.5, lineHeight: 1.35 }}>
                  <span style={{ color: "rgba(255,255,255,.4)" }}>{label}</span>
                  <span style={{ color: "rgba(255,255,255,.75)", overflowWrap: "anywhere" }}>{value || "Dato non disponibile"}</span>
                </div>
              ))}
            </article>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>
        Le sei apparenti incongruenze numeriche osservate tra schermate diverse (famiglie/popolazione residenti vs stimate, copertura NIL vs copertura campagna, margine operativo vs margine prudenziale) derivano da concetti e pipeline realmente distinti, non da errori: sono rinominate esplicitamente in questo report invece di essere nascoste.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export default function TerritorialReport(props) {
  const { p, isMobile } = props;
  const [activeSection, setActiveSection] = useState("panoramica");
  const [showQuantity, setShowQuantity] = useState(false);
  const [showScenario, setShowScenario] = useState(false);

  const visibleSections = useMemo(
    () => NAV_SECTIONS.filter((s) => s.services.includes(p.service.key)),
    [p.service.key]
  );

  const handleExportPdf = useCallback(() => {
    if (p.pdf?.onExport) p.pdf.onExport();
  }, [p.pdf]);

  const SectionBody = () => {
    switch (activeSection) {
      case "panoramica": return <SectionPanoramica p={p} isMobile={isMobile} />;
      case "copertura": return <SectionCopertura p={p} isMobile={isMobile} />;
      case "zone": return <SectionZone p={p} isMobile={isMobile} />;
      case "demografia": return <SectionDemografia p={p} isMobile={isMobile} />;
      case "edifici": return <SectionEdifici />;
      case "economia": return <SectionEconomia p={p} />;
      case "mobilita": return <SectionMobilita p={p} isMobile={isMobile} />;
      case "imprese": return <SectionImprese p={p} isMobile={isMobile} />;
      case "operativo": return <SectionBusinessOperativo p={p} isMobile={isMobile} />;
      case "score": return <SectionScore p={p} />;
      case "fonti": return <SectionFonti p={p} isMobile={isMobile} />;
      default: return null;
    }
  };

  return (
    <div style={{ background: "#060D18", borderRadius: 18, border: "1px solid rgba(56,189,248,.28)", boxShadow: "0 20px 60px rgba(0,0,0,.6)", overflow: "hidden" }}>
      <div style={{ padding: isMobile ? "0 16px" : "0 24px" }}>
        <ReportHeader
          p={p}
          isMobile={isMobile}
          onOpenQuantity={() => setShowQuantity((v) => !v)}
          onToggleScenario={() => setShowScenario((v) => !v)}
          onExportPdf={handleExportPdf}
          pdfBusy={p.pdf?.busy}
        />
      </div>
      <div style={{ padding: isMobile ? "4px 16px 28px" : "4px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
        {showQuantity && <QuantityPopover p={p} onClose={() => setShowQuantity(false)} />}
        {showScenario && <ScenarioComparePanel p={p} onClose={() => setShowScenario(false)} />}

        {isMobile ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 4 }}>
            {visibleSections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                padding: "8px 12px", borderRadius: 999,
                background: activeSection === s.id ? "rgba(56,189,248,.18)" : "rgba(255,255,255,.04)",
                border: `1px solid ${activeSection === s.id ? "rgba(56,189,248,.5)" : "rgba(255,255,255,.12)"}`,
                color: activeSection === s.id ? "#38BDF8" : "rgba(255,255,255,.7)",
                fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{p.service.key === "b2b" && s.businessLabel ? s.businessLabel : s.label}{s.id === "edifici" && <span style={{ marginLeft: 6, color: "#F87171", fontSize: 10, fontWeight: 800 }}>N/D</span>}</button>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 28, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 100 }}>
              {visibleSections.map((s) => (
                <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                  textAlign: "left", padding: "10px 14px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: activeSection === s.id ? "rgba(56,189,248,.14)" : "transparent",
                  color: activeSection === s.id ? "#38BDF8" : "rgba(255,255,255,.68)",
                  fontFamily: F.sans, fontSize: 12.5, fontWeight: activeSection === s.id ? 800 : 600,
                  borderLeft: activeSection === s.id ? "3px solid #38BDF8" : "3px solid transparent",
                }}>{p.service.key === "b2b" && s.businessLabel ? s.businessLabel : s.label}{s.id === "edifici" && <span style={{ float: "right", color: "#F87171", fontSize: 10, fontWeight: 800 }}>N/D</span>}</button>
              ))}
            </div>
            <div style={{ minWidth: 0 }}><SectionBody /></div>
          </div>
        )}
        {isMobile && <div><SectionBody /></div>}
      </div>
    </div>
  );
}
