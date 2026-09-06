import React from "react";
import { C, F } from "../../../../lib/constants.js";
import {
  summariseNilCoverage,
  nilModeCountLabel,
  nilStatusSummaryLine,
  neutralPriorityLabel,
  lowCoverageMilanoCopy,
} from "../../../../lib/step2/milanoNilView.js";

// UX Milano — SOLO presentazionale (§0 firewall). Nessun calcolo territoriale,
// nessuno stato autoritativo: tutti i valori arrivano gia' calcolati da
// Step2.jsx. `nilQuery` e' l'unico stato UI (in Step2.jsx), qui solo bindato.
// Reso solo quando `visible` (municipio selezionato = Milano). Non altera la UX
// degli altri comuni.

const card = {
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 12,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontFamily: F.sans,
  boxSizing: "border-box",
  minWidth: 0,
};
const kicker = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: C.orange,
};
const chipBtn = (active, disabled) => ({
  padding: "6px 11px",
  borderRadius: 999,
  border: `1px solid ${active ? C.orange : "rgba(255,255,255,.18)"}`,
  background: active ? "rgba(232,87,26,.16)" : "transparent",
  color: disabled ? "rgba(255,255,255,.35)" : active ? C.white : "rgba(255,255,255,.72)",
  fontSize: 11.5,
  fontWeight: 700,
  fontFamily: F.sans,
  cursor: disabled ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
});

function Metric({ label, value, tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: tone || C.white, fontFamily: F.sans, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.55)", fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

export function MilanoGuidance({
  visible,
  isMobile = false,
  // modalita' correnti (canoniche)
  isRadiusMode = false,
  isCapMode = false,
  nilManualMode = false,
  isMilanoCompletoMode = false,
  // conteggi NIL canonici (gia' derivati in Step2.jsx)
  availableNilCount = 0,
  intersectedNilCount = 0,
  selectedNilCount = 0,
  // conteggi copertura NIL — CANONICI da Step2 (summaryComuniStats). Se assenti,
  // fallback puro su zonesAllocation via summariseNilCoverage().
  nilStats = null,
  zonesAllocation = [],
  allocationMode = "auto",
  firstAllocationZoneName = "",
  // quantita' / copertura REALI
  quantity = null,
  coveragePct = null,
  lowCoverage = false,
  // ricerca NIL locale (§6) — stato in Step2.jsx
  nilQuery = "",
  onNilQueryChange = () => {},
  nilResultCount = null,
  // azioni (handler ESISTENTI di Step2.jsx)
  onShowNil = null,
  onUseRadius = null,
  onKeepMilanoComplete = null,
}) {
  if (!visible) return null;

  const summary =
    nilStats && Number.isFinite(Number(nilStats.available))
      ? {
          available: Math.max(0, Number(nilStats.available) || 0),
          full: Math.max(0, Number(nilStats.full) || 0),
          partial: Math.max(0, Number(nilStats.partial) || 0),
          excluded: Math.max(0, Number(nilStats.excluded) || 0),
          reached: (Number(nilStats.full) || 0) + (Number(nilStats.partial) || 0),
        }
      : summariseNilCoverage({ availableCount: availableNilCount, zonesAllocation });
  const modeLabel = nilModeCountLabel({
    isRadiusMode,
    nilManualMode,
    availableCount: availableNilCount,
    intersectedCount: intersectedNilCount,
    selectedCount: selectedNilCount,
  });
  const statusLine = nilStatusSummaryLine(summary);
  const priority = neutralPriorityLabel({ allocationMode, firstZoneName: firstAllocationZoneName });
  const showNilSearch = !isRadiusMode && !isCapMode; // ricerca solo dove esiste una lista NIL

  return (
    <div
      className="vp-step2-milano-guidance"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {/* Riga modalita' Milano (§3) — usa gli handler esistenti. */}
      <div style={{ ...card, gap: 8 }}>
        <span style={kicker}>Milano · scegli come distribuire</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" style={chipBtn(isMilanoCompletoMode)} onClick={() => onKeepMilanoComplete && onKeepMilanoComplete()} disabled={!onKeepMilanoComplete}>
            Milano completo
          </button>
          <button type="button" style={chipBtn(false, true)} disabled title="Suddivisione per Municipio non ancora disponibile">
            Municipio · Disponibile prossimamente
          </button>
          <button type="button" style={chipBtn(nilManualMode)} onClick={() => onShowNil && onShowNil()} disabled={!onShowNil}>
            NIL / Quartiere
          </button>
          <button type="button" style={chipBtn(isRadiusMode)} onClick={() => onUseRadius && onUseRadius()} disabled={!onUseRadius}>
            Raggio
          </button>
          <button type="button" style={chipBtn(isCapMode, true)} disabled title="Passa alla scheda CAP per usare i codici postali">
            CAP
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,.6)" }}>
          Milano ha molte zone (NIL / quartieri). "Milano completo" le include tutte;
          "NIL / Quartiere" ti fa scegliere solo alcune aree; "Raggio" concentra la
          distribuzione attorno a un punto.
        </p>
      </div>

      {/* Summary card NIL (§4 + §9) — SOLO valori Step 2 esistenti. */}
      <div style={card}>
        <span style={kicker}>{modeLabel}</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: isMobile ? 10 : 8,
          }}
        >
          <Metric label="NIL disponibili" value={summary.available} />
          <Metric label="coperti" value={summary.full} tone={C.green} />
          <Metric label="parzialmente coperti" value={summary.partial} tone="#FBBF24" />
          <Metric label="non raggiunti" value={summary.excluded} tone="rgba(255,255,255,.55)" />
        </div>
        {statusLine ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", fontWeight: 700 }}>{statusLine}</div>
        ) : null}
        {priority ? (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", lineHeight: 1.4 }}>
            {priority.label}
            <span style={{ color: "rgba(255,255,255,.35)" }}> · criterio: {priority.criterion}</span>
          </div>
        ) : null}
      </div>

      {/* Guida bassa copertura (§5) — copy con quantita'/copertura REALI. */}
      {lowCoverage && isMilanoCompletoMode ? (
        <div style={{ ...card, border: "1px solid rgba(251,191,36,.3)", background: "rgba(251,191,36,.06)" }}>
          <span style={{ ...kicker, color: "#FBBF24" }}>Copertura bassa su Milano completo</span>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,.82)" }}>
            {lowCoverageMilanoCopy({ quantity, coveragePct })}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {onShowNil ? (
              <button type="button" style={chipBtn(false)} onClick={() => onShowNil()}>Mostra NIL</button>
            ) : null}
            {onUseRadius ? (
              <button type="button" style={chipBtn(false)} onClick={() => onUseRadius()}>Usa Raggio</button>
            ) : null}
            {onKeepMilanoComplete ? (
              <button type="button" style={chipBtn(true)} onClick={() => onKeepMilanoComplete()}>Mantieni Milano completo</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Ricerca NIL locale (§6) — FILTER-ONLY. */}
      {showNilSearch ? (
        <div style={{ ...card, gap: 6 }}>
          <label style={{ ...kicker, fontSize: 9.5 }} htmlFor="vp-milano-nil-search">Trova una zona</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="vp-milano-nil-search"
              type="text"
              value={nilQuery}
              onChange={(e) => onNilQueryChange(e.target.value)}
              placeholder="Cerca NIL / quartiere"
              autoComplete="off"
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(0,0,0,.25)",
                color: C.white,
                fontSize: 12,
                fontFamily: F.sans,
              }}
            />
            {nilQuery ? (
              <button
                type="button"
                onClick={() => onNilQueryChange("")}
                style={{ ...chipBtn(false), padding: "6px 10px" }}
              >
                Pulisci
              </button>
            ) : null}
          </div>
          {nilQuery ? (
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)" }}>
              {Number(nilResultCount) || 0} {Number(nilResultCount) === 1 ? "zona trovata" : "zone trovate"}
              {availableNilCount ? ` su ${availableNilCount}` : ""} · la selezione non cambia con la ricerca
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default MilanoGuidance;
