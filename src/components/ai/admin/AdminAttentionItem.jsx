import React from "react";
import { AIDataBadge } from "../AIDataBadge.jsx";
import { AISourcePopover } from "../AISourcePopover.jsx";
import { FreshnessIndicator } from "../FreshnessIndicator.jsx";
import "../ai-components.css";

export function AdminAttentionItem({ item }) {
  if (!item?.datum) return null;
  const { datum, href } = item;
  return (
    <article className="admin-ai-attention-item">
      <div className="admin-ai-attention-item__meta">
        <AIDataBadge category={datum.category} />
        <FreshnessIndicator freshness={datum.freshness} observedAt={datum.observedAt} />
      </div>
      <h4>{datum.label}</h4>
      <p>{datum.value}</p>
      <div className="admin-ai-attention-item__actions">
        <AISourcePopover datum={datum} />
        {href && <a href={href}>Apri schermata operativa</a>}
      </div>
    </article>
  );
}
