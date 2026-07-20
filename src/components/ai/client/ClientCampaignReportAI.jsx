import React, { useMemo, useState } from "react";
import { AIInsightCard } from "../AIInsightCard.jsx";
import { buildClientReportAssistantResponses } from "../../../lib/ai/buildClientReportAssistantResponses.js";
import { ClientAssistantQuestion } from "./ClientAssistantQuestion.jsx";
import { ClientAssistantAnswer } from "./ClientAssistantAnswer.jsx";
import { ClientHistoricalSuggestions } from "./ClientHistoricalSuggestions.jsx";
import "../ai-components.css";

export function ClientCampaignReportAI({ reportInsights, historicalSuggestions, loading = false, error = null }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const assistant = useMemo(() => buildClientReportAssistantResponses({ reportInsights, historicalSuggestions }), [reportInsights, historicalSuggestions]);
  const items = Array.isArray(reportInsights?.items) ? reportInsights.items : [];
  const response = selectedQuestionId ? assistant.responses[selectedQuestionId] : null;
  const answerId = "client-report-ai-answer";
  return (
    <section className="client-campaign-ai client-report-ai" aria-labelledby="client-report-ai-title">
      <header className="client-campaign-ai__header">
        <div><p className="client-ai-home__eyebrow">Report finale verificabile</p><h2 id="client-report-ai-title">Lettura AI del risultato</h2><p>Il riepilogo riusa esclusivamente valori gia disponibili nel report e nelle fonti autorizzate.</p></div>
        <span className="client-campaign-ai__ownership">{reportInsights?.ownershipConfirmed ? "Proprieta verificata" : "Accesso non verificato"}</span>
      </header>
      {error ? <div className="client-ai-state client-ai-state--error" role="alert"><strong>Dati report non caricati</strong><span>Nessuna conclusione viene prodotta durante un errore.</span></div>
        : loading ? <div className="client-campaign-ai__grid" aria-label="Caricamento lettura AI report"><AIInsightCard loading /><AIInsightCard loading /><AIInsightCard loading /></div>
          : items.length === 0 ? <div className="client-ai-state"><strong>Nessun dato finale disponibile</strong><span>Il report non ha ricevuto dati autorizzati.</span></div>
            : <div className="client-campaign-ai__grid">{items.map((datum) => <AIInsightCard key={datum.id} datum={datum} />)}</div>}

      <ClientHistoricalSuggestions suggestions={historicalSuggestions} loading={loading} error={error} />

      <aside className="client-campaign-ai__assistant" aria-labelledby="client-report-assistant-title">
        <div className="client-campaign-ai__assistant-copy"><p className="client-ai-home__eyebrow">Assistente Campagna AI</p><h3 id="client-report-assistant-title">Domande sul report finale</h3><p>Risposte guidate senza chat libera, previsioni o azioni.</p></div>
        <div className="client-campaign-ai__questions" aria-label="Domande guidate sul report finale">{assistant.questions.map((question) => <ClientAssistantQuestion key={question.id} question={question} selected={selectedQuestionId === question.id} disabled={loading} controls={answerId} onSelect={setSelectedQuestionId} />)}</div>
        <div className="client-campaign-ai__live" aria-live="polite"><ClientAssistantAnswer response={response} id={answerId} /></div>
      </aside>
    </section>
  );
}
