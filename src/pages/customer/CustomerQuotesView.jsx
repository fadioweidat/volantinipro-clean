import React, { useState, useEffect, useCallback } from 'react';
import { customerGetSupplierQuotes, customerAcceptQuote } from '../../lib/services/supplier-api';
import { mapMarketplaceError } from '../../lib/services/marketplaceErrors';

// Stati campagna (campaigns.status) in cui ha senso mostrare i preventivi
// Fornitore ricevuti. Su una campagna legacy questo componente non rende nulla.
const MARKETPLACE_STATUSES = ['requested', 'receiving_quotes', 'quote_selected', 'assigned'];

const QUOTE_STATUS_LABEL = {
  submitted: 'In attesa',
  accepted: 'Selezionato',
  not_selected: 'Non selezionato',
  rejected: 'Rifiutato',
  expired: 'Scaduto',
};

const wrap = {
  background: 'rgba(255,255,255,.045)',
  border: '1px solid rgba(255,255,255,.09)',
  borderRadius: 14,
  padding: 18,
  marginBottom: 14,
};
const eyebrow = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.45)',
  marginBottom: 14,
};

export function CustomerQuotesView({ campaignId, status }) {
  const isMarketplace = MARKETPLACE_STATUSES.includes(String(status || ''));

  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null); // quote in corso di selezione
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!isMarketplace || !campaignId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await customerGetSupplierQuotes(campaignId);
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(mapMarketplaceError(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId, isMarketplace]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = useCallback(async (quoteId) => {
    if (acceptingId) return; // gia' una selezione in corso: niente doppio click
    setAcceptingId(quoteId);
    setError(null);
    setNotice(null);
    try {
      await customerAcceptQuote(quoteId);
      await load(); // riallinea la UI: vincitore + perdenti not_selected
      setNotice('Preventivo selezionato.');
    } catch (err) {
      // Re-tentativo sulla stessa quota: la RPC e' idempotente (no-op) e non
      // solleva; qui si arriva solo per errori reali (es. campagna gia'
      // assegnata) -> messaggio amichevole, mai raw. Il reload avviene PRIMA
      // di impostare l'errore, cosi' `load()` non lo azzera: la UI mostra lo
      // stato reale + il messaggio.
      await load();
      setError(mapMarketplaceError(err));
    } finally {
      setAcceptingId(null);
    }
  }, [acceptingId, load]);

  if (!isMarketplace) return null;

  const hasWinner = quotes.some((q) => q.quote_status === 'accepted');

  return (
    <div style={wrap}>
      <h3 style={eyebrow}>Preventivi ricevuti</h3>

      {loading && <p style={{ color: '#fff', fontSize: 13 }}>Caricamento preventivi…</p>}
      {error && (
        <p style={{ color: '#fca5a5', fontSize: 13, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p style={{ color: '#86efac', fontSize: 13, background: 'rgba(46,204,138,.1)', border: '1px solid rgba(46,204,138,.28)', borderRadius: 8, padding: '8px 10px' }}>
          {notice}
        </p>
      )}

      {!loading && quotes.length === 0 && (
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>Nessun preventivo ricevuto al momento.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {quotes.map((q) => {
          const isAccepted = q.quote_status === 'accepted';
          const canSelect = q.quote_status === 'submitted' && !hasWinner;
          const busy = acceptingId === q.quote_id;
          return (
            <div
              key={q.quote_id}
              style={{
                background: isAccepted ? 'rgba(46,204,138,.1)' : 'rgba(255,255,255,.02)',
                padding: 16,
                borderRadius: 8,
                border: isAccepted ? '1px solid rgba(46,204,138,.35)' : '1px solid rgba(255,255,255,.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ color: '#fff', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
                <strong style={{ fontSize: 15 }}>Fornitore {q.supplier_public_code}</strong>
                <span>Totale: <strong>€{Number(q.total_amount).toFixed(2)}</strong></span>
                <span>Disponibilità: {q.availability || 'N/D'}</span>
                <span>Tempo stimato: {q.estimated_time || 'N/D'}</span>
                <span>Validità: {q.valid_until ? new Date(q.valid_until).toLocaleDateString('it-IT') : 'N/D'}</span>
                {q.allowed_public_notes && <span>Note: {q.allowed_public_notes}</span>}
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
                  Stato: {QUOTE_STATUS_LABEL[q.quote_status] || q.quote_status}
                </span>
              </div>
              <div>
                {isAccepted ? (
                  <span style={{ color: '#2ecc71', fontWeight: 700, fontSize: 13 }}>✓ Preventivo selezionato</span>
                ) : canSelect ? (
                  <button
                    type="button"
                    onClick={() => handleAccept(q.quote_id)}
                    disabled={busy || Boolean(acceptingId)}
                    style={{
                      padding: '9px 16px',
                      background: busy || acceptingId ? 'rgba(59,130,246,.5)' : '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: busy || acceptingId ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {busy ? 'Selezione…' : 'Seleziona preventivo'}
                  </button>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
                    {QUOTE_STATUS_LABEL[q.quote_status] || '—'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
