import React from "react";
import { AI_DATA_CATEGORIES, AI_VALUE_TYPES } from "../../../lib/ai/insight-contract.js";
import { AIDataBadge } from "../AIDataBadge.jsx";
import { AISourcePopover } from "../AISourcePopover.jsx";
import { FreshnessIndicator } from "../FreshnessIndicator.jsx";
import { AdminDecisionExplanation } from "./AdminDecisionExplanation.jsx";

function formatValue(datum) {
  if (!datum || datum.category === AI_DATA_CATEGORIES.UNAVAILABLE || datum.value === null) return "Non disponibile";
  if (datum.valueType === AI_VALUE_TYPES.CURRENCY) return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(datum.value);
  if (datum.valueType === AI_VALUE_TYPES.DATE) return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(datum.value));
  if (typeof datum.value === "number") return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(datum.value)}${datum.unit ? ` ${datum.unit}` : ""}`;
  return String(datum.value);
}

export function AdminDecisionItem({ item, position }) {
  if (!item?.datum) return null;
  return (
    <li className={`admin-decision-item admin-decision-item--${item.state}`}>
      <article aria-labelledby={`${item.id}-title`}>
        <div className="admin-decision-item__topline">
          <span className={`admin-decision-level admin-decision-level--${item.level.replaceAll(" ", "-")}`}>{item.level}</span>
          <span className="admin-decision-item__position">Posizione {position}</span>
        </div>
        <code>{item.id}</code>
        <h4 id={`${item.id}-title`}>{item.title}</h4>
        <p className="admin-decision-item__value">{formatValue(item.datum)}</p>
        <p className="admin-decision-item__reason">{item.inclusionReason}</p>
        <div className="admin-decision-item__metadata"><AIDataBadge category={item.datum.category} /><FreshnessIndicator freshness={item.datum.freshness} observedAt={item.timestamp} /><span>Stato: {item.state}</span></div>
        <div className="admin-decision-item__footer"><AISourcePopover datum={item.datum} />{item.href && <a href={item.href}>Apri schermata operativa</a>}</div>
        <AdminDecisionExplanation item={item} />
      </article>
    </li>
  );
}
