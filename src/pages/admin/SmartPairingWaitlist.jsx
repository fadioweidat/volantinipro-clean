import React, { useEffect, useMemo, useState } from 'react';
import { selectOptionalTable } from '../../lib/services/admin-api.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

const EMPTY = 'Dato non disponibile';

export function SmartPairingWaitlist({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: false });
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await selectOptionalTable('smart_pairing_waitlist');
        if (!cancelled) setState({ loading: false, error: null, rows: result.rows, available: result.available });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: error?.message || 'Errore caricamento Smart Pairing.', rows: [], available: false });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => state.rows.filter((row) => {
    const status = row.status || 'open';
    if (filter === 'open') return status === 'open';
    if (filter === 'other') return status !== 'open';
    return true;
  }), [state.rows, filter]);

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Smart Pairing' }];

  return (
    <AdminLayout onNav={onNav} title="Smart Pairing" subtitle="Richieste reali di abbinamento in attesa e già gestite." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento richieste reali...</p>}
      {state.error && <Notice danger>{state.error}</Notice>}

      <div className="admin-home__quick" role="tablist" aria-label="Filtro richieste">
        {[['open', 'Da gestire'], ['other', 'Gestite'], ['all', 'Tutte']].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? 'admin-home__primary' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      <section className="admin-home__section" aria-labelledby="pairing-title">
        <h2 id="pairing-title" style={{ margin: '0 0 14px', color: '#fff', font: '500 22px "DM Serif Display",Georgia,serif' }}>{filtered.length} richieste</h2>
        {!state.available ? (
          <EmptyState text="Tabella smart_pairing_waitlist non disponibile." />
        ) : filtered.length === 0 ? (
          <EmptyState text={filter === 'open' ? 'Nessuna richiesta da gestire.' : 'Nessuna richiesta in questa vista.'} />
        ) : (
          <div className="admin-home__lead-list">
            {filtered.map((row) => (
              <article key={row.id}>
                <div className="admin-home__lead-main">
                  <div>
                    <strong>{row.email || EMPTY}</strong>
                    <span>{row.zone || EMPTY} · {row.preferred_period || 'Periodo non specificato'}</span>
                  </div>
                  <span className="admin-home__lead-state">{row.status || 'open'}</span>
                </div>
                <div className="admin-home__lead-actions">
                  {row.telefono && <a href={`tel:${row.telefono}`}>Chiama</a>}
                  {row.telefono && <a href={`https://wa.me/${String(row.telefono).replace(/[^\d+]/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                  {row.email && <a href={`mailto:${row.email}`}>Email</a>}
                </div>
                {row.note && <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{row.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function EmptyState({ text }) { return <div className="admin-home__empty"><p>{text}</p></div>; }
function Notice({ children, danger = false }) { return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} role={danger ? 'alert' : 'status'}>{children}</div>; }
