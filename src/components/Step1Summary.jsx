import React from "react";

const eur = (n) => `€ ${Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Step1Summary = React.memo(function Step1Summary({ rows, issues, isMobile, estimate }) {
  const printActive = Boolean(estimate?.printActive);
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
            <div className="vp-s1-summary-row"><span>Stampa{estimate.printSpecLabel ? <><br /><small style={{ opacity: 0.7 }}>{estimate.printSpecLabel}</small></> : null}</span><strong>{estimate.printUnknown ? "Da verificare" : eur(estimate.printCost)}</strong></div>
            <div className="vp-s1-summary-row"><span>Distribuzione (stima)</span><strong>{eur(estimate.distributionCost)}</strong></div>
            <div className="vp-s1-summary-row"><span>Totale stimato</span><strong>{estimate.printUnknown ? eur(estimate.distributionCost) : eur(estimate.total)}</strong></div>
            <small>Il costo distribuzione è una stima: viene calcolato dopo l'analisi territoriale nello Step 2. Prezzi IVA esclusa.</small>
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
