import React from "react";

export const Step1Summary = React.memo(function Step1Summary({ rows, issues, isMobile }) {
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
        <span>Preventivo</span>
        <strong>In preparazione</strong>
        <small>Il prezzo verrà calcolato dopo l'analisi territoriale.</small>
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
