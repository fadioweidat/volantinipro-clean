import React, { useMemo, useState } from "react";
import { AIInsightCard } from "../AIInsightCard.jsx";
import { buildClientCampaignAssistantResponses } from "../../../lib/ai/buildClientCampaignAssistantResponses.js";
import { ClientAssistantQuestion } from "./ClientAssistantQuestion.jsx";
import { ClientAssistantAnswer } from "./ClientAssistantAnswer.jsx";
import "../ai-components.css";

export function ClientCampaignDetailAI({ insights, visibleItemIds = null, title = "Riepilogo AI della campagna", eyebrow = "Dettaglio verificabile", loading = false, error = null }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const assistant = useMemo(() => buildClientCampaignAssistantResponses({ insights }), [insights]);
  const allowedIds = visibleItemIds ? new Set(visibleItemIds) : null;
  const items = (insights?.items ?? []).filter((datum) => !allowedIds || allowedIds.has(datum.id));
  const unavailableCount = items.filter((datum) => datum.value === null).length;
  const answerId = `client-campaign-ai-answer-${visibleItemIds ? "tracking" : "detail"}`;
  const response = selectedQuestionId ? assistant.responses[selectedQuestionId] : null;

  return (
    <section className="client-campaign-ai" aria-labelledby={`${answerId}-title`}>
      <header className="client-campaign-ai__header">
        <div><p className="client-ai-home__eyebrow">{eyebrow}</p><h2 id={`${answerId}-title`}>{title}</h2><p>I valori provengono dalla campagna autorizzata e dai risultati già prodotti dal sistema.</p></div>
        <span className="client-campaign-ai__ownership">{insights?.ownershipConfirmed ? "Proprietà verificata" : "Accesso non verificato"}</span>
      </header>
      {error ? <div className="client-ai-state client-ai-state--error" role="alert"><strong>Dati AI non caricati</strong><span>Nessuna conclusione viene prodotta durante un errore.</span></div>
        : loading ? <div className="client-campaign-ai__grid" aria-label="Caricamento insight campagna"><AIInsightCard loading /><AIInsightCard loading /><AIInsightCard loading /></div>
          : items.length === 0 ? <div className="client-ai-state"><strong>Nessun insight disponibile</strong><span>La vista non ha ricevuto dati autorizzati.</span></div>
            : <><div className="client-campaign-ai__grid">{items.map((datum) => <AIInsightCard key={datum.id} datum={datum} />)}</div>{unavailableCount > 0 && <p className="client-campaign-ai__missing" role="status">{unavailableCount} {unavailableCount === 1 ? "dato non è disponibile" : "dati non sono disponibili"}; nessun fallback numerico è stato applicato.</p>}</>}

      <aside className="client-campaign-ai__assistant" aria-labelledby={`${answerId}-assistant-title`}>
        <div className="client-campaign-ai__assistant-copy"><p className="client-ai-home__eyebrow">Assistente Campagna AI</p><h3 id={`${answerId}-assistant-title`}>Domande sulla campagna selezionata</h3><p>Nessuna chat libera, ricostruzione GPS o valutazione operativa.</p></div>
        <div className="client-campaign-ai__questions" aria-label="Domande guidate sulla campagna">{assistant.questions.map((question) => <ClientAssistantQuestion key={question.id} question={question} selected={selectedQuestionId === question.id} disabled={loading} controls={answerId} onSelect={setSelectedQuestionId} />)}</div>
        <div className="client-campaign-ai__live" aria-live="polite"><ClientAssistantAnswer response={response} id={answerId} /></div>
      </aside>
    </section>
  );
}
