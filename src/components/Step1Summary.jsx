import React from "react";
import { formatFlyersRange } from "../lib/pricing/handToHandPricing.js";

// it-IT non raggruppa i numeri di 4 cifre ("1087,12"): sempre "1.087,12".
const eur = (n) => {
  const [int, dec] = Number(n || 0).toFixed(2).split(".");
  return `€ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};
// Importo sempre su una riga (mai "€" o i centesimi da soli nella colonna stretta).
// Stile ereditato dal valore: `.vp-s1-estimate span` (Step1.jsx) e' pensato per le etichette.
const Amount = ({ value }) => <span style={{ whiteSpace: "nowrap", font: "inherit", color: "inherit", textTransform: "none", letterSpacing: "normal" }}>{eur(value)}</span>;

export const Step1Summary = React.memo(function Step1Summary({ rows, issues, isMobile, estimate }) {
  const printActive = Boolean(estimate?.printActive);
  // Door to Door prima della zona: intervallo reale della griglia (min-max).
  const range = estimate?.distributionRange || null;
  // Hand to Hand: tariffa oraria per operatore, prezzo calcolabile gia' nello Step 1.
  const h2h = estimate?.h2h || null;
  const h2hRows = h2h ? (
    <>
      <div className="vp-s1-summary-row"><span>Distribuzione<br /><small style={{ opacity: 0.7 }}>{h2h.calculation}</small></span><strong><Amount value={h2h.total} /></strong></div>
      <small>Volantini stimati: circa {formatFlyersRange(h2h.flyersRange)}, secondo luogo e orario. {h2h.travelNote}</small>
    </>
  ) : null;
  const content = (
    <div className="vp-s1-summary-body">
      <div className="vp-s1-summary-status">
        <span className={issues.length ? "is-pending" : "is-ready"} />
        {issues.length ? `${issues.length} scelte da completare` : "Configurazione pronta"}
      </div>
      <div className="vp-s1-summary-rows">
        {rows.map((row) => (
          <div key={row.label} className="vp-s1-summary-row">
            <span>{row.label}</span><strong className={String(row.val).includes("Da selezionare") ? "is-empty" : ""}>{row.val}</strong>
          </div>
        ))}
      </div>
      <div className="vp-s1-estimate">
        {printActive ? (
          <>
            <div className="vp-s1-summary-row"><span>Stampa{estimate.printSpecLabel ? <><br /><small style={{ opacity: 0.7 }}>{estimate.printSpecLabel}</small></> : null}</span><strong>{estimate.printUnknown ? "Da verificare" : <Amount value={estimate.printCost} />}</strong></div>
            {estimate.printTimingNote && <small>{estimate.printTimingNote}</small>}
            {h2h ? (
              <>
                {h2hRows}
                <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? <><Amount value={h2h.total} /> + stampa</> : <Amount value={h2h.total + estimate.printCost} />}</strong></div>
                <small>Urgenza e piano, se scelti, sono già inclusi. Prezzi IVA esclusa.</small>
              </>
            ) : range ? (
              <>
                <div className="vp-s1-summary-row"><span>Distribuzione</span><strong>da <Amount value={range.min} /> a <Amount value={range.max} /></strong></div>
                <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? <>da <Amount value={range.min} /> a <Amount value={range.max} /></> : <>da <Amount value={range.min + estimate.printCost} /> a <Amount value={range.max + estimate.printCost} /></>}</strong></div>
                <small>La distribuzione dipende dalla zona: il prezzo esatto si calcola nello Step 2, dopo la scelta della zona. Prezzi IVA esclusa.</small>
              </>
            ) : (
              <>
                {/* Business: nessuna tariffa per 1.000 pubblicata (stesso testo della homepage). */}
                <div className="vp-s1-summary-row"><span>Distribuzione</span><strong>{estimate.distributionNote || "Prezzo calcolato sulla tua zona"}</strong></div>
                <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? "Da verificare" : <><Amount value={estimate.printCost} /> + distribuzione</>}</strong></div>
                <small>Il prezzo della distribuzione si calcola nel preventivo, in base a zona e servizio. Prezzi IVA esclusa.</small>
              </>
            )}
          </>
        ) : h2h ? (
          <>
            {h2hRows}
            <small>Urgenza e piano, se scelti, sono già inclusi. Prezzi IVA esclusa.</small>
          </>
        ) : (
          <>
            <span>Preventivo</span>
            <strong>In preparazione</strong>
            <small>Il prezzo verrà calcolato dopo l'analisi territoriale.</small>
          </>
        )}
      </div>
      {issues.length > 0 && <div className="vp-s1-summary-next"><b>Prossima scelta:</b> {issues[0].label}</div>}
    </div>
  );
  if (isMobile) {
    return (
      <details className="vp-s1-summary vp-s1-summary-mobile">
        <summary>Riepilogo · {rows[0]?.val} · {rows[3]?.val}<span>{issues.length ? `${issues.length} da completare` : "Pronto"}</span></summary>
        {content}
      </details>
    );
  }
  return <div className="vp-s1-summary"><div className="vp-s1-summary-title">Riepilogo Step 1</div>{content}</div>;
});
