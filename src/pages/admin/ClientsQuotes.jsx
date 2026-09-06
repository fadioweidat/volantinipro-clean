import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import {
  getClientsQuotesOverview,
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
} from '../../lib/services/admin-api.js';
import { confirmCampaignPayment } from '../../lib/supabaseClient.js';
import { ClientsQuotesSearchBar } from './clients-quotes/ClientsQuotesSearchBar.jsx';
import {
  CQ_FILTERS,
  CQ_SORTS,
  CQ_FILTER_LABEL,
  CQ_SORT_LABEL,
  CQ_FILTER_COLOR,
  computeKpiCounts,
  applyClientsQuotesView,
  serviceLabel,
  shortCampaignId,
  buildAdminClientWhatsAppMessage,
  buildClientsQuotesSummary,
} from '../../lib/admin/clientsQuotesView.js';

const AssignWork = lazy(() => import('./AssignWork.jsx').then(m => ({ default: m.AssignWork })));

const C = {
  navyMid: '#111827',
  navyLight: '#1F2937',
  orange: '#e8571a',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  green: '#10B981',
  red: '#EF4444',
  yellow: '#F59E0B',
};

const PAYMENT_LABEL = {
  pagato: { text: 'PAGATO', color: C.green },
  da_pagare: { text: 'DA PAGARE', color: C.yellow },
  non_disponibile: { text: 'DATO NON DISPONIBILE', color: C.gray },
};

const GPS_LABEL = {
  non_disponibile: { text: 'GPS NON DISPONIBILE', color: C.gray },
  pronto: { text: 'GPS PRONTO', color: '#60A5FA' },
  live: { text: 'GPS LIVE', color: C.green },
  storico: { text: 'GPS STORICO', color: C.gray },
};

const PROGRAM_LABEL = {
  nessun_programma: 'Nessun programma',
  da_inviare: 'Da inviare',
  inviato: 'Inviato',
  aperto: 'Aperto',
  confermato: 'Confermato',
};

export function ClientsQuotes({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('tutti');
  const [sort, setSort] = useState('default');
  const [copiedRowId, setCopiedRowId] = useState(null);
  const [assignModal, setAssignModal] = useState(null); // campaignId in corso di assegnazione
  const [paymentConfirmRow, setPaymentConfirmRow] = useState(null); // riga in corso di conferma pagamento
  const [paymentConfirmBusy, setPaymentConfirmBusy] = useState(false);
  const [paymentConfirmError, setPaymentConfirmError] = useState('');

  // background=true (polling periodico, stesso intervallo di 30s gia' usato
  // da AdminDashboard.jsx) evita lo spinner a schermo intero e non svuota le
  // righe gia' mostrate se il refresh silenzioso fallisce: solo il primo
  // caricamento e il pulsante di refresh manuale restano bloccanti.
  const load = async ({ background = false } = {}) => {
    if (!background) setState((prev) => ({ ...prev, loading: true }));
    try {
      const rows = await getClientsQuotesOverview();
      setState({ loading: false, error: null, rows });
    } catch (err) {
      console.error(err);
      if (background) setState((prev) => ({ ...prev, loading: false }));
      else setState({ loading: false, error: err.message || 'Errore di caricamento', rows: [] });
    }
  };

  useEffect(() => {
    let cancelled = false;
    load();
    const timer = window.setInterval(() => { if (!cancelled) load({ background: true }); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const kpi = useMemo(() => computeKpiCounts(state.rows), [state.rows]);
  const visibleRows = useMemo(
    () => applyClientsQuotesView(state.rows, { search, filter, sort }),
    [state.rows, search, filter, sort],
  );

  const breadcrumbs = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Clienti & Preventivi' },
  ];

  function handleWhatsAppCliente(row) {
    const phone = String(row.phone || '').replace(/[^\d+]/g, '');
    if (!phone) {
      alert('Numero di telefono cliente non disponibile.');
      return;
    }
    // §6 — template Admin -> Cliente (NON il messaggio Cliente -> VolantiniPro).
    const msg = buildAdminClientWhatsAppMessage(row);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  async function handleCopySummary(row) {
    const text = buildClientsQuotesSummary(row);
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard non disponibile: nessuna azione distruttiva */
    }
    setCopiedRowId(row.id);
    window.setTimeout(() => setCopiedRowId((curr) => (curr === row.id ? null : curr)), 1600);
  }

  function handleInviaProgramma(row) {
    const assignment = row.assignment;
    if (!assignment) {
      alert('Nessun programma creato per questa campagna. Assegna prima un gruppo.');
      return;
    }
    if (row.paymentStatus !== 'pagato') {
      alert('Conferma prima il pagamento.');
      return;
    }
    const phone = String(row.operator?.phone || '').replace(/[^\d+]/g, '');
    if (!phone) {
      alert('Numero WhatsApp del referente non disponibile. Apri "Assegna gruppo" per verificare i dati dell\'operatore.');
      return;
    }
    const link = generateDriverAssignmentLink(assignment.id, assignment.access_token);
    const programRows = (row.programZones || []).map((z, idx) => ({ name: z.name, quantity: z.quantity, priority: idx + 1 }));
    const totalQty = programRows.reduce((sum, z) => sum + (z.quantity || 0), 0);
    const msg = buildDriverWhatsAppMessage({
      operatorName: row.operator?.name,
      groupName: row.group?.name || null,
      campaignTitle: row.name || row.client,
      date: assignment.starts_at ? new Date(assignment.starts_at).toLocaleDateString('it-IT') : 'Da definire',
      comuni: programRows.map((r) => r.name),
      zone: programRows.map((r, idx) => `${idx + 1}. ${r.name}`),
      programRows,
      qty: totalQty || null,
      link,
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    alert('WhatsApp aperto. Lo stato "Inviato" verra mostrato solo dopo un evento reale del driver (apertura/conferma programma).');
  }

  function handleGps(row) {
    if (row.gpsStatus === 'non_disponibile') return;
    onNav?.(`admin-gps:${row.id}`);
  }

  async function handleConfirmPayment() {
    if (!paymentConfirmRow || paymentConfirmBusy) return;
    setPaymentConfirmBusy(true);
    setPaymentConfirmError('');
    try {
      await confirmCampaignPayment(paymentConfirmRow.id);
      setPaymentConfirmRow(null);
      await load();
    } catch (err) {
      setPaymentConfirmError(err?.message || 'Impossibile confermare il pagamento.');
    } finally {
      setPaymentConfirmBusy(false);
    }
  }

  return (
    <AdminLayout title="Clienti & Preventivi" subtitle="Preventivo pagato -> gruppo -> programma -> WhatsApp -> GPS, da un'unica riga." breadcrumbs={breadcrumbs} onNav={onNav}>
      <style>{`
        @media (max-width: 640px) {
          .cq-kpi-grid { grid-template-columns: 1fr 1fr !important; }
          .cq-filter-bar { -webkit-overflow-scrolling: touch; }
        }
      `}</style>
      <ClientsQuotesSearchBar
        search={search}
        setSearch={setSearch}
        loading={state.loading}
        colors={C}
      />

      {/* §1 — KPI summary dai dati reali della pagina (mai hardcoded). */}
      <div className="cq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Preventivi / Campagne" value={kpi.totali} color={C.white} />
        <KpiCard label="Da pagare" value={kpi.da_pagare} color={CQ_FILTER_COLOR.da_pagare} onClick={() => setFilter('da_pagare')} active={filter === 'da_pagare'} />
        <KpiCard label="Pagati" value={kpi.pagati} color={CQ_FILTER_COLOR.pagati} onClick={() => setFilter('pagati')} active={filter === 'pagati'} />
        <KpiCard label="Da assegnare" value={kpi.da_assegnare} color={CQ_FILTER_COLOR.da_assegnare} onClick={() => setFilter('da_assegnare')} active={filter === 'da_assegnare'} />
        <KpiCard label="In lavorazione" value={kpi.in_lavorazione} color={CQ_FILTER_COLOR.in_lavorazione} onClick={() => setFilter('in_lavorazione')} active={filter === 'in_lavorazione'} />
        <KpiCard label="Completati" value={kpi.completati} color={CQ_FILTER_COLOR.completati} onClick={() => setFilter('completati')} active={filter === 'completati'} />
      </div>

      {/* §2 — filtri rapidi + §8 ordinamento. Nessun reload; la ricerca resta. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="cq-filter-bar" style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: '1 1 auto', paddingBottom: 2 }}>
          {CQ_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                flex: '0 0 auto',
                fontSize: 12,
                fontWeight: 800,
                padding: '7px 14px',
                borderRadius: 999,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                color: filter === f ? '#0b0f14' : (CQ_FILTER_COLOR[f] || C.gray),
                background: filter === f ? (CQ_FILTER_COLOR[f] || C.gray) : 'transparent',
                border: `1px solid ${CQ_FILTER_COLOR[f] || C.gray}`,
              }}
            >
              {CQ_FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <select
          aria-label="Ordina preventivi"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ flex: '0 0 auto', background: C.navyLight, border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', color: C.white, fontSize: 13 }}
        >
          {CQ_SORTS.map((s) => <option key={s} value={s}>{CQ_SORT_LABEL[s]}</option>)}
        </select>
      </div>

      {state.error && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 12, borderRadius: 6, marginBottom: 20 }}>
          {state.error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {visibleRows.length === 0 && !state.loading && (
          <p style={{ color: C.gray }}>Nessun preventivo trovato.</p>
        )}

        {visibleRows.map((row) => {
          const payment = PAYMENT_LABEL[row.paymentStatus];
          const gps = GPS_LABEL[row.gpsStatus];
          const isPaid = row.paymentStatus === 'pagato';
          const createdLabel = row.createdAt
            ? new Date(row.createdAt).toLocaleDateString('it-IT')
            : (row.date && row.date !== '—' ? row.date : null);
          return (
            <div key={row.id} style={{ background: C.navyLight, border: '1px solid #374151', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ minWidth: 220 }}>
                  <strong style={{ color: C.white, fontSize: 16 }}>{row.client}</strong>
                  <p style={{ margin: '4px 0 0', color: C.gray, fontSize: 13 }}>
                    {(row.comuni || []).length > 0 ? row.comuni.join(', ') : (row.zone || 'Comuni non disponibili')}
                  </p>
                  <p style={{ margin: '4px 0 0', color: C.gray, fontSize: 12 }}>
                    ID: {shortCampaignId(row.id)}
                    {' · '}{serviceLabel(row.service)}
                    {createdLabel ? ` · ${createdLabel}` : ''}
                  </p>
                  <p style={{ margin: '4px 0 0', color: C.gray, fontSize: 12 }}>
                    {row.qty ? `${row.qty.toLocaleString('it-IT')} volantini` : 'Quantita non disponibile'}
                    {' · '}
                    {row.total != null ? `${row.total.toLocaleString('it-IT')} €` : 'Importo non disponibile'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge color={payment.color} text={payment.text} />
                  <Badge color={row.group ? C.white : C.gray} text={row.group ? row.group.name : 'Nessun gruppo'} outline />
                  <Badge color={C.white} text={PROGRAM_LABEL[row.programStatus]} outline />
                  <Badge color={gps.color} text={gps.text} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid #374151', paddingTop: 12 }}>
                <ActionBtn onClick={() => onNav?.(`admin-operations:${row.id}`)}>Apri</ActionBtn>
                <ActionBtn onClick={() => handleWhatsAppCliente(row)}>WhatsApp cliente</ActionBtn>
                <ActionBtn onClick={() => handleCopySummary(row)}>{copiedRowId === row.id ? 'Copiato ✓' : 'Copia riepilogo'}</ActionBtn>
                <ActionBtn as="a" href={row.phone ? `tel:${row.phone}` : undefined} disabled={!row.phone}>Chiama</ActionBtn>
                <ActionBtn as="a" href={row.email ? `mailto:${row.email}` : undefined} disabled={!row.email}>Email</ActionBtn>
                {row.paymentStatus === 'da_pagare' && (
                  <ActionBtn onClick={() => setPaymentConfirmRow(row)} accent>Conferma pagamento</ActionBtn>
                )}
                <ActionBtn
                  onClick={() => setAssignModal(row.id)}
                  disabled={!isPaid}
                  title={!isPaid ? 'Conferma prima il pagamento.' : ''}
                >
                  {row.assignment ? 'Modifica gruppo' : 'Assegna gruppo'}
                </ActionBtn>
                <ActionBtn
                  onClick={() => handleInviaProgramma(row)}
                  disabled={!isPaid || !row.assignment}
                  title={!isPaid ? 'Conferma prima il pagamento.' : (!row.assignment ? 'Assegna prima un gruppo.' : '')}
                >
                  Invia programma
                </ActionBtn>
                <ActionBtn onClick={() => handleGps(row)} disabled={row.gpsStatus === 'non_disponibile'}>GPS</ActionBtn>
              </div>
            </div>
          );
        })}
      </div>

      {assignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 50, overflowY: 'auto' }}>
          <Suspense fallback={<div style={{ color: C.white, padding: 40 }}>Caricamento...</div>}>
            <AssignWork
              campaignId={assignModal}
              existingAssignment={state.rows.find((r) => r.id === assignModal)?.assignment || null}
              onClose={() => setAssignModal(null)}
              onSaved={() => { setAssignModal(null); load(); }}
            />
          </Suspense>
        </div>
      )}

      {paymentConfirmRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.navyLight, border: '1px solid #374151', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', color: C.white, fontSize: 18 }}>Confermi di aver verificato il bonifico?</h3>
            <p style={{ margin: '0 0 16px', color: C.gray, fontSize: 13 }}>Questa azione segna il preventivo come pagato e sblocca l'assegnazione del gruppo.</p>
            <div style={{ display: 'grid', gap: 6, marginBottom: 20, padding: 14, borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid #374151' }}>
              <Row label="Cliente" value={paymentConfirmRow.client} />
              <Row label="Campagna" value={paymentConfirmRow.name || paymentConfirmRow.client} />
              <Row label="Comuni" value={(paymentConfirmRow.comuni || []).length > 0 ? paymentConfirmRow.comuni.join(', ') : (paymentConfirmRow.zone || 'Comuni non disponibili')} />
              <Row label="Importo" value={paymentConfirmRow.total != null ? `${paymentConfirmRow.total.toLocaleString('it-IT')} €` : 'Importo non disponibile'} />
            </div>
            {paymentConfirmError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {paymentConfirmError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <ActionBtn onClick={() => { setPaymentConfirmRow(null); setPaymentConfirmError(''); }} disabled={paymentConfirmBusy}>Annulla</ActionBtn>
              <ActionBtn onClick={handleConfirmPayment} disabled={paymentConfirmBusy} accent>{paymentConfirmBusy ? 'Conferma in corso…' : 'Conferma pagamento'}</ActionBtn>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function KpiCard({ label, value, color, onClick, active }) {
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      aria-pressed={clickable ? Boolean(active) : undefined}
      style={{
        textAlign: 'left',
        background: active ? `${color}1e` : 'rgba(255,255,255,.03)',
        border: `1px solid ${active ? color : '#374151'}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: clickable ? 'pointer' : 'default',
        display: 'grid',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: color === '#FFFFFF' ? '#fff' : color, lineHeight: 1 }}>
        {Number.isFinite(Number(value)) ? Number(value).toLocaleString('it-IT') : '0'}
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>{label}</span>
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'rgba(255,255,255,.5)' }}>{label}</span>
      <strong style={{ color: '#fff', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function Badge({ color, text, outline }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 800,
      padding: '4px 10px',
      borderRadius: 999,
      color: outline ? 'rgba(255,255,255,.75)' : color,
      border: `1px solid ${color}`,
      background: outline ? 'transparent' : `${color}22`,
    }}>{text}</span>
  );
}

function ActionBtn({ children, onClick, disabled, as, href, title, accent }) {
  const style = {
    background: disabled ? 'rgba(255,255,255,.02)' : accent ? 'rgba(232,87,26,.14)' : 'transparent',
    border: `1px solid ${disabled ? '#4B5563' : accent ? C.orange : '#4B5563'}`,
    color: disabled ? '#4B5563' : accent ? C.orange : '#D1D5DB',
    fontWeight: accent ? 800 : 400,
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };
  if (as === 'a') {
    if (disabled || !href) return <span style={style} title={title}>{children}</span>;
    return <a href={href} style={style} title={title}>{children}</a>;
  }
  return <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={style} title={title}>{children}</button>;
}
