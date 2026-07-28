import React from "react";
import { AdminDecisionItem } from "./AdminDecisionItem.jsx";
import "../ai-components.css";

export function AdminDecisionCenter({ decisionCenter, loading = false, error = null }) {
  const items = Array.isArray(decisionCenter?.items) ? decisionCenter.items : [];
  return (
    <section className="admin-decision-center" aria-labelledby="admin-decision-center-title">
      <header className="admin-decision-center__header">
        <div><p className="admin-ai-home__eyebrow">Centro controllo</p><h3 id="admin-decision-center-title">Centro Decisionale</h3><p>Vista consultiva ordinata da regole statiche. Nessun punteggio, previsione o decisione applicata.</p></div>
        <span>{items.length} {items.length === 1 ? "elemento" : "elementi"}</span>
      </header>
      {decisionCenter?.access === "denied" ? <div className="admin-ai-state admin-ai-state--error" role="status"><strong>Accesso negato</strong><span>Nessun valore, collegamento o conclusione viene esposto.</span></div>
        : loading ? <div className="admin-decision-center__loading" aria-busy="true" aria-label="Caricamento Centro Decisionale"><span /><span /><span /></div>
          : items.length === 0 ? <div className="admin-ai-state"><strong>Nessun elemento decisionale disponibile</strong><span>Gli insight approvati non hanno prodotto elementi ordinabili.</span></div>
            : <ol className="admin-decision-center__list">{items.map((item, index) => <AdminDecisionItem key={item.id} item={item} position={index + 1} />)}</ol>}
      {error && <p className="admin-decision-center__caveat" role="alert">Una fonte ha restituito un errore. Il Centro mostra soltanto lo stato di indisponibilita e sopprime i link relativi.</p>}
      <details className="admin-decision-center__ordering"><summary>Regola di ordinamento</summary><p>{decisionCenter?.orderingRule || "Regola non disponibile."}</p></details>
    </section>
  );
}
