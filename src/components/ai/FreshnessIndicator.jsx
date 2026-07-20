import React from "react";
import { AI_FRESHNESS_STATES } from "../../lib/ai/insight-contract.js";
import "./ai-components.css";

const LABELS = Object.freeze({
  [AI_FRESHNESS_STATES.CURRENT]: "Dato aggiornato",
  [AI_FRESHNESS_STATES.STALE]: "Dato da aggiornare",
  [AI_FRESHNESS_STATES.UNKNOWN]: "Freshness sconosciuta",
  [AI_FRESHNESS_STATES.NOT_APPLICABLE]: "Freshness non applicabile",
});

export function FreshnessIndicator({ freshness, observedAt = null }) {
  const state = freshness?.state ?? AI_FRESHNESS_STATES.UNKNOWN;
  const label = LABELS[state] ?? LABELS[AI_FRESHNESS_STATES.UNKNOWN];
  const dateLabel = observedAt && Number.isFinite(Date.parse(observedAt))
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(observedAt))
    : null;
  return (
    <span className={`ai-freshness ai-freshness--${state}`} title={freshness?.reason || label}>
      <span className="ai-freshness__dot" aria-hidden="true" />
      <span>{label}</span>
      {dateLabel && <time dateTime={observedAt}> · {dateLabel}</time>}
    </span>
  );
}
