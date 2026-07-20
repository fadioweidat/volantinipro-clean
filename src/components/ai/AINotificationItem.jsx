import React from "react";
import { AIDataBadge } from "./AIDataBadge.jsx";
import { AISourcePopover } from "./AISourcePopover.jsx";
import { FreshnessIndicator } from "./FreshnessIndicator.jsx";

export function AINotificationItem({ notification }) {
  const denied = notification.state === "denied";
  return (
    <li className={`ai-notification-item ai-notification-item--${notification.state}`}>
      <article aria-labelledby={`${notification.id}-title`}>
        <div className="ai-notification-item__topline">
          <span className={`ai-notification-level ai-notification-level--${notification.level.replaceAll(" ", "-")}`}>{notification.level}</span>
          <span>{notification.audience}</span>
        </div>
        <code>{notification.id}</code>
        <h4 id={`${notification.id}-title`}>{notification.title}</h4>
        <p>{notification.description}</p>
        <div className="ai-notification-item__metadata">
          <AIDataBadge category={notification.category} />
          {!denied && <FreshnessIndicator freshness={notification.datum.freshness} observedAt={notification.timestamp} />}
          <span>Stato: {notification.state}</span>
        </div>
        {notification.unavailableReason && <p className="ai-notification-item__unavailable">Motivo: {notification.unavailableReason}</p>}
        <div className="ai-notification-item__footer">
          {!denied && <AISourcePopover datum={notification.datum} />}
          {notification.href && <a href={notification.href}>Apri schermata</a>}
        </div>
      </article>
    </li>
  );
}
