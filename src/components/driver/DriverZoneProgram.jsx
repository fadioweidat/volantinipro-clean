import React, { useMemo, useRef, useState } from 'react';
import { ZONE_STATE } from '../../lib/driver/zoneWorkflow.js';
import { ZONE_FILTERS, buildZoneListView, programSummaryText } from '../../lib/driver/zoneListView.js';

// "Programma Operativo" compatto (mobile-first). SOLO presentazione: gli
// handler di avvio/chiusura zona arrivano dalla pagina (stessi di prima,
// nessuna RPC nuova); ricerca, filtri e collassi sono client-side sulle zone
// gia' caricate. Card grandi solo per le zone IN CORSO.

const STATUS = Object.freeze({
  [ZONE_STATE.TO_START]: { label: 'DA INIZIARE', color: '#16a34a' },
  [ZONE_STATE.IN_PROGRESS]: { label: 'IN CORSO', color: '#2563eb' },
  [ZONE_STATE.COMPLETED]: { label: 'COMPLETATA', color: '#dc2626' },
});

const TOUCH = 44;
const btn = (bg, color, border) => ({
  minHeight: TOUCH, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  background: bg, color, border: border || 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
});
const startBtn = btn('#16a34a', '#fff');
const endBtn = btn('#dc2626', '#fff');
const ghostBtn = btn('#fff', '#0f172a', '1px solid #cbd5e1');
const sectionTitle = { margin: '14px 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' };
const fmtQty = (q) => (q != null && q !== '' ? `${Number(q).toLocaleString('it-IT')} volantini` : null);

function StatusPill({ state, legacy }) {
  const s = legacy ? { label: 'LEGACY · SOLA LETTURA', color: '#f59e0b' } : STATUS[state];
  return (
    <span data-zone-status={legacy ? 'legacy' : state} style={{ fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 999, background: s.color, color: '#fff', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export function DriverZoneProgram({ zones = [], stateOf, actionLoading = null, onStart, onComplete, onOpenMap }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedFuture, setExpandedFuture] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // `stateOf` cambia identita' a ogni render della pagina: la memoizzazione
  // si basa sulla firma degli stati reali, cosi' ricerca/filtri/collassi non
  // ricalcolano i gruppi quando le zone non sono cambiate.
  const statesSignature = zones.map((z) => `${z.id}:${z.isLegacy ? 'L' : stateOf(z)}`).join('|');
  const stateOfRef = useRef(stateOf);
  stateOfRef.current = stateOf;
  const view = useMemo(
    () => buildZoneListView(zones, (z) => stateOfRef.current(z), { query, filter, expandedFuture, showCompleted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, statesSignature, query, filter, expandedFuture, showCompleted],
  );
  const { counts } = view;
  const chipCount = { all: counts.total, in_progress: counts.inProgress, to_start: counts.toStart, completed: counts.completed };

  const busy = Boolean(actionLoading);

  return (
    <div data-testid="driver-zone-program" style={{ minWidth: 0, maxWidth: '100%' }}>
      <p data-testid="program-summary" style={{ margin: '6px 0 10px', fontSize: 14, fontWeight: 800, color: '#fff' }}>{programSummaryText(counts)}</p>

      <label htmlFor="driver-zone-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Cerca zona</label>
      <input
        id="driver-zone-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca Comasina, Affori..."
        autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TOUCH, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', padding: '0 12px', fontSize: 16 }}
      />

      <div role="group" aria-label="Filtra zone" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '8px 0 0', paddingBottom: 4, maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
        {ZONE_FILTERS.map((f) => {
          const on = filter === f.value;
          return (
            <button key={f.value} type="button" aria-pressed={on} onClick={() => setFilter(f.value)}
              style={{ flex: '0 0 auto', minHeight: 36, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(255,255,255,.25)', background: on ? '#fff' : 'transparent', color: on ? '#0f172a' : '#fff' }}>
              {f.label} {chipCount[f.value]}
            </button>
          );
        })}
      </div>

      {view.noResults && <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Nessuna zona trovata.</p>}

      {view.inProgress.length > 0 && (
        <section aria-label="Zone in corso">
          <h3 data-testid="section-in-progress" style={sectionTitle}>In corso ({view.inProgress.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {view.inProgress.map(({ zone: z, number }) => (
              <div key={z.id || number} data-zone-row="active" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 12, background: '#eff6ff', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', overflowWrap: 'anywhere' }}><span style={{ color: '#64748b', marginRight: 6 }}>{number}.</span>{z.zone_name}</div>
                    {fmtQty(z.quantity) && <div style={{ fontSize: 13, color: '#475569' }}>{fmtQty(z.quantity)}</div>}
                  </div>
                  <StatusPill state={ZONE_STATE.IN_PROGRESS} />
                </div>
                {z.notes && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>Note: {z.notes}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <button type="button" style={{ ...endBtn, flex: '1 1 180px' }} disabled={busy} onClick={() => onComplete?.(z)}>
                    {actionLoading === `COMPLETE_ZONE:${z.id}` ? 'Chiusura in corso...' : `Termina ${z.zone_name}`}
                  </button>
                  {z.id && <button type="button" style={ghostBtn} onClick={() => onOpenMap?.(z)}>Mappa</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {view.toStart.all.length > 0 && (
        <section aria-label="Zone da iniziare">
          <h3 data-testid="section-to-start" style={sectionTitle}>Da iniziare ({view.toStart.all.length})</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {view.toStart.visible.map(({ zone: z, number }) => (
              <div key={z.id || number} data-zone-row="compact" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 60, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', minWidth: 0 }}>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}><span style={{ color: '#94a3b8', marginRight: 6 }}>{number}.</span>{z.zone_name}</div>
                  {fmtQty(z.quantity) && <div style={{ fontSize: 12, color: '#475569' }}>{fmtQty(z.quantity)}</div>}
                </div>
                <StatusPill state={ZONE_STATE.TO_START} legacy={Boolean(z.isLegacy)} />
                {!z.isLegacy && (
                  <button type="button" aria-label={`Inizia ${z.zone_name}`} title={`Inizia ${z.zone_name}`} style={startBtn} disabled={busy} onClick={() => onStart?.(z)}>
                    {actionLoading === `START_ZONE:${z.id}` ? 'Avvio...' : 'Inizia'}
                  </button>
                )}
                {z.id && !z.isLegacy && (
                  <button type="button" aria-label={`Mappa ${z.zone_name}`} title={`Mappa ${z.zone_name}`} style={{ ...ghostBtn, padding: 0, width: TOUCH }} onClick={() => onOpenMap?.(z)}>📍</button>
                )}
              </div>
            ))}
          </div>
          {view.toStart.hiddenCount > 0 && (
            <button type="button" aria-expanded={false} data-testid="show-more-zones" style={{ ...ghostBtn, width: '100%', marginTop: 6 }} onClick={() => setExpandedFuture(true)}>
              Mostra altre {view.toStart.hiddenCount} zone
            </button>
          )}
          {view.toStart.canCollapse && (
            <button type="button" aria-expanded={true} data-testid="show-less-zones" style={{ ...ghostBtn, width: '100%', marginTop: 6 }} onClick={() => setExpandedFuture(false)}>
              Mostra meno
            </button>
          )}
        </section>
      )}

      {view.completed.all.length > 0 && (
        <section aria-label="Zone completate">
          <h3 data-testid="section-completed" style={sectionTitle}>Completate ({view.completed.all.length})</h3>
          {!view.completed.expanded ? (
            <button type="button" aria-expanded={false} data-testid="show-completed" style={{ ...ghostBtn, width: '100%' }} onClick={() => setShowCompleted(true)}>
              Vedi completate
            </button>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 4 }}>
                {view.completed.all.map(({ zone: z, number }) => (
                  <div key={z.id || number} data-zone-row="completed" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', minWidth: 0 }}>
                    <div style={{ flex: '1 1 140px', minWidth: 0, fontSize: 14, fontWeight: 700, color: '#334155', overflowWrap: 'anywhere' }}>
                      ✓ {z.zone_name}{fmtQty(z.quantity) ? <span style={{ fontWeight: 500, color: '#64748b' }}> · {fmtQty(z.quantity)}</span> : null}
                    </div>
                    <StatusPill state={ZONE_STATE.COMPLETED} />
                  </div>
                ))}
              </div>
              {filter !== 'completed' && !view.searching && (
                <button type="button" aria-expanded={true} data-testid="hide-completed" style={{ ...ghostBtn, width: '100%', marginTop: 6 }} onClick={() => setShowCompleted(false)}>
                  Nascondi completate
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
