import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT, formatPercentIT } from "../../../../lib/utils/format.js";
import { getServiceExplanation } from "../../../../lib/step2/serviceExplanations.js";

export function SelectedZonesSummary({
  selectedZones = [],
  onRemoveZone,
  totalFamilies = 0,
  recommendedFlyers = 0,
  currentQuantity = 0,
  coveragePercent = 0,
  serviceType = "d2d",
  serviceColor = C.orange,
}) {
  const count = selectedZones.length;
  const countLabel = count === 1 ? "1 zona selezionata" : `${count} zone selezionate`;
  const explanation = getServiceExplanation(serviceType);

  if (count === 0) {
    return (
      <div
        className="vp-selected-zones-summary"
        style={{
          background: "rgba(255,255,255,.03)",
          border: "1px dashed rgba(255,255,255,.14)",
          borderRadius: 12,
          padding: "12px 16px",
          fontFamily: F.sans,
          fontSize: 12,
          color: "rgba(255,255,255,.6)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, color: serviceColor }}>📍</span>
        <span>Clicca su una zona della mappa o usa il campo di ricerca per selezionare le aree desiderate.</span>
      </div>
    );
  }

  return (
    <div
      className="vp-selected-zones-summary"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.02) 100%)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: F.sans,
        marginTop: 10,
        marginBottom: 12,
      }}
    >
      {/* Header and counter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: serviceColor }}>
            Riepilogo Territoriale
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>
            {countLabel}
          </span>
        </div>

        {/* Mini metric indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11.5 }}>
          {totalFamilies > 0 ? (
            <div style={{ color: "rgba(255,255,255,.8)" }}>
              {explanation.kpiHouseholdLabel.split("/")[0].trim()}: <b style={{ color: C.white }}>{formatIntegerIT(totalFamilies)}</b>
            </div>
          ) : null}
          {recommendedFlyers > 0 ? (
            <div style={{ color: "rgba(255,255,255,.8)" }}>
              Consigliati: <b style={{ color: serviceColor }}>{formatIntegerIT(recommendedFlyers)}</b>
            </div>
          ) : null}
          {coveragePercent > 0 ? (
            <div style={{ color: "rgba(255,255,255,.8)" }}>
              Copertura: <b style={{ color: C.green }}>{formatPercentIT(coveragePercent)}</b>
            </div>
          ) : null}
        </div>
      </div>

      {/* Selected zone chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {selectedZones.map((zone) => {
          const zoneId = typeof zone === "string" ? zone : zone.id;
          const zoneName = typeof zone === "string" ? zone : zone.name || zone.label || zoneId;
          const zoneFamilies = typeof zone === "object" ? zone.families : null;

          return (
            <div
              key={zoneId}
              style={{
                background: "rgba(232,87,26,.12)",
                border: "1px solid rgba(232,87,26,.35)",
                borderRadius: 20,
                padding: "4px 10px 4px 12px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: C.white,
              }}
            >
              <span>{zoneName}</span>
              {zoneFamilies ? (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.55)", fontWeight: 500 }}>
                  ({formatIntegerIT(zoneFamilies)})
                </span>
              ) : null}
              {onRemoveZone ? (
                <button
                  type="button"
                  onClick={() => onRemoveZone(zoneId)}
                  title={`Rimuovi ${zoneName}`}
                  aria-label={`Rimuovi ${zoneName}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,.6)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "0 2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,.6)"; }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SelectedZonesSummary;
