import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminListSuppliers } from '../../lib/services/admin-api.js';
import { adminSetSupplierStatus } from '../../lib/services/supplier-api.js';
import { mapMarketplaceError } from '../../lib/services/marketplaceErrors.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

const EMPTY = 'Dato non disponibile';

// Stati DB reali (supplier_profiles.status) — nessuna duplicazione locale.
const STATUS_LABEL = {
  pending: 'In attesa',
  verified: 'Verificato',
  suspended: 'Sospeso',
  rejected: 'Rifiutato',
};
const STATUS_BADGE_CLASS = {
  pending: 'admin-home__lead-state--new',
  verified: 'admin-home__lead-state--converted',
  suspended: 'admin-home__lead-state--closed',
  rejected: 'admin-home__lead-state--closed',
};

// Transizioni consentite (ticket §4). Ogni voce -> chiamata adminSetSupplierStatus.
const TRANSITIONS = {
  pending: [
    { to: 'verified', label: 'Verifica fornitore' },
    { to: 'rejected', label: 'Rifiuta richiesta' },
  ],
  verified: [{ to: 'suspended', label: 'Sospendi fornitore' }],
  suspended: [{ to: 'verified', label: 'Riattiva fornitore' }],
  rejected: [],
};

const FILTERS = [
  ['all', 'Tutti'],
  ['pending', 'In attesa'],
  ['verified', 'Verificati'],
  ['suspended', 'Sospesi'],
  ['rejected', 'Rifiutati'],
];

function fmtDate(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminSuppliers({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: false });
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);      // supplier in mutazione: blocca doppio submit
  const [confirm, setConfirm] = useState(null);    // { id, to } — conferma inline (nessun dialog nativo)
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await adminListSuppliers();
    if (!res.available) {
      setState({ loading: false, error: res.error ? mapMarketplaceError(res.error) : null, rows: [], available: false });
      return;
    }
    setState({ loading: false, error: null, rows: res.rows, available: true });
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyStatus = useCallback(async (id, to) => {
    if (busyId) return; // una mutazione alla volta
    setBusyId(id);
    setConfirm(null);
    setNotice(null);
    setState((s) => ({ ...s, error: null }));
    try {
      await adminSetSupplierStatus(id, to);
      await load();
      setNotice(`Stato aggiornato: ${STATUS_LABEL[to] || to}.`);
    } catch (err) {
      setState((s) => ({ ...s, error: mapMarketplaceError(err) }));
    } finally {
      setBusyId(null);
    }
  }, [busyId, load]);

  const counts = useMemo(() => {
    const c = { all: state.rows.length, pending: 0, verified: 0, suspended: 0, rejected: 0 };
    for (const r of state.rows) if (c[r.status] != null) c[r.status] += 1;
    return c;
  }, [state.rows]);

  const filtered = useMemo(
    () => (filter === 'all' ? state.rows : state.rows.filter((r) => r.status === filter)),
    [state.rows, filter],
  );

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Fornitori' }];

  return (
    <AdminLayout onNav={onNav} title="Fornitori" subtitle="Account Marketplace reali: verifica, sospensione, rifiuto." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento fornitori…</p>}
      {notice && <div className="admin-home__notice" role="status">{notice}</div>}
      {state.error && <div className="admin-home__notice admin-home__notice--danger" role="alert">{state.error}</div>}

      {!state.loading && !state.available && (
        <div className="admin-home__empty"><p>Elenco fornitori non disponibile per questo account.</p></div>
      )}

      {state.available && (
        <>
          <div className="admin-home__quick" role="tablist" aria-label="Filtro fornitori">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={filter === key ? 'admin-home__primary' : ''}
                onClick={() => setFilter(key)}
              >
                {label} ({counts[key] ?? 0})
              </button>
            ))}
          </div>

          <section className="admin-home__section" aria-labelledby="suppliers-title">
            <h2 id="suppliers-title" style={{ margin: '0 0 14px', color: '#fff', font: '500 22px "DM Serif Display",Georgia,serif' }}>
              {filtered.length} {filtered.length === 1 ? 'fornitore' : 'fornitori'}
            </h2>

            {filtered.length === 0 ? (
              <div className="admin-home__empty"><p>Nessun fornitore in questa vista.</p></div>
            ) : (
              <div className="admin-home__lead-list">
                {filtered.map((s) => {
                  const rowBusy = busyId === s.id;
                  const anyBusy = Boolean(busyId);
                  const pendingConfirm = confirm && confirm.id === s.id ? confirm : null;
                  return (
                    <article key={s.id}>
                      <div className="admin-home__lead-main">
                        <div>
                          <strong>{s.public_code || EMPTY}{s.company_name ? ` · ${s.company_name}` : ''}</strong>
                          <span>{s.email || 'Email non disponibile'}{s.contact_name ? ` · ${s.contact_name}` : ''}</span>
                          <span>Tel: {s.phone || EMPTY}{s.vat_number ? ` · P.IVA ${s.vat_number}` : ''}</span>
                          <span>Richiesta: {fmtDate(s.created_at)} · Aggiornato: {fmtDate(s.updated_at)}</span>
                        </div>
                        <span className={`admin-home__lead-state ${STATUS_BADGE_CLASS[s.status] || ''}`}>
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </div>

                      {s.admin_notes && (
                        <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,.5)', fontSize: 11 }}>Note: {s.admin_notes}</p>
                      )}

                      <div className="admin-home__lead-actions">
                        {pendingConfirm ? (
                          <>
                            <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, alignSelf: 'center' }}>
                              Confermi: {STATUS_LABEL[pendingConfirm.to]}?
                            </span>
                            <button
                              type="button"
                              disabled={rowBusy}
                              style={{ borderColor: 'rgba(46,204,138,.3)', color: '#86efac' }}
                              onClick={() => applyStatus(s.id, pendingConfirm.to)}
                            >
                              {rowBusy ? 'Applico…' : 'Conferma'}
                            </button>
                            <button type="button" disabled={rowBusy} onClick={() => setConfirm(null)}>Annulla</button>
                          </>
                        ) : (
                          (TRANSITIONS[s.status] || []).map((t) => (
                            <button
                              key={t.to}
                              type="button"
                              disabled={anyBusy}
                              onClick={() => { setConfirm({ id: s.id, to: t.to }); setNotice(null); }}
                            >
                              {t.label}
                            </button>
                          ))
                        )}
                        {!pendingConfirm && (TRANSITIONS[s.status] || []).length === 0 && (
                          <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 11 }}>Nessuna azione disponibile</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </AdminLayout>
  );
}
