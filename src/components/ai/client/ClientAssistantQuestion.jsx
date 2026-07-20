import React from "react";

export function ClientAssistantQuestion({ question, selected = false, disabled = false, controls, onSelect }) {
  return (
    <button
      type="button"
      className="client-ai-assistant__question"
      aria-pressed={selected}
      aria-controls={controls}
      disabled={disabled}
      onClick={() => onSelect(question.id)}
    >
      {question.label}
    </button>
  );
}
