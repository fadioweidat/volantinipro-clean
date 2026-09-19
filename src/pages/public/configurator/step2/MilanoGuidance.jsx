import React, { useState } from "react";
import TerritoryGeometryPreview from "./TerritoryGeometryPreview.jsx";
import MilanoAddressContextCard from "./MilanoAddressContextCard.jsx";
import { C, F } from "../../../../lib/constants.js";
import {
  summariseNilCoverage,
  nilModeCountLabel,
  nilStatusSummaryLine,
  neutralPriorityLabel,
  lowCoverageMilanoCopy,
} from "../../../../lib/step2/milanoNilView.js";

// UX Milano — SOLO presentazionale (§0 firewall). Nessun calcolo territoriale,
// nessuno stato autoritativo. La ricerca NIL vive in MilanoNilSearch.jsx (sopra la mappa).
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
  externalComuniCount = 0,
  externalComuniNames = [],
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
  // azioni (handler ESISTENTI di Step2.jsx)
  onShowNil = null,
  onUseRadius = null,
  onKeepMilanoComplete = null,
  addressPoint = null,
  coverageAddress = null,
  containingNil = null,
}) {
  const [municipioFocus, setMunicipioFocus] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    externalComuniCount,
    externalComuniNames,
  });
  const statusLine = nilStatusSummaryLine(summary);
  const priority = neutralPriorityLabel({ allocationMode, firstZoneName: firstAllocationZoneName });

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

      <MilanoAddressContextCard
        addressPoint={addressPoint}
        coverageAddress={coverageAddress}
        containingNil={containingNil}
        onUseNil={() => {
          if (containingNil?.id && onSelectOnlyNil) {
            onSelectOnlyNil(containingNil.id);
          }
          if (onShowNil) onShowNil();
        }}
        onPreviewMunicipio={number => setMunicipioFocus(previous => ({ number, nonce: (previous?.nonce || 0) + 1 }))}
        onUseRadius={onUseRadius}
        onKeepMilanoComplete={onKeepMilanoComplete}
      />

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
          <Metric label={isRadiusMode && externalComuniCount > 0 ? "Zone nel raggio" : isRadiusMode ? "NIL nel raggio" : nilManualMode ? "NIL selezionati" : "NIL disponibili"} value={summary.available} />
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

      {/* Ripartizione zone in modalita' Raggio */}
      {isRadiusMode && Array.isArray(zonesAllocation) && zonesAllocation.length > 0 && (
        <div style={{ ...card, gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={kicker}>Ripartizione zone nel raggio</span>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>
              {zonesAllocation.length} {zonesAllocation.length === 1 ? 'zona intersecata' : 'zone intersecate'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {zonesAllocation.map((z) => {
              const req = Number(z.requiredFlyers || z.families || 0);
              const ass = Number(z.assignedFlyers || 0);
              const pct = req > 0 ? Math.round((ass / req) * 100) : (ass > 0 ? 100 : 0);
              const missing = Math.max(0, req - ass);
              const isFull = pct >= 100;
              const isPartial = pct > 0 && pct < 100;
              const statusCol = isFull ? C.green : isPartial ? '#FBBF24' : 'rgba(255,255,255,.45)';
              return (
                <div key={z.id || z.name} style={{
                  padding: '8px 11px', borderRadius: 8,
                  background: 'rgba(0,0,0,.22)', border: `1px solid ${isFull ? 'rgba(34,197,94,.25)' : isPartial ? 'rgba(251,191,36,.25)' : 'rgba(255,255,255,.07)'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                }}>
                  <div style={{ minWidth: 120, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{z.name}</div>
                    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)' }}>
                      Fabbisogno: ~{req.toLocaleString('it-IT')} vol.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: statusCol }}>
                        {ass.toLocaleString('it-IT')} vol. ({pct}%)
                      </div>
                      {missing > 0 && (
                        <div style={{ fontSize: 9, color: '#F87171' }}>
                          Mancano {missing.toLocaleString('it-IT')} per 100%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Sezione Dettagli Avanzati / Accordion */}
      <div style={{ marginTop: 2 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,.45)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 2px",
            fontFamily: F.sans,
          }}
        >
          <span>{showAdvanced ? "▾" : "▸"}</span>
          <span>{showAdvanced ? "Nascondi dettagli avanzati" : "Mostra dettagli avanzati (Municipio, confini)"}</span>
        </button>
        {showAdvanced ? (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <TerritoryGeometryPreview focusRequest={municipioFocus} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MilanoGuidance;
