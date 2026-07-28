import React from "react";
import { AI_DATA_CATEGORIES, AI_UNAVAILABLE_CODES, AI_VALUE_TYPES } from "../../../lib/ai/insight-contract.js";
import { AIDataBadge } from "../AIDataBadge.jsx";
import { AISourcePopover } from "../AISourcePopover.jsx";
import { FreshnessIndicator } from "../FreshnessIndicator.jsx";

function formatEvidenceValue(datum) {
  if (datum.category === AI_DATA_CATEGORIES.UNAVAILABLE || datum.value === null) return "Non disponibile";
  if (datum.valueType === AI_VALUE_TYPES.CURRENCY) return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(datum.value);
  if (datum.valueType === AI_VALUE_TYPES.DATE) return new Intl.DateTimeFormat("it-IT", { dateStyle: "short" }).format(new Date(datum.value));
  if (typeof datum.value === "number") return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(datum.value);
  return String(datum.value);
}

export function AdminCopilotAnswer({ response, id }) {
  if (!response) return <div className="admin-ai-copilot__answer admin-ai-copilot__answer--empty" id={id}><p>Scegli una domanda guidata per consultare gli insight operativi.</p></div>;
  return (
    <div className={`admin-ai-copilot__answer admin-ai-copilot__answer--${response.state}`} id={id} role="region" aria-label={`Risposta: ${response.question}`}>
      <p className="admin-ai-copilot__answer-label">Risposta deterministica</p>
      <p className="admin-ai-copilot__answer-text">{response.text}</p>
      <ul className="admin-ai-copilot__evidence" aria-label="Dati usati per la risposta">
        {response.evidence.map((datum) => {
          const denied = datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED;
          return <li key={datum.id}><div className="admin-ai-copilot__evidence-topline"><AIDataBadge category={datum.category} /><FreshnessIndicator freshness={datum.freshness} observedAt={datum.observedAt} /></div><strong>{datum.label}</strong><span>{formatEvidenceValue(datum)}{denied ? " · Accesso negato" : ""}</span>{datum.unavailable && <small>{datum.unavailable.reason}</small>}<AISourcePopover datum={datum} /></li>;
        })}
      </ul>
      {response.links.length > 0 && <nav className="admin-ai-copilot__answer-links" aria-label="Collegamenti operativi della risposta">{response.links.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}</nav>}
    </div>
  );
}
