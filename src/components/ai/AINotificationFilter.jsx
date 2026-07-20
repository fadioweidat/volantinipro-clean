import React from "react";

export function AINotificationFilter({ filters, activeFilter, onChange }) {
  return (
    <div className="ai-notification-filter" role="group" aria-label="Filtra notifiche per tipologia">
      {filters.map((filter) => (
        <button key={filter.id} type="button" aria-pressed={activeFilter === filter.id} onClick={() => onChange(filter.id)}>
          {filter.label}<span>{filter.count}</span>
        </button>
      ))}
    </div>
  );
}
