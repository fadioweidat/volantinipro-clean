import React, { useCallback, useEffect, useState } from 'react';
import { businessCommerce, businessCommerceErrorText } from '../customer/feasibility/business/feasibilityBusinessCommerce.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

// Minimal focused list/detail page (ticket "BUSINESS FEASIBILITY €49
// COMMERCE BACKEND" §13). Deliberately not a dashboard redesign: one list,
// one action set, reusing admin-home__* classes already defined for
// AdminSuppliers/AdminOrdersRegistry.
const EMPTY = 'Dato non disponibile';
const STATUS_LABEL = { pending: 'Pagamento in verifica', paid: 'Studio completo sbloccato', revoked: 'Accesso allo studio non disponibile' };
const STATUS_BADGE_CLASS = { pending: 'admin-home__lead-state--new', paid: 'admin-home__lead-state--converted', revoked: 'admin-home__lead-state--closed' };

function fmtDate(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtEur(cents) {
  if (!Number.isFinite(cents)) return EMPTY;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

export function AdminBusinessFeasibilityPurchases({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, action: 'verify_payment'|'revoke' }
  const [inputValue, setInputValue] = useState('');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await businessCommerce('admin_list');
      setState({ loading: false, error: null, rows: res.purchases || [] });
    } catch (err) {
      setState({ loading: false, error: businessCommerceErrorText(err), rows: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const apply = useCallback(async (id, action) => {
    if (busyId) return;
    setBusyId(id); setNotice(null);
    try {
      if (action === 'verify_payment') await businessCommerce('verify_payment', { purchaseId: id, confirmation: inputValue.trim() });
      else await businessCommerce('revoke', { purchaseId: id, reason: inputValue.trim() });
      setConfirm(null); setInputValue('');
      await load();
      setNotice(action === 'verify_payment' ? 'Pagamento verificato: studio sbloccato.' : 'Accesso revocato.');
    } catch (err) {
      setState(s => ({ ...s, error: businessCommerceErrorText(err) }));
    } finally {
      setBusyId(null);
    }
  }, [busyId, inputValue, load]);

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Fattibilità Attività — Acquisti' }];

  return (
    <AdminLayout onNav={onNav} title="Fattibilità Attività — Acquisti" subtitle="Verifica bonifici €49 e sblocco studio completo (Business Feasibility)." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento acquisti…</p>}
      {notice && <div className="admin-home__notice" role="status">{notice}</div>}
      {state.error && (
        <div className="admin-home__notice admin-home__notice--danger" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{state.error}</span>
          <button type="button" onClick={load} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer' }}>Riprova</button>
        </div>
      )}

      {!state.loading && (
        <section className="admin-home__section" aria-labelledby="bf-purchases-title">
          <h2 id="bf-purchases-title" style={{ margin: '0 0 14px', color: '#fff', font: '500 22px "DM Serif Display",Georgia,serif' }}>
            {state.rows.length} {state.rows.length === 1 ? 'acquisto' : 'acquisti'}
          </h2>

          {state.rows.length === 0 ? (
            <div className="admin-home__empty"><p>Nessun acquisto Business Feasibility ancora registrato.</p></div>
          ) : (
            <div className="admin-home__lead-list">
              {state.rows.map(p => {
                const rowBusy = busyId === p.id;
                const anyBusy = Boolean(busyId);
                const pendingConfirm = confirm && confirm.id === p.id ? confirm : null;
                return (
                  <article key={p.id}>
                    <div className="admin-home__lead-main">
                      <div>
                        <strong>{p.businessName || EMPTY}{p.customer ? ` · ${p.customer}` : ''}</strong>
                        <span>Analisi: {fmtDate(p.analysisDate)} · Verdetto: {p.verdict || EMPTY}</span>
                        <span>Importo: {fmtEur(p.amount_cents)} · Riferimento: {p.payment_reference}</span>
                        <span>Creato: {fmtDate(p.created_at)} · Pagato: {fmtDate(p.paid_at)}</span>
                      </div>
                      <span className={`admin-home__lead-state ${STATUS_BADGE_CLASS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
                    </div>

                    <div className="admin-home__lead-actions">
                      {pendingConfirm ? (
                        <>
                          <input
                            type="text"
                            placeholder={pendingConfirm.action === 'verify_payment' ? 'Riferimento bonifico verificato (es. estratto conto)' : 'Motivo revoca'}
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.05)', color: '#fff' }}
                          />
                          <button type="button" disabled={rowBusy || (pendingConfirm.action === 'verify_payment' && inputValue.trim().length < 3)} style={{ borderColor: 'rgba(46,204,138,.3)', color: '#86efac' }} onClick={() => apply(p.id, pendingConfirm.action)}>
                            {rowBusy ? 'Applico…' : 'Conferma'}
                          </button>
                          <button type="button" disabled={rowBusy} onClick={() => { setConfirm(null); setInputValue(''); }}>Annulla</button>
                        </>
                      ) : (
                        <>
                          {p.status === 'pending' && (
                            <button type="button" disabled={anyBusy} onClick={() => { setConfirm({ id: p.id, action: 'verify_payment' }); setInputValue(''); }}>Verifica pagamento</button>
                          )}
                          {p.status !== 'revoked' && (
                            <button type="button" disabled={anyBusy} onClick={() => { setConfirm({ id: p.id, action: 'revoke' }); setInputValue(''); }}>Revoca</button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </AdminLayout>
  );
}
