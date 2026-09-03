import React from "react";
import { AI_DATA_CATEGORIES, AI_UNAVAILABLE_CODES, AI_VALUE_TYPES } from "../../lib/ai/insight-contract.js";
import { AIDataBadge } from "./AIDataBadge.jsx";
import { AISourcePopover } from "./AISourcePopover.jsx";
import { FreshnessIndicator } from "./FreshnessIndicator.jsx";
import "./ai-components.css";

function formatDatumValue(datum) {
  if (!datum || datum.category === AI_DATA_CATEGORIES.UNAVAILABLE || datum.value === null) return "Non disponibile";
  if (datum.valueType === AI_VALUE_TYPES.CURRENCY) return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(datum.value);
  if (datum.valueType === AI_VALUE_TYPES.DATE) return new Intl.DateTimeFormat("it-IT", { dateStyle: "short" }).format(new Date(datum.value));
  if (typeof datum.value === "number") return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(datum.value);
  if (Array.isArray(datum.value)) return datum.value.join(", ");
  return String(datum.value);
}

export function AIInsightCard({ datum, loading = false, emphasis = "standard" }) {
  if (loading) {
    return <article className="ai-insight-card ai-insight-card--loading" aria-busy="true" aria-label="Caricamento dato"><span /><span /><span /></article>;
  }
  if (!datum) return null;
  const unavailable = datum.category === AI_DATA_CATEGORIES.UNAVAILABLE;
  const denied = unavailable && datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED;
  return (
    <article className={`ai-insight-card ai-insight-card--${emphasis}${unavailable ? " ai-insight-card--unavailable" : ""}`}>
      <div className="ai-insight-card__topline">
        <AIDataBadge category={datum.category} />
        <FreshnessIndicator freshness={datum.freshness} observedAt={datum.observedAt} />
      </div>
      <p className="ai-insight-card__label">{datum.label}</p>
      <p className="ai-insight-card__value">{formatDatumValue(datum)}{!unavailable && datum.unit && datum.valueType !== AI_VALUE_TYPES.CURRENCY ? <small> {datum.unit}</small> : null}</p>
      {unavailable && <p className="ai-insight-card__reason">{denied ? "Accesso negato. " : ""}{datum.unavailable.reason}</p>}
      <AISourcePopover datum={datum} />
    </article>
  );
}
