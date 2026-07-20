import React, { useMemo, useState } from "react";
import { AI_NOTIFICATION_LEVELS } from "../../lib/ai/buildClientNotifications.js";
import { AINotificationFilter } from "./AINotificationFilter.jsx";
import { AINotificationItem } from "./AINotificationItem.jsx";
import "./ai-components.css";

const FILTER_DEFINITIONS = Object.freeze([
  { id: "all", label: "Tutte" },
  { id: AI_NOTIFICATION_LEVELS.ATTENTION, label: "Attenzione" },
  { id: AI_NOTIFICATION_LEVELS.VERIFY, label: "Da verificare" },
  { id: AI_NOTIFICATION_LEVELS.INFORMATION, label: "Informative" },
  { id: AI_NOTIFICATION_LEVELS.UNAVAILABLE, label: "Non disponibili" },
]);

export function AINotificationCenter({ center, loading = false, error = null }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const notifications = Array.isArray(center?.notifications) ? center.notifications : [];
  const filters = useMemo(() => FILTER_DEFINITIONS.map((definition) => ({
    ...definition,
    count: definition.id === "all" ? center?.authorizedCount ?? 0 : notifications.filter((item) => item.level === definition.id && item.state !== "denied").length,
  })), [center?.authorizedCount, notifications]);
  const visible = activeFilter === "all" ? notifications : notifications.filter((item) => item.level === activeFilter);
  const titleId = `ai-notification-center-${center?.audience ?? "unknown"}`;

  return (
    <section className="ai-notification-center" aria-labelledby={titleId}>
      <header className="ai-notification-center__header">
        <div><p className="client-ai-home__eyebrow">Aggiornamenti consultivi</p><h2 id={titleId}>Centro Notifiche</h2><p>Derivato esclusivamente dagli insight autorizzati. Nessuna persistenza o stato letto/non letto.</p></div>
        <span aria-live="polite">{center?.authorizedCount ?? 0} autorizzate</span>
      </header>
      {center?.access === "denied" ? (
        <div className="ai-notification-state ai-notification-state--error" role="status"><strong>Accesso negato</strong><span>Nessuna notifica, evidenza o collegamento viene esposto.</span></div>
      ) : loading ? (
        <div className="ai-notification-loading" aria-busy="true" aria-label="Caricamento Centro Notifiche"><span /><span /></div>
      ) : (
        <>
          {error && <div className="ai-notification-state ai-notification-state--error" role="alert"><strong>Fonte non disponibile</strong><span>Il Centro mostra soltanto gli stati di errore proiettati e non genera conclusioni.</span></div>}
          <AINotificationFilter filters={filters} activeFilter={activeFilter} onChange={setActiveFilter} />
          {visible.length > 0 ? <ul className="ai-notification-list">{visible.map((item) => <AINotificationItem key={item.id} notification={item} />)}</ul>
            : <div className="ai-notification-state" role="status"><strong>Nessuna notifica per questo filtro</strong><span>Zero notifiche e dato non disponibile restano stati distinti.</span></div>}
        </>
      )}
    </section>
  );
}
