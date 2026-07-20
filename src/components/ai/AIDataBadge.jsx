import React from "react";
import { AI_DATA_CATEGORIES } from "../../lib/ai/insight-contract.js";
import "./ai-components.css";

const CATEGORY_CLASS = Object.freeze({
  [AI_DATA_CATEGORIES.REAL]: "real",
  [AI_DATA_CATEGORIES.DERIVED]: "derived",
  [AI_DATA_CATEGORIES.ESTIMATE]: "estimate",
  [AI_DATA_CATEGORIES.UNAVAILABLE]: "unavailable",
});

export function AIDataBadge({ category }) {
  const className = CATEGORY_CLASS[category] ?? "unavailable";
  const label = CATEGORY_CLASS[category] ? category : AI_DATA_CATEGORIES.UNAVAILABLE;
  return <span className={`ai-data-badge ai-data-badge--${className}`}>{label}</span>;
}
