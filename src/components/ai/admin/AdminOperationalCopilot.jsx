import React, { useMemo, useState } from "react";
import { buildAdminCopilotResponses } from "../../../lib/ai/buildAdminCopilotResponses.js";
import { buildAdminDecisionCenterResponses } from "../../../lib/ai/buildAdminDecisionCenterResponses.js";
import { AdminCopilotQuestion } from "./AdminCopilotQuestion.jsx";
import { AdminCopilotAnswer } from "./AdminCopilotAnswer.jsx";

export function AdminOperationalCopilot({ insights, decisionCenter = null, loading = false }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const copilot = useMemo(() => buildAdminCopilotResponses({ insights }), [insights]);
  const decisionCopilot = useMemo(() => decisionCenter ? buildAdminDecisionCenterResponses({ decisionCenter }) : null, [decisionCenter]);
  const questions = decisionCopilot ? [...copilot.questions, ...decisionCopilot.questions] : copilot.questions;
  const responses = decisionCopilot ? { ...copilot.responses, ...decisionCopilot.responses } : copilot.responses;
  const answerId = "admin-ai-copilot-answer";
  const response = selectedQuestionId ? responses[selectedQuestionId] : null;
  return (
    <aside className="admin-ai-copilot" aria-labelledby="admin-ai-copilot-title">
      <p className="admin-ai-home__eyebrow">Accesso guidato</p>
      <h3 id="admin-ai-copilot-title">Copilota Operativo AI</h3>
      <p>Consulta risposte predefinite dagli insight Admin. Nessuna chat libera, decisione applicata o modifica ai dati.</p>
      <div className="admin-ai-copilot__questions" aria-label="Domande guidate Admin">
        {questions.map((question) => <AdminCopilotQuestion key={question.id} question={question} selected={question.id === selectedQuestionId} disabled={loading} controls={answerId} onSelect={setSelectedQuestionId} />)}
      </div>
      <div className="admin-ai-copilot__live" aria-live="polite"><AdminCopilotAnswer response={response} id={answerId} /></div>
      <span className="admin-ai-copilot__status">Guidato · deterministico · sola lettura</span>
    </aside>
  );
}
