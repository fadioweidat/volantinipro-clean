import React from "react";

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
            {range ? (
              <>
                <div className="vp-s1-summary-row"><span>Distribuzione</span><strong>da <Amount value={range.min} /> a <Amount value={range.max} /></strong></div>
                <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? <>da <Amount value={range.min} /> a <Amount value={range.max} /></> : <>da <Amount value={range.min + estimate.printCost} /> a <Amount value={range.max + estimate.printCost} /></>}</strong></div>
                <small>La distribuzione dipende dalla zona: il prezzo esatto si calcola nello Step 2, dopo la scelta della zona. Prezzi IVA esclusa.</small>
              </>
            ) : (
              <>
                <div className="vp-s1-summary-row"><span>Distribuzione (stima)</span><strong>{eur(estimate.distributionCost)}</strong></div>
                <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? eur(estimate.distributionCost) : eur(estimate.total)}</strong></div>
                <small>Il costo distribuzione è una stima: viene calcolato dopo l'analisi territoriale nello Step 2. Prezzi IVA esclusa.</small>
              </>
            )}
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
