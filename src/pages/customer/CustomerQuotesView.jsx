import React, { useState, useEffect } from 'react';
import { customerGetSupplierQuotes, customerAcceptQuote } from '../../lib/services/supplier-api';

export function CustomerQuotesView({ campaignId, status }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only load quotes if the campaign is in a state that expects quotes
    if (!['requested', 'receiving_quotes', 'quote_selected', 'assigned'].includes(status)) {
      setLoading(false);
      return;
    }

    async function loadQuotes() {
      try {
        const data = await customerGetSupplierQuotes(campaignId);
        setQuotes(data || []);
      } catch (err) {
        setError("Impossibile caricare i preventivi: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadQuotes();
  }, [campaignId, status]);

  const handleAccept = async (quoteId) => {
    if (!window.confirm("Sei sicuro di voler accettare questa offerta?")) return;
    try {
      await customerAcceptQuote(quoteId);
      alert("Offerta accettata con successo!");
      window.location.reload();
    } catch (err) {
      alert("Errore durante l'accettazione dell'offerta: " + err.message);
    }
  };

  if (!['requested', 'receiving_quotes', 'quote_selected', 'assigned'].includes(status)) return null;

  return (
    <div style={{
      background: 'rgba(255,255,255,.045)',
      border: '1px solid rgba(255,255,255,.09)',
      borderRadius: '14px',
      padding: '18px',
      marginBottom: '14px'
    }}>
      <h3 style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,.45)',
        marginBottom: '14px'
      }}>
        Preventivi Ricevuti
      </h3>

      {loading && <p style={{ color: '#fff', fontSize: '13px' }}>Caricamento preventivi...</p>}
      {error && <p style={{ color: '#ff6b6b', fontSize: '13px' }}>{error}</p>}

      {!loading && !error && quotes.length === 0 && (
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>Nessun preventivo ricevuto al momento.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {quotes.map(q => {
          const isAccepted = q.quote_status === 'accepted';
          return (
            <div key={q.quote_id} style={{
              background: isAccepted ? 'rgba(46,204,138,.1)' : 'rgba(255,255,255,.02)',
              padding: '16px',
              borderRadius: '8px',
              border: isAccepted ? '1px solid rgba(46,204,138,.3)' : '1px solid rgba(255,255,255,.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ color: '#fff', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong style={{ fontSize: '15px' }}>Fornitore {q.supplier_public_code}</strong>
                <span>Totale: <strong>€{Number(q.total_amount).toFixed(2)}</strong></span>
                <span>Tempo stimato: {q.estimated_time || 'N/D'}</span>
                {q.allowed_public_notes && <span>Note: {q.allowed_public_notes}</span>}
              </div>
              <div>
                {isAccepted ? (
                  <span style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: '13px' }}>✓ Accettato</span>
                ) : (
                  q.quote_status === 'submitted' && (
                    <button
                      onClick={() => handleAccept(q.quote_id)}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Accetta Offerta
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
