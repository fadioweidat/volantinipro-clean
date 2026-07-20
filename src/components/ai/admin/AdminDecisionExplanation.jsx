import React from "react";

export function AdminDecisionExplanation({ item }) {
  if (!item) return null;
  return (
    <details className="admin-decision-explanation">
      <summary>Perche compare qui</summary>
      <div><p><strong>Inclusione:</strong> {item.inclusionReason}</p><p><strong>Posizione:</strong> {item.positionReason}</p></div>
    </details>
  );
}
