import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatNumber } from "../../../../lib/utils/format.js";
import { formatQuoteCurrency } from "../../../../lib/quotePricing.js";

// I numeri sono sempre quelli del piano geografico e del motore prezzi;
// non si sommano piu' le famiglie delle singole circonferenze.
export function Step4MultiZoneSummary({ summary, campaignTotal = null, campaignQuantity = null, onOwnerChange }) {
  if (!summary?.isMultiZone) return null;
  const plan = summary.territoryPlan;
  const byId = new Map((plan?.rows || []).map(row => [row.id, row]));
  const pvName = id => summary.zones.find(z => z.id === id)?.name || "Punto vendita";
  return <div data-testid="step4-multizone-summary" style={{ margin: "0 0 14px", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)", fontFamily: F.sans, color: C.white }}>
    <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 9 }}>{summary.zoneCount} punti vendita · Unione dei raggi</div>
    {!plan?.ready && <div role="alert" data-testid="multi-pv-unavailable" style={{ padding: 10, color: "#FDE68A", border: "1px solid #FDE68A", borderRadius: 7 }}>
      Famiglie uniche e prezzo non verificabili. Preventivo bloccato: {(plan?.issues || []).slice(0, 4).join(" · ")}
    </div>}
    {summary.zones.map(pv => {
      const allocation = byId.get(pv.id);
      return <div key={pv.id} data-testid="step4-pos-row" style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,.12)" }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap", fontSize: 12 }}>
          <span><strong>{pv.name}</strong><br/><small style={{ color: "#ddd" }}>{pv.location} · {pv.modeLabel}</small></span>
          <span style={{ textAlign: "right" }}>{formatNumber(pv.quantity, "—")} volantini<br/>
            <strong>{formatNumber(allocation?.families, "—")} famiglie uniche assegnate</strong><br/>
            {allocation?.distributionPrice != null && `Distribuzione ${formatQuoteCurrency(allocation.distributionPrice)}`}</span>
        </div>
        {!!allocation?.municipalities?.length && <div style={{ marginTop: 8, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
            <thead><tr>{["Comune", "Famiglie uniche", "Volantini", "Fascia", "€/1.000 del PV", "Prezzo"].map(h => <th key={h} style={{ padding: "5px 4px", textAlign: "left", borderBottom: "1px solid #777" }}>{h}</th>)}</tr></thead>
            <tbody>{allocation.municipalities.map(c => <tr key={c.name} data-testid="step4-pos-comune-row">
              <td style={{ padding: 4 }}>{c.name}</td><td>{formatNumber(c.families)}</td><td>{formatNumber(c.quantity)}</td><td>{c.tier.replaceAll("_", " ")}</td><td>{formatQuoteCurrency(c.ratePerThousand)}</td><td>{formatQuoteCurrency(c.price)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {allocation?.minimumAdjustment > 0 && <p data-testid="multi-pv-single-minimum" style={{ margin: "5px 0", fontSize: 11 }}>
          Adeguamento al minimo del PV (una sola volta): {formatQuoteCurrency(allocation.minimumAdjustment)}.
        </p>}
      </div>;
    })}
    <div style={{ paddingTop: 9, borderTop: "1px solid #aaa", fontSize: 13, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
      <strong>TOTALE · {formatNumber(campaignQuantity ?? summary.totalQuantity, "—")} volantini</strong>
      <span data-testid="multi-pv-unique-families"><strong>{formatNumber(plan?.ready ? plan.totalFamilies : null, "—")} famiglie uniche stimate</strong>{campaignTotal != null && <div>Totale preventivo {formatQuoteCurrency(campaignTotal)}</div>}</span>
    </div>
    {plan?.ready && <p style={{ fontSize: 11, color: "#ddd", marginBottom: 8 }}>{plan.method}. L'assegnazione segue la distanza minima: le parti condivise non vengono attribuite due volte. Ogni quota comunale usa la tariffa per 1.000 calcolata sulla quantita totale del suo PV; minimo applicato al massimo una volta per PV.</p>}
    {(plan?.capacityWarnings || []).map((warning, i) => <div role="alert" key={i} data-testid="multi-pv-capacity-warning" style={{ fontSize: 12, padding: 8, background: "rgba(251,191,36,.1)", color: "#FDE68A", marginTop: 6 }}>{warning}</div>)}
    {!!plan?.ownershipChoices?.length && <details style={{ padding: "8px 0", fontSize: 11.5 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Modifica assegnazione delle aree sovrapposte ({plan.ownershipChoices.length})</summary>
      {plan.ownershipChoices.map(choice => <label key={choice.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 8 }}>
        <span>{choice.name} ({choice.municipality})</span>
        <select data-testid="multi-pv-owner-select" aria-label={`Proprietario sovrapposizione ${choice.name}`} value={choice.preferredPvId || ""} onChange={event => onOwnerChange?.(choice.key, event.target.value || null)} style={{ maxWidth: "55%", padding: 6, color: "#111" }}>
          <option value="">PV più vicino (automatico)</option>
          {choice.eligiblePvIds.map(id => <option key={id} value={id}>{pvName(id)}</option>)}
        </select>
      </label>)}
      <p>La scelta manuale ha priorità solo nella parte condivisa del territorio, non sposta le parti esclusive.</p>
    </details>}
  </div>;
}
