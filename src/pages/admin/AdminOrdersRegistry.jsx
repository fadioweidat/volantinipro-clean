import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import { getClientsQuotesOverview } from '../../lib/services/admin-api.js';
import { confirmCampaignPayment } from '../../lib/supabaseClient.js';
import { AdminActionMenu } from '../../components/admin/AdminActionMenu.jsx';
import { AdminOrdersSummaryPanel } from './admin-orders/AdminOrdersSummaryPanel.jsx';
import { AdminOrdersToolbar } from './admin-orders/AdminOrdersToolbar.jsx';

// REGISTRO PREVENTIVI & ORDINI — vista tabellare stile Excel su tutti i
// preventivi/campagne reali. Nessuna tabella parallela, nessuna nuova query
// aggregata: stessa identica fonte dati di ClientsQuotes.jsx
// (getClientsQuotesOverview, gia' batch-fetched, nessun N+1) e stessa
// azione di conferma pagamento (confirmCampaignPayment). Differenza dalla
// pagina esistente: presentazione a griglia (non a card), ordinamento,
// filtri rapidi, ricerca globale, KPI, export CSV, drawer di dettaglio —
// nessuna di queste capacita' esisteva altrove, quindi non e' una
// duplicazione. NO WhatsApp/integrazioni esterne per ora, come richiesto.
const AssignWork = lazy(() => import('./AssignWork.jsx').then(m => ({ default: m.AssignWork })));

const C = {
  navy: '#0B1220',
  navyMid: '#111827',
  navyLight: '#1F2937',
  border: '#374151',
  orange: '#e8571a',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  green: '#10B981',
  red: '#EF4444',
  yellow: '#F59E0B',
  blue: '#60A5FA',
};

const PAYMENT_LABEL = {
  pagato: { text: 'PAGATO', color: C.green },
  da_pagare: { text: 'DA PAGARE', color: C.yellow },
  non_disponibile: { text: '—', color: C.gray },
};
const GPS_LABEL = {
  non_disponibile: { text: '—', color: C.gray },
  pronto: { text: 'PRONTO', color: C.blue },
  live: { text: 'LIVE', color: C.green },
  storico: { text: 'STORICO', color: C.gray },
};
const PROGRAM_LABEL = {
  nessun_programma: '—',
  da_inviare: 'Da inviare',
  inviato: 'Inviato',
  aperto: 'Aperto',
  confermato: 'Confermato',
};
const STATUS_LABEL = { pending: 'Nuovo', active: 'In corso', done: 'Completata' };

// Colonne mostrate nella tabella. `get` restituisce SEMPRE un valore reale o
// null/undefined — mai inventato; il rendering trasforma null/undefined in
// "—" in un unico punto (renderCell), cosi' "dato non disponibile" e'
// coerente su tutta la tabella.
const COLUMNS = [
  { key: 'id', label: 'ID', sortable: false, essential: true, get: (r) => shortId(r.id) },
  { key: 'date', label: 'Data', sortable: true, essential: false, get: (r) => r.date },
  { key: 'client', label: 'Cliente', sortable: true, essential: true, get: (r) => r.client },
  { key: 'company', label: 'Azienda', sortable: false, essential: false, get: (r) => r.company },
  { key: 'phone', label: 'Telefono', sortable: false, essential: false, get: (r) => r.phone },
  { key: 'email', label: 'Email', sortable: false, essential: false, get: (r) => r.email },
  { key: 'service', label: 'Servizio', sortable: false, essential: false, get: (r) => (r.service ? r.service.toUpperCase() : null) },
  { key: 'comuni', label: 'Comuni / Zone', sortable: false, essential: true, get: (r) => ((r.comuni || []).length ? r.comuni.join(', ') : r.zone) },
  { key: 'qty', label: 'Quantità', sortable: true, essential: false, get: (r) => (r.qty || null) },
  // Prezzo base/Extra: nessun campo reale distinto trovato in audit — solo
  // total_amount esiste. Mostrati "—" invece di inventare una scomposizione.
  { key: 'basePrice', label: 'Prezzo base', sortable: false, essential: false, get: () => null },
  { key: 'extra', label: 'Extra', sortable: false, essential: false, get: () => null },
  { key: 'total', label: 'Totale', sortable: true, essential: true, get: (r) => r.total, format: formatMoney },
  { key: 'status', label: 'Stato preventivo', sortable: false, essential: false, get: (r) => STATUS_LABEL[r.status] || r.status },
  { key: 'paymentStatus', label: 'Stato pagamento', sortable: false, essential: true, render: (r) => <Badge {...PAYMENT_LABEL[r.paymentStatus]} />, csv: (r) => PAYMENT_LABEL[r.paymentStatus]?.text },
  { key: 'paymentDate', label: 'Data pagamento', sortable: false, essential: false, get: (r) => (r.metadata?.payment_confirmed_at || '').slice(0, 10) || null },
  // "Deadline" = fine finestra di lavoro assegnata (operator_assignments.ends_at)
  // — nessun campo "deadline" dedicato trovato in audit, e' il dato reale
  // piu' vicino al concetto richiesto.
  { key: 'workDate', label: 'Data lavoro', sortable: false, essential: false, get: (r) => (r.assignment?.starts_at || '').slice(0, 10) || null },
  { key: 'deadline', label: 'Deadline', sortable: false, essential: false, get: (r) => (r.assignment?.ends_at || '').slice(0, 10) || null },
  { key: 'group', label: 'Gruppo assegnato', sortable: false, essential: false, get: (r) => r.group?.name },
  { key: 'operator', label: 'Operatori', sortable: false, essential: false, get: (r) => r.operator?.name },
  { key: 'programStatus', label: 'Stato programma', sortable: false, essential: false, get: (r) => PROGRAM_LABEL[r.programStatus] },
  { key: 'gpsStatus', label: 'Stato GPS', sortable: false, essential: true, render: (r) => <Badge {...GPS_LABEL[r.gpsStatus]} />, csv: (r) => GPS_LABEL[r.gpsStatus]?.text },
  // Copertura %: richiederebbe una RPC per riga (calculate_zone/campaign_
  // final_coverage) — deliberatamente NON chiamata qui per non introdurre
  // un N+1 su centinaia di righe (Fase 14). Disponibile invece nel drawer
  // di dettaglio, calcolata on-demand solo per la riga aperta.
  { key: 'coverage', label: 'Copertura %', sortable: false, essential: false, get: () => null },
  { key: 'workProgress', label: 'Stato lavoro', sortable: false, essential: false, get: (r) => (r.ops?.sessionCount ? `${r.ops.progress}%` : null) },
  { key: 'report', label: 'Report finale', sortable: false, essential: false, get: (r) => (r.gpsStatus !== 'non_disponibile' ? 'Verifica in dettaglio' : null) },
  { key: 'notes', label: 'Note Admin', sortable: false, essential: false, get: () => null },
];

function shortId(id) {
  return id ? String(id).slice(0, 8) : '—';
}
function formatMoney(v) {
  return v != null ? `${Number(v).toLocaleString('it-IT')} €` : null;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Filtri rapidi (Fase 5): ognuno deriva da uno stato reale gia' presente nel
// dato normalizzato — nessuno stato nuovo inventato. Nota onesta: il ticket
// elenca sia "Da confermare" sia "Da pagare" come filtri distinti, ma
// l'unico stato reale disponibile (metadata.payment_status =
// 'in_attesa_pagamento') non distingue i due concetti — un solo filtro
// reale ("Da pagare") invece di duplicarne uno fittizio.
const QUICK_FILTERS = [
  { key: 'all', label: 'Tutti', test: () => true },
  { key: 'today', label: 'Oggi', test: (r) => r.date === todayStr() },
  { key: 'new', label: 'Nuovi', test: (r) => r.paymentStatus === 'non_disponibile' && !r.assignment },
  { key: 'to_pay', label: 'Da pagare', test: (r) => r.paymentStatus === 'da_pagare' },
  { key: 'paid', label: 'Pagati', test: (r) => r.paymentStatus === 'pagato' },
  { key: 'to_assign', label: 'Da assegnare', test: (r) => r.paymentStatus === 'pagato' && !r.assignment },
  { key: 'scheduled', label: 'Programmati', test: (r) => ['inviato', 'aperto', 'confermato'].includes(r.programStatus) },
  { key: 'in_progress', label: 'In lavorazione', test: (r) => r.gpsStatus === 'live' },
  { key: 'completed', label: 'Completati', test: (r) => r.gpsStatus === 'storico' || r.status === 'done' },
  { key: 'problems', label: 'Problemi', test: (r) => (r.ops?.problems || 0) > 0 },
];

const SEARCH_FIELDS = (r) => [r.id, r.client, r.company, r.email, r.phone, ...(r.comuni || []), r.zone, r.group?.name].filter(Boolean).join(' ').toLowerCase();

export function AdminOrdersRegistry({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [drawerRow, setDrawerRow] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [paymentConfirmRow, setPaymentConfirmRow] = useState(null);
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
      if (background) setState((prev) => ({ ...prev, loading: false }));
      else setState({ loading: false, error: err?.message || 'Errore di caricamento', rows: [] });
    }
  };
  useEffect(() => {
    let cancelled = false;
    load();
    const timer = window.setInterval(() => { if (!cancelled) load({ background: true }); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const filteredRows = useMemo(() => {
    const filterDef = QUICK_FILTERS.find((f) => f.key === activeFilter) || QUICK_FILTERS[0];
    const q = search.trim().toLowerCase();
    let rows = state.rows.filter(filterDef.test);
    if (q) rows = rows.filter((r) => SEARCH_FIELDS(r).includes(q));
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const va = col.get(a);
        const vb = col.get(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it');
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [state.rows, search, activeFilter, sort]);

  const kpi = useMemo(() => {
    const rows = state.rows;
    const sum = (test) => rows.filter(test).length;
    const totalValue = rows.reduce((s, r) => s + (r.total || 0), 0);
    const paidValue = rows.filter((r) => r.paymentStatus === 'pagato').reduce((s, r) => s + (r.total || 0), 0);
    return {
      total: rows.length,
      new: sum((r) => r.paymentStatus === 'non_disponibile' && !r.assignment),
      toPay: sum((r) => r.paymentStatus === 'da_pagare'),
      paid: sum((r) => r.paymentStatus === 'pagato'),
      toAssign: sum((r) => r.paymentStatus === 'pagato' && !r.assignment),
      inProgress: sum((r) => r.gpsStatus === 'live'),
      completed: sum((r) => r.gpsStatus === 'storico' || r.status === 'done'),
      totalValue,
      paidValue,
    };
  }, [state.rows]);

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
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

  function exportCsv() {
    const header = COLUMNS.map((c) => c.label);
    const lines = filteredRows.map((r) => COLUMNS.map((c) => csvCell((c.csv || c.get)(r), c.format)));
    const csv = [header, ...lines].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volantinipro-ordini-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Registro Preventivi & Ordini' }];

  return (
    <AdminLayout title="Registro Preventivi & Ordini" subtitle="Un registro unico, stile Excel, su tutti i preventivi e ordini reali." breadcrumbs={breadcrumbs} onNav={onNav}>
      <AdminOrdersSummaryPanel
        kpi={kpi}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        quickFilters={QUICK_FILTERS}
        Kpi={Kpi}
        formatMoney={formatMoney}
        colors={C}
        chipStyle={chipStyle}
        styles={{
          kpiGridStyle,
        }}
      />

      <AdminOrdersToolbar
        search={search}
        setSearch={setSearch}
        loading={state.loading}
        onExport={exportCsv}
        colors={C}
        styles={{
          exportButtonStyle,
        }}
      />

      {state.error && <div style={errorBoxStyle}>{state.error}</div>}

      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} style={thStyle} onClick={c.sortable ? () => toggleSort(c.key) : undefined}>
                  <span style={{ cursor: c.sortable ? 'pointer' : 'default', userSelect: 'none' }}>
                    {c.label}{c.sortable && sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
              <th style={thStyle}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={row.id} style={trStyle(i)} onClick={() => setDrawerRow(row)}>
                {COLUMNS.map((c) => (
                  <td key={c.key} style={tdStyle}>{c.render ? c.render(row) : renderCell(c.get(row), c.format)}</td>
                ))}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <RowActions
                      row={row}
                      onNav={onNav}
                      onAssign={() => setAssignModal(row.id)}
                      onConfirmPayment={() => setPaymentConfirmRow(row)}
                    />
                    <AdminActionMenu campaign={row} onDone={load} />
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && !state.loading && (
              <tr><td colSpan={COLUMNS.length + 1} style={{ ...tdStyle, textAlign: 'center', color: C.gray, padding: 24 }}>Nessun preventivo trovato per questo filtro/ricerca.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerRow && (
        <RowDrawer row={drawerRow} onClose={() => setDrawerRow(null)} onNav={onNav} />
      )}

      {assignModal && (
        <div style={modalOverlayStyle}>
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
        <div style={{ ...modalOverlayStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.navyLight, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', color: C.white, fontSize: 18 }}>Confermi di aver verificato il bonifico?</h3>
            <p style={{ margin: '0 0 16px', color: C.gray, fontSize: 13 }}>Questa azione segna il preventivo come pagato e sblocca l'assegnazione del gruppo.</p>
            {paymentConfirmError && <div style={errorBoxStyle}>{paymentConfirmError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => { setPaymentConfirmRow(null); setPaymentConfirmError(''); }} disabled={paymentConfirmBusy} style={secondaryBtnStyle}>Annulla</button>
              <button type="button" onClick={handleConfirmPayment} disabled={paymentConfirmBusy} style={accentBtnStyle}>{paymentConfirmBusy ? 'Conferma in corso…' : 'Conferma pagamento'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function csvCell(value, format) {
  const v = format ? format(value) : value;
  return v == null ? '' : String(v);
}
function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function renderCell(value, format) {
  const v = format ? format(value) : value;
  return v == null || v === '' ? <span style={{ color: 'rgba(255,255,255,.28)' }}>—</span> : v;
}

function RowActions({ row, onNav, onAssign, onConfirmPayment }) {
  const isPaid = row.paymentStatus === 'pagato';
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <MiniBtn onClick={() => onNav?.(`admin-operations:${row.id}`)}>Apri</MiniBtn>
      {row.paymentStatus === 'da_pagare' && <MiniBtn onClick={onConfirmPayment} accent>Pagamento</MiniBtn>}
      <MiniBtn onClick={onAssign} disabled={!isPaid} title={!isPaid ? 'Conferma prima il pagamento.' : ''}>{row.assignment ? 'Gruppo' : 'Assegna'}</MiniBtn>
      <MiniBtn onClick={() => onNav?.(`admin-gps:${row.id}`)} disabled={row.gpsStatus === 'non_disponibile'}>GPS</MiniBtn>
      <MiniBtn onClick={() => onNav?.(`admin-report:${row.id}`)} disabled={row.gpsStatus === 'non_disponibile'}>Report</MiniBtn>
    </div>
  );
}

function RowDrawer({ row, onClose, onNav }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} onClick={onClose} />
      <aside style={drawerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: C.white, fontSize: 20 }}>{row.client}</h2>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>Chiudi</button>
        </div>

        <DrawerSection title="PREVENTIVO">
          <DrawerRow label="ID" value={row.id} />
          <DrawerRow label="Data" value={row.date} />
          <DrawerRow label="Servizio" value={row.service?.toUpperCase()} />
          <DrawerRow label="Quantità" value={row.qty} />
          <DrawerRow label="Prezzo (totale)" value={formatMoney(row.total)} />
        </DrawerSection>

        <DrawerSection title="CLIENTE">
          <DrawerRow label="Nome" value={row.client} />
          <DrawerRow label="Azienda" value={row.company} />
          <DrawerRow label="Telefono" value={row.phone} />
          <DrawerRow label="Email" value={row.email} />
        </DrawerSection>

        <DrawerSection title="ZONE">
          {(row.comuni || []).length ? (row.comuni || []).map((c, i) => <DrawerRow key={i} label={`Comune ${i + 1}`} value={c} />) : <DrawerRow label="Comuni" value={row.zone} />}
        </DrawerSection>

        <DrawerSection title="PAGAMENTO">
          <DrawerRow label="Stato" value={PAYMENT_LABEL[row.paymentStatus]?.text} />
          <DrawerRow label="Importo" value={formatMoney(row.total)} />
          <DrawerRow label="Data conferma" value={(row.metadata?.payment_confirmed_at || '').slice(0, 10)} />
        </DrawerSection>

        <DrawerSection title="OPERATIVO">
          <DrawerRow label="Gruppo" value={row.group?.name} />
          <DrawerRow label="Operatore" value={row.operator?.name} />
          <DrawerRow label="Data lavoro" value={(row.assignment?.starts_at || '').slice(0, 10)} />
          <DrawerRow label="Stato programma" value={PROGRAM_LABEL[row.programStatus]} />
        </DrawerSection>

        <DrawerSection title="GPS">
          <DrawerRow label="Stato" value={GPS_LABEL[row.gpsStatus]?.text} />
          <DrawerRow label="Sessioni" value={row.ops?.sessionCount ?? null} />
          <DrawerRow label="Ultimo aggiornamento" value={row.ops?.lastPing ? new Date(row.ops.lastPing).toLocaleString('it-IT') : null} />
          {/* Copertura % non calcolata qui in automatico (evita RPC per
              ogni riga della tabella) — si apre la mappa GPS reale per il
              dato preciso, coerente con "riusare le route esistenti". */}
        </DrawerSection>

        <DrawerSection title="REPORT">
          <DrawerRow label="Disponibile" value={row.gpsStatus !== 'non_disponibile' ? 'Verifica aprendo il report' : 'Non disponibile (nessun dato GPS)'} />
        </DrawerSection>

        <DrawerSection title="NOTE ADMIN">
          {/* Fase 10: nessun campo note Admin esiste sui dati reali (audit).
              Nessuna migration automatica — solo un campo disabilitato. */}
          <textarea disabled placeholder="Nessun campo note Admin nel modello dati attuale." style={{ width: '100%', minHeight: 60, background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`, borderRadius: 8, color: 'rgba(255,255,255,.4)', padding: 8, fontSize: 13, resize: 'vertical' }} />
        </DrawerSection>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" onClick={() => onNav?.(`admin-operations:${row.id}`)} style={accentBtnStyle}>Apri campagna</button>
          <button type="button" onClick={() => onNav?.(`admin-gps:${row.id}`)} disabled={row.gpsStatus === 'non_disponibile'} style={secondaryBtnStyle}>Apri GPS</button>
          <button type="button" onClick={() => onNav?.(`admin-report:${row.id}`)} disabled={row.gpsStatus === 'non_disponibile'} style={secondaryBtnStyle}>Apri report</button>
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: C.orange }}>{title}</p>
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  );
}
function DrawerRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'rgba(255,255,255,.5)' }}>{label}</span>
      <strong style={{ color: value ? '#fff' : 'rgba(255,255,255,.3)', textAlign: 'right' }}>{value || '—'}</strong>
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div style={kpiCardStyle}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(255,255,255,.5)' }}>{label}</span>
      <strong style={{ fontSize: 20, color: tone || C.white }}>{value}</strong>
    </div>
  );
}
function Badge({ color, text }) {
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, color, border: `1px solid ${color}`, background: `${color}22`, whiteSpace: 'nowrap' }}>{text}</span>;
}
function MiniBtn({ children, onClick, disabled, accent, title }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} title={title} style={{
      background: disabled ? 'rgba(255,255,255,.02)' : accent ? 'rgba(232,87,26,.14)' : 'transparent',
      border: `1px solid ${disabled ? '#4B5563' : accent ? C.orange : '#4B5563'}`,
      color: disabled ? '#4B5563' : accent ? C.orange : '#D1D5DB',
      fontSize: 11, padding: '4px 8px', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  );
}

function chipStyle(active) {
  return {
    border: active ? 'none' : `1px solid ${C.border}`,
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    background: active ? C.orange : 'rgba(255,255,255,.04)',
    color: active ? '#fff' : 'rgba(255,255,255,.7)',
  };
}

const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 16 };
const kpiCardStyle = { display: 'grid', gap: 4, padding: '10px 12px', background: C.navyLight, border: `1px solid ${C.border}`, borderRadius: 10 };
const exportButtonStyle = { background: 'rgba(255,255,255,.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 };
const errorBoxStyle = { background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
// Griglia stile Excel: header sticky, scroll orizzontale, righe alternate.
const tableScrollStyle = { overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: '70vh', overflowY: 'auto' };
const tableStyle = { borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 1600 };
const thStyle = { position: 'sticky', top: 0, background: C.navy, color: 'rgba(255,255,255,.6)', textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', zIndex: 1 };
const tdStyle = { padding: '8px 10px', color: 'rgba(255,255,255,.85)', borderBottom: `1px solid rgba(55,65,81,.5)`, whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' };
function trStyle(i) {
  return { background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)', cursor: 'pointer' };
}
const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 60, overflowY: 'auto' };
const secondaryBtnStyle = { background: 'transparent', border: `1px solid ${C.border}`, color: '#D1D5DB', fontSize: 13, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' };
const accentBtnStyle = { background: C.orange, border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' };
const drawerStyle = { position: 'absolute', top: 0, right: 0, height: '100%', width: 'min(420px, 100vw)', background: C.navyMid, borderLeft: `1px solid ${C.border}`, padding: 20, overflowY: 'auto' };
