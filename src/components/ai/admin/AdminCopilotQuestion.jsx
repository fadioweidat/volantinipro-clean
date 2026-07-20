import React from "react";

export function AdminCopilotQuestion({ question, selected = false, disabled = false, controls, onSelect }) {
  return (
    <button type="button" className="admin-ai-copilot__question" aria-pressed={selected} aria-controls={controls} disabled={disabled} onClick={() => onSelect(question.id)}>
      {question.label}
    </button>
  );
}
