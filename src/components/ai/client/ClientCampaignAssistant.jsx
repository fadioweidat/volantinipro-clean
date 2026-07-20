import React, { useMemo, useState } from "react";
import { buildClientAssistantResponses } from "../../../lib/ai/buildClientAssistantResponses.js";
import { ClientAssistantQuestion } from "./ClientAssistantQuestion.jsx";
import { ClientAssistantAnswer } from "./ClientAssistantAnswer.jsx";

export function ClientCampaignAssistant({ insights, loading = false }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const assistant = useMemo(() => buildClientAssistantResponses({ insights }), [insights]);
  const answerId = "client-ai-assistant-answer";
  const response = selectedQuestionId ? assistant.responses[selectedQuestionId] : null;

  return (
    <aside className="client-ai-assistant" aria-labelledby="client-ai-assistant-title">
      <p className="client-ai-home__eyebrow">Accesso guidato</p>
      <h3 id="client-ai-assistant-title">Assistente Campagna AI</h3>
      <p>Consulta risposte predefinite costruite solo dagli insight della tua Dashboard. Nessuna chat libera e nessuna azione automatica.</p>
      <div className="client-ai-assistant__questions" aria-label="Domande guidate">
        {assistant.questions.map((question) => (
          <ClientAssistantQuestion
            key={question.id}
            question={question}
            selected={question.id === selectedQuestionId}
            disabled={loading}
            controls={answerId}
            onSelect={setSelectedQuestionId}
          />
        ))}
      </div>
      <div className="client-ai-assistant__live" aria-live="polite">
        <ClientAssistantAnswer response={response} id={answerId} />
      </div>
      <span className="client-ai-assistant__status">Guidato · deterministico · sola lettura</span>
    </aside>
  );
}
