import React from "react";
import { Step2BottomActions } from "./Step2BottomActions.jsx";
import { formatIntegerIT } from "../../../../lib/utils/format.js";

// No estimates or allocation calculations here: values come from the existing truth/view models.
export function MilanoTerritorySummary({ mode, hasSelection, zoneLabel, viewModel, truthModel, quantity, coverageLabel, areaLabel, loading, failed, onRetry, coverageDecisionRequired, coverageDecision, availableFlyers, requiredFlyers, manualFlyers, isCoverageDecisionValid, onQuantityDecision, onManualQuantity, nilResidual, advancedContent, onOpenReport, actions }) {
  const ready = hasSelection && viewModel.hasUsableCoverageData;
  const unavailable = !hasSelection ? "Da scegliere" : loading ? "Calcolo in corso…" : "Dato non disponibile";
  const rows = [
    ["Zona", zoneLabel || "Milano"],
    ["Modalità", {nil: "Quartieri / NIL", radius: "Raggio", municipality: "Tutto Milano"}[mode] || "Da scegliere"],
    ["Famiglie stimate", ready ? formatIntegerIT(viewModel.primaryFamiliesValue) : unavailable],
    ["Quantità scelta", `${formatIntegerIT(quantity)} pz`],
    ["Quantità consigliata", ready ? `${formatIntegerIT(viewModel.recommendedFlyersValue)} pz` : unavailable],
    ["Copertura", ready ? coverageLabel : unavailable],
    ["Area", ready ? areaLabel : unavailable],
  ];
  return <aside className="vp-milano-summary" aria-label="Riepilogo territorio Milano" data-testid="milano-territory-summary">
    <div className="vp-milano-eyebrow">03 · Riepilogo</div><h2>La tua distribuzione</h2>
    <dl>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || "Dato non disponibile"}</dd></div>)}</dl>
    {!hasSelection && <p className="vp-milano-summary-note">{mode === "nil" ? "Cerca e aggiungi almeno un quartiere per vedere quantità e copertura." : "Milano è il contesto iniziale. Scegli Quartieri o Raggio per definire l’area da coprire."}</p>}
    {hasSelection && !ready && <div role="status" className="vp-milano-summary-note">{loading ? "Stiamo calcolando la copertura dell’area scelta." : "I dati territoriali non sono disponibili. Riprova prima di continuare."}{failed && <button type="button" onClick={onRetry}>Riprova</button>}</div>}
    {ready && (coverageDecisionRequired || nilResidual?.active) && <section className="vp-milano-quantity" aria-labelledby="milano-quantity-title">
      <h3 id="milano-quantity-title">Scegli la quantità</h3>
      <p>Hai {formatIntegerIT(availableFlyers)} volantini disponibili. Per l’area scelta ne consigliamo {formatIntegerIT(requiredFlyers)}.</p>
      <div className="vp-milano-quantity-actions">
        <button type="button" aria-pressed={coverageDecision === "useRecommended"} onClick={() => onQuantityDecision("useRecommended")}>Adatta a {formatIntegerIT(requiredFlyers)}</button>
        <button type="button" aria-pressed={coverageDecision === "keepCurrent"} onClick={() => onQuantityDecision("keepCurrent")}>Mantieni {formatIntegerIT(availableFlyers)}</button>
        <button type="button" aria-pressed={coverageDecision === "manual"} onClick={() => onQuantityDecision("manual")}>Altra quantità</button>
      </div>
      {coverageDecision === "manual" && <label className="vp-milano-manual">Quantità volantini<input type="number" min="1" value={manualFlyers} aria-invalid={!isCoverageDecisionValid} onChange={e => onManualQuantity(e.target.value)} /></label>}
      {nilResidual?.active && <details className="vp-milano-residual"><summary>Espandi l’area o gestisci i volantini residui</summary>
        <button type="button" disabled={!nilResidual.proposal} aria-pressed={nilResidual.strategy === "residual_auto"} onClick={() => nilResidual.onChoose("residual_auto")}>Espandi a {nilResidual.proposal?.name || "un quartiere vicino"}</button>
        <button type="button" aria-pressed={nilResidual.strategy === "residual_manual"} onClick={() => nilResidual.onChoose("residual_manual")}>Scegli un altro quartiere</button>
        <button type="button" aria-pressed={nilResidual.strategy === "residual_second_pass"} onClick={() => nilResidual.onChoose("residual_second_pass")}>Secondo passaggio nella stessa zona</button>
      </details>}
    </section>}
    {hasSelection && <details className="vp-milano-advanced"><summary>Dettagli avanzati</summary>
      <p>Fonti e criteri territoriali della configurazione corrente.</p>
      <dl><div><dt>Fonte famiglie</dt><dd>{truthModel.demography?.source || viewModel.primarySource || "Dato non disponibile"}</dd></div><div><dt>NIL coinvolti</dt><dd>{truthModel.zones?.involved ?? "—"}</dd></div><div><dt>Margine operativo</dt><dd>{formatIntegerIT(truthModel.quantity?.operationalMargin || 0)} pz</dd></div></dl>
      <button type="button" onClick={onOpenReport}>Apri Analisi Avanzata</button>
      {advancedContent}
    </details>}
    <Step2BottomActions {...actions} continueLabel={hasSelection ? actions.continueLabel : mode === "nil" ? "Aggiungi almeno un quartiere" : "Scegli Quartieri o Raggio"} step2ZonesReady={hasSelection && actions.step2ZonesReady} canContinueCalendar={hasSelection && actions.canContinueCalendar} />
  </aside>;
}
