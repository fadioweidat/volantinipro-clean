import React from 'react';
import { getConversationPreview, resolveConversationIdentity } from '../../../lib/admin/communicationIdentity.js';

// Solo testo visualizzato nella card: i dati originali restano invariati.
function cardCampaignLabel(identity) {
  const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
  let campaign = identity.campaign || '';
  const location = identity.locationLabel;
  if (location) {
    for (const separator of [' · ', ' – ', ' — ']) {
      const index = campaign.lastIndexOf(separator);
      if (index > 0 && normalize(campaign.slice(index + separator.length)) === normalize(location)) {
        campaign = campaign.slice(0, index);
        break;
      }
    }
  }
  if (identity.kindLabel === 'Cliente') {
    campaign = campaign.replace(/\s*\(([^()]*)\)/g, (match, name) =>
      normalize(name) === normalize(identity.title) ? '' : match);
  }
  return campaign.trim() || (identity.campaign ? 'Campagna' : '');
}

export function ConversationIdentity({ conversation, header = false }) {
  const role = conversation.kind === 'customer_admin' ? 'Cliente'
    : conversation.kind === 'driver_admin' ? 'Driver' : null;
  const cardIdentity = !role ? { title: 'Conversazione', kindLabel: 'Tipo non disponibile' }
    : conversation.identity?.kindLabel === role ? conversation.identity : resolveConversationIdentity(conversation);
  const identity = header ? (conversation.identity || resolveConversationIdentity(conversation)) : cardIdentity;
  const campaign = header ? identity.campaign : cardCampaignLabel(identity);
  const showLocation = header || role === 'Cliente'
    || (identity.locationLabel && identity.locationLabel !== 'Località non disponibile');
  return (
    <div className={`comms-identity${header ? ' comms-identity--header' : ''}`} data-kind={header ? undefined : conversation.kind}>
      <div className="comms-title-row">
        <strong data-testid={header ? 'conversation-header-title' : 'conversation-title'} className="comms-title">{identity.title}</strong>
        {!header && conversation.unread_count > 0 && (
          <span className="comms-unread" aria-label={`${conversation.unread_count} messaggi non letti`}>{conversation.unread_count}</span>
        )}
      </div>
      <div className="comms-role">{identity.kindLabel}</div>
      {campaign && <div className="comms-campaign" title={campaign}>{campaign}</div>}
      {showLocation && <div className="comms-location">
        {!header && <svg className="comms-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>}
        {identity.locationLabel}
      </div>}
      {(header || role === 'Driver') && identity.assignmentLabel && <div className="comms-meta">{identity.assignmentLabel}</div>}
      {!header && <div className="comms-preview">{getConversationPreview(conversation)}</div>}
    </div>
  );
}

export function ConversationEmptyState() {
  return (
    <div className="comms-empty" data-testid="conversation-empty-state">
      <svg className="comms-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" />
        <path d="M7 9h10M7 13h6" />
      </svg>
      <h2>Seleziona una conversazione</h2>
      <p>Scegli un Cliente o un Driver dalla lista per leggere i messaggi.</p>
    </div>
  );
}
