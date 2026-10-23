import React, { useState } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminOrdersRegistry } from './AdminOrdersRegistry.jsx';
import { ClientsQuotes } from './ClientsQuotes.jsx';

// ORDINI — one admin page for what were "Registro ordini" and "Clienti & Preventivi" (same data,
// getClientsQuotesOverview): view Tabella (grid, sorting, CSV export, detail drawer) or Schede
// (cards). Both views offer the same row actions (lib/admin/orderRowActions.js + Azioni Admin).
// Test data is hidden by default; "Mostra dati di prova" shows it with a PROVA label.
export const ORDERS_VIEWS = { TABLE: 'tabella', CARDS: 'schede' };

export function readOrdersView(search = typeof window !== 'undefined' ? window.location.search : '') {
  const value = new URLSearchParams(search).get('vista');
  return value === ORDERS_VIEWS.CARDS ? ORDERS_VIEWS.CARDS : ORDERS_VIEWS.TABLE;
}

export function AdminOrders({ onNav, initialView = null }) {
  const [view, setView] = useState(() => initialView || readOrdersView());
  const [showTest, setShowTest] = useState(false);

  function chooseView(next) {
    setView(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('vista', next);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL non aggiornabile: la vista resta comunque selezionata */
    }
  }

  const actions = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div role="group" aria-label="Vista ordini" style={{ display: 'inline-flex', border: '1px solid #374151', borderRadius: 8, overflow: 'hidden' }}>
        {[[ORDERS_VIEWS.TABLE, 'Tabella'], [ORDERS_VIEWS.CARDS, 'Schede']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => chooseView(key)}
            style={{ border: 'none', padding: '7px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', background: view === key ? '#e8571a' : 'transparent', color: view === key ? '#fff' : 'rgba(255,255,255,.7)' }}
          >
            {label}
          </button>
        ))}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'rgba(255,255,255,.8)', cursor: 'pointer' }}>
        <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
        Mostra dati di prova
      </label>
    </div>
  );

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Ordini' }];
  return (
    <AdminLayout title="Ordini" subtitle="Preventivi e ordini: pagamento, gruppo, programma, GPS. Vista a tabella o a schede, stesse azioni." breadcrumbs={breadcrumbs} onNav={onNav} actions={actions}>
      {view === ORDERS_VIEWS.CARDS
        ? <ClientsQuotes onNav={onNav} embedded showTest={showTest} />
        : <AdminOrdersRegistry onNav={onNav} embedded showTest={showTest} />}
    </AdminLayout>
  );
}
