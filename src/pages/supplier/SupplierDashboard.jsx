import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getSupplierAvailableRequests,
  supplierSubmitQuote,
  supplierListOwnQuotes,
  supplierListAssignedCampaigns,
  supplierListOwnOperators,
  supplierListCampaignAssignments,
  supplierAssignOperator,
} from '../../lib/services/supplier-api';
import { mapMarketplaceError } from '../../lib/services/marketplaceErrors';
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

// Pannello inline per assegnare un proprio operatore a un lavoro assegnato.
// Solo RPC Marketplace: supplierListOwnOperators (isolamento server-side su
// auth.uid()) + supplierAssignOperator (verifica proprieta' operatore E
// campagna, crea/riusa il gruppo operativo lato DB). Nessun INSERT/UPDATE
// diretto, nessun dialog nativo del browser.
function AssignOperatorPanel({ campaignId, hasActive, onAssigned, onCancel }) {
  const [operators, setOperators] = useState(null); // null = in caricamento
  const [loadErr, setLoadErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await supplierListOwnOperators();
        if (alive) setOperators(Array.isArray(list) ? list : []);
      } catch (e) {
        if (alive) { setOperators([]); setLoadErr(mapMarketplaceError(e)); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    if (busy || !selected) return; // no double-click, serve una selezione
    const op = operators.find((o) => o.operator_id === selected);
    setBusy(true); setErr(null);
    try {
      // signature reale: supplierAssignOperator(operatorId, campaignId)
      await supplierAssignOperator(selected, campaignId);
      onAssigned(campaignId, { operatorId: selected, operatorName: op?.display_name || 'Operatore' });
    } catch (e) {
      // Gia' assegnato: non e' un errore per l'utente — la campagna ha quel
      // operatore. Aggiorniamo comunque la UI e mostriamo un avviso neutro.
      if (e?.code === '23505' || String(e?.message) === 'ASSEGNAZIONE_GIA_PRESENTE') {
        onAssigned(campaignId, { operatorId: selected, operatorName: op?.display_name || 'Operatore', already: true });
        return;
      }
      setErr(mapMarketplaceError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>
        {hasActive ? 'Assegna un altro operatore' : 'Assegna un tuo operatore'}
      </div>
      {loadErr && <p style={{ color: '#fca5a5', fontSize: 12 }}>{loadErr}</p>}
      {operators === null && <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Caricamento operatori…</p>}
      {operators !== null && operators.length === 0 && !loadErr && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Non hai ancora operatori disponibili.</p>
      )}
      {operators !== null && operators.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          {operators.map((o) => {
            const inactive = o.active === false;
            const isSel = selected === o.operator_id;
            return (
              <button
                key={o.operator_id}
                type="button"
                disabled={inactive || busy}
                onClick={() => setSelected(o.operator_id)}
                style={{
                  textAlign: 'left', minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
                  border: isSel ? '1px solid #e8571a' : '1px solid rgba(255,255,255,.14)',
                  background: isSel ? 'rgba(232,87,26,.14)' : 'rgba(255,255,255,.03)',
                  color: inactive ? 'rgba(255,255,255,.35)' : '#fff',
                  cursor: inactive ? 'not-allowed' : 'pointer', fontFamily: F.sans,
                }}
              >
                {o.display_name || 'Operatore'} {inactive ? '· inattivo' : '· attivo'}
              </button>
            );
          })}
        </div>
      )}
      {err && <p style={{ color: '#fca5a5', fontSize: 12, margin: '4px 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={{ ...btn, opacity: (busy || !selected) ? 0.55 : 1 }}
          disabled={busy || !selected || !operators || operators.length === 0}
          onClick={submit}
        >
          {busy ? 'Assegnazione…' : 'Assegna operatore'}
        </button>
        <button type="button" style={{ ...btn, background: 'rgba(255,255,255,.08)' }} disabled={busy} onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}

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
      setErr(mapMarketplaceError(e2));
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
  // Assegnazione operatori (sezione "Lavori assegnati").
  const [openAssign, setOpenAssign] = useState(null);        // campaign_id col pannello aperto
  const [assignments, setAssignments] = useState([]);        // fonte di verita': RPC supplier_list_campaign_assignments
  const [assignNotice, setAssignNotice] = useState(null);

  // Assegnazioni caricate SEMPRE dal backend (mai da state precedente / cache).
  const reloadAssignments = useCallback(async () => {
    try {
      const list = await supplierListCampaignAssignments();
      setAssignments(Array.isArray(list) ? list : []);
    } catch {
      setAssignments([]);
    }
  }, []);

  // campaign_id -> nomi degli operatori con assegnazione ATTIVA (modello reale:
  // status ∈ active/completed/revoked; "corrente" = solo active, mai l'ultimo
  // per created_at). Una campagna puo' avere piu' operatori attivi
  // (supplier_assign_operator aggiunge, non sostituisce — vedi report).
  const activeOpsByCampaign = useMemo(() => {
    const m = {};
    for (const a of assignments) {
      if (a.assignment_status !== 'active') continue;
      (m[a.campaign_id] || (m[a.campaign_id] = [])).push(a.operator_display_name || 'Operatore');
    }
    return m;
  }, [assignments]);

  const handleAssigned = useCallback(async (campaignId, op) => {
    setOpenAssign(null);
    setAssignNotice(op.already
      ? `Operatore già assegnato a questa campagna: ${op.operatorName}.`
      : `Operatore assegnato: ${op.operatorName}.`);
    await reloadAssignments(); // riallinea dalla fonte di verita'
  }, [reloadAssignments]);

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
      setError(mapMarketplaceError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); reloadAssignments(); }, [reload, reloadAssignments]);

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
        {assignNotice && <div style={{ fontSize: 12, color: '#86efac', marginBottom: 8 }}>{assignNotice}</div>}
        {!loading && assigned.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Nessun lavoro assegnato.</p>}
        {assigned.map((a) => {
          const ops = activeOpsByCampaign[a.campaign_id] || [];
          return (
            <div key={a.campaign_id} style={row}>
              <div style={{ fontWeight: 800 }}>{a.request_code} · {a.service_type}</div>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>
                {a.target_quantity} pezzi · {a.zone_name || '—'} · stato: {a.status}
                {a.distribution_start_date ? ` · dal ${a.distribution_start_date}` : ''}
              </div>
              {ops.length > 0 && (
                <div style={{ color: '#86efac', fontSize: 12, marginTop: 4 }}>
                  {ops.length === 1 ? 'Operatore assegnato: ' : 'Operatori assegnati: '}{ops.join(', ')}
                </div>
              )}
              {openAssign === a.campaign_id ? (
                <AssignOperatorPanel
                  campaignId={a.campaign_id}
                  hasActive={ops.length > 0}
                  onAssigned={handleAssigned}
                  onCancel={() => setOpenAssign(null)}
                />
              ) : (
                <button
                  type="button"
                  style={{ ...btn, marginTop: 6 }}
                  onClick={() => { setAssignNotice(null); setOpenAssign(a.campaign_id); }}
                >
                  {ops.length > 0 ? 'Assegna un altro operatore' : 'Assegna operatore'}
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
