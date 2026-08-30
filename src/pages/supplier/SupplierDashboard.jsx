import { useState, useEffect, useCallback } from 'react';
import {
  getSupplierAvailableRequests,
  supplierSubmitQuote,
  supplierListOwnQuotes,
  supplierListAssignedCampaigns,
} from '../../lib/services/supplier-api';
import { F, C } from '../../lib/constants.js';

const card = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 16, marginBottom: 14 };
const eyebrow = { margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' };
const row = { padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 13, color: 'rgba(255,255,255,.85)' };
const btn = { minHeight: 38, padding: '0 14px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontFamily: F.sans, fontWeight: 800, cursor: 'pointer', fontSize: 13 };
const input = { minHeight: 36, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)', color: '#fff', fontSize: 13, width: '100%' };

const QUOTE_STATUS_LABEL = {
  draft: 'Bozza', submitted: 'Inviata', accepted: 'Accettata',
  rejected: 'Rifiutata', not_selected: 'Non selezionata', expired: 'Scaduta', withdrawn: 'Ritirata',
};

// Form inline (niente prompt()) per l'invio di un'offerta su una richiesta.
function QuoteForm({ requestCode, onDone }) {
  const [f, setF] = useState({ totalAmount: '', estimatedTime: '', availability: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const amount = Number(f.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setErr('Importo non valido.'); return; }
    setBusy(true); setErr(null);
    try {
      await supplierSubmitQuote({
        requestCode,
        totalAmount: amount,
        estimatedTime: f.estimatedTime.trim() || null,
        availability: f.availability.trim() || null,
        allowedPublicNotes: f.notes.trim() || null,
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      onDone(true);
    } catch (e2) {
      setErr(e2.message || 'Invio non riuscito.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 8, display: 'grid', gap: 8 }}>
      <input style={input} type="number" step="0.01" min="0" placeholder="Importo offerto (€)" value={f.totalAmount} onChange={(e) => setF({ ...f, totalAmount: e.target.value })} />
      <input style={input} placeholder="Tempo stimato (es. 5 giorni)" value={f.estimatedTime} onChange={(e) => setF({ ...f, estimatedTime: e.target.value })} />
      <input style={input} placeholder="Disponibilità (es. dal 10/09)" value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} />
      <input style={input} placeholder="Note pubbliche (facoltative)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {err && <span style={{ color: '#fca5a5', fontSize: 12 }}>{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={btn} disabled={busy}>{busy ? 'Invio…' : 'Invia offerta'}</button>
        <button type="button" style={{ ...btn, background: 'rgba(255,255,255,.08)' }} onClick={() => onDone(false)}>Annulla</button>
      </div>
    </form>
  );
}

export function SupplierDashboard() {
  const [requests, setRequests] = useState([]);
  const [ownQuotes, setOwnQuotes] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openForm, setOpenForm] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, q, a] = await Promise.all([
        getSupplierAvailableRequests().catch(() => []),
        supplierListOwnQuotes().catch(() => []),
        supplierListAssignedCampaigns().catch(() => []),
      ]);
      setRequests(Array.isArray(r) ? r : []);
      setOwnQuotes(Array.isArray(q) ? q : []);
      setAssigned(Array.isArray(a) ? a : []);
    } catch (e) {
      setError(e.message || 'Errore di caricamento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto', color: '#fff', fontFamily: F.sans }}>
      <h1 style={{ fontFamily: F.serif, fontSize: 30, margin: '0 0 4px' }}>Bacheca Fornitore</h1>
      <p style={{ color: 'rgba(255,255,255,.55)', margin: '0 0 20px', fontSize: 14 }}>Richieste, offerte e lavori assegnati.</p>
      {error && <div style={{ ...card, color: '#fca5a5' }}>{error}</div>}

      {/* 1 — Richieste disponibili */}
      <section style={card}>
        <p style={eyebrow}>Richieste disponibili</p>
        {loading && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Caricamento…</p>}
        {!loading && requests.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Nessuna richiesta compatibile al momento.</p>}
        {requests.map((r) => (
          <div key={r.request_code} style={row}>
            <div style={{ fontWeight: 800 }}>{r.request_code}</div>
            <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, margin: '4px 0' }}>
              {r.service_type} · {r.target_quantity} pezzi · {r.zone_name || '—'}
              {r.distribution_start_date ? ` · dal ${r.distribution_start_date}` : ''}
            </div>
            {openForm === r.request_code ? (
              <QuoteForm requestCode={r.request_code} onDone={(ok) => { setOpenForm(null); if (ok) reload(); }} />
            ) : (
              <button type="button" style={btn} onClick={() => setOpenForm(r.request_code)}>Invia preventivo</button>
            )}
          </div>
        ))}
      </section>

      {/* 2 — Miei preventivi */}
      <section style={card}>
        <p style={eyebrow}>I miei preventivi</p>
        {!loading && ownQuotes.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Nessun preventivo inviato.</p>}
        {ownQuotes.map((q) => (
          <div key={q.quote_id} style={row}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontWeight: 800 }}>{q.request_code} · {q.service_type}</span>
              <span style={{ color: q.quote_status === 'accepted' ? '#86efac' : 'rgba(255,255,255,.6)' }}>{QUOTE_STATUS_LABEL[q.quote_status] || q.quote_status}</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>€{Number(q.total_amount).toFixed(2)}{q.valid_until ? ` · valida fino al ${new Date(q.valid_until).toLocaleDateString('it-IT')}` : ''}</div>
          </div>
        ))}
      </section>

      {/* 3 — Lavori assegnati */}
      <section style={card}>
        <p style={eyebrow}>Lavori assegnati</p>
        {!loading && assigned.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Nessun lavoro assegnato.</p>}
        {assigned.map((a) => (
          <div key={a.campaign_id} style={row}>
            <div style={{ fontWeight: 800 }}>{a.request_code} · {a.service_type}</div>
            <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>
              {a.target_quantity} pezzi · {a.zone_name || '—'} · stato: {a.status}
              {a.distribution_start_date ? ` · dal ${a.distribution_start_date}` : ''}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
