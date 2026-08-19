import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import { getDailyOperationsReport } from '../../lib/services/admin-api.js';
import { dailyOperationsReportCsv } from '../../lib/operations/dailyOperationsReport.js';

const C = { bg: '#111827', card: '#1F2937', line: '#374151', white: '#fff', muted: '#9CA3AF', orange: '#e8571a', green: '#10B981', red: '#EF4444', yellow: '#F59E0B', blue: '#60A5FA' };
const pad = value => String(value).padStart(2, '0');
const localDateValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatNumber = value => Number(value || 0).toLocaleString('it-IT');
const formatTime = value => value ? new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';

function shiftDate(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return localDateValue(date);
}

function tone(status) {
  if (status === 'COMPLETATO') return C.green;
  if (status === 'PROBLEMA') return C.red;
  if (status === 'PARZIALE') return C.yellow;
  if (status === 'IN CORSO') return C.blue;
  return C.muted;
}

function Kpi({ label, value, detail, color = C.white }) {
  return <div style={styles.kpi}>
    <span style={styles.eyebrow}>{label}</span>
    <strong style={{ fontSize: 25, color }}>{value}</strong>
    {detail && <span style={styles.small}>{detail}</span>}
  </div>;
}

function SelectFilter({ label, value, onChange, children }) {
  return <label style={{ display: 'grid', gap: 5, minWidth: 180, flex: '1 1 180px' }}>
    <span style={styles.eyebrow}>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)} style={styles.control}>{children}</select>
  </label>;
}

export function AdminDailyReport({ onNav }) {
  const [date, setDate] = useState(() => localDateValue(new Date()));
  const [state, setState] = useState({ loading: true, error: null, report: null });
  const [campaign, setCampaign] = useState('all');
  const [driver, setDriver] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setState(current => ({ ...current, loading: true, error: null }));
    getDailyOperationsReport(date)
      .then(report => { if (!cancelled) setState({ loading: false, error: null, report }); })
      .catch(error => { if (!cancelled) setState({ loading: false, error: error.message || 'Errore di caricamento', report: null }); });
    return () => { cancelled = true; };
  }, [date]);

  const report = state.report;
  const filteredDrivers = useMemo(() => (report?.drivers || []).filter(item =>
    (campaign === 'all' || item.campaignId === campaign)
    && (driver === 'all' || item.operatorId === driver)
    && (status === 'all' || item.status === status)
  ), [campaign, driver, report, status]);

  const filteredReport = useMemo(() => report ? { ...report, drivers: filteredDrivers } : null, [filteredDrivers, report]);
  const driverOptions = useMemo(() => [...new Map((report?.drivers || []).map(item => [item.operatorId, item])).values()], [report]);

  const exportCsv = () => {
    if (!filteredReport || filteredDrivers.length === 0) return;
    const url = URL.createObjectURL(new Blob([dailyOperationsReportCsv(filteredReport)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-operativo-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Centrale Operativa', href: '/admin/operations' }, { label: 'Report giornaliero' }];
  return <AdminLayout title="REPORT OPERATIVO GIORNALIERO" subtitle="Riepilogo basato esclusivamente su attività operative registrate" breadcrumbs={breadcrumbs} onNav={onNav}>
    <section style={{ ...styles.card, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" aria-label="Giorno precedente" onClick={() => setDate(current => shiftDate(current, -1))} style={styles.button}>←</button>
        <label style={{ display: 'grid', gap: 5 }}><span style={styles.eyebrow}>Data</span><input type="date" value={date} onChange={event => setDate(event.target.value)} style={styles.control} /></label>
        <button type="button" onClick={() => setDate(localDateValue(new Date()))} style={styles.button}>Oggi</button>
        <button type="button" aria-label="Giorno successivo" onClick={() => setDate(current => shiftDate(current, 1))} style={styles.button}>→</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {state.loading && <span style={styles.small}>Aggiornamento…</span>}
          <button type="button" onClick={exportCsv} disabled={!filteredDrivers.length} style={{ ...styles.button, background: filteredDrivers.length ? C.orange : C.line, color: C.white }}>Esporta CSV</button>
        </div>
      </div>
    </section>

    {state.error && <div role="alert" style={styles.error}>{state.error}</div>}
    {!state.loading && !state.error && report?.drivers.length === 0 && <div style={styles.empty}>Nessuna attività operativa per questa data.</div>}

    {report?.drivers.length > 0 && <>
      <section style={styles.kpiGrid}>
        <Kpi label="Driver programmati" value={report.kpis.driversScheduled} />
        <Kpi label="Driver che hanno iniziato" value={report.kpis.driversStarted} color={C.blue} />
        <Kpi label="Driver completati" value={report.kpis.driversCompleted} color={C.green} />
        <Kpi label="Comuni assegnati" value={report.kpis.municipalitiesAssigned} />
        <Kpi label="Comuni completati" value={report.kpis.municipalitiesCompleted} color={C.green} />
        <Kpi label="Comuni parziali" value={report.kpis.municipalitiesPartial} color={C.yellow} />
        <Kpi label="Comuni bloccati" value={report.kpis.municipalitiesBlocked} color={C.red} />
        <Kpi label="Volantini assegnati" value={formatNumber(report.kpis.quantityAssigned)} detail="Nessuna quantità distribuita inventata" />
        <Kpi label="Avanzamento reale" value={`${report.kpis.zonesCompleted} / ${report.kpis.zonesAssigned}`} detail="Zone completate / assegnate" />
        <Kpi label="Foto ricevute" value={report.kpis.photos} />
        <Kpi label="Sessioni GPS" value={report.kpis.gpsSessions} />
        <Kpi label="Alert operativi" value={report.kpis.alerts} color={report.kpis.alerts ? C.red : C.green} detail="Attivi sullo stato disponibile" />
      </section>

      <section style={{ ...styles.card, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <SelectFilter label="Campagna" value={campaign} onChange={setCampaign}><option value="all">Tutte le campagne</option>{report.campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectFilter>
          <SelectFilter label="Driver" value={driver} onChange={setDriver}><option value="all">Tutti i driver</option>{driverOptions.map(item => <option key={item.operatorId} value={item.operatorId}>{item.driverName}</option>)}</SelectFilter>
          <SelectFilter label="Stato" value={status} onChange={setStatus}><option value="all">Tutti gli stati</option>{['COMPLETATO', 'PROBLEMA', 'PARZIALE', 'IN CORSO', 'NON INIZIATO'].map(item => <option key={item} value={item}>{item}</option>)}</SelectFilter>
        </div>
        <p style={{ ...styles.small, margin: '12px 0 0' }}>{filteredDrivers.length} programmi visualizzati. KPI superiori riferiti all’intera giornata.</p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={styles.heading}>Riepilogo campagne</h2>
        <div style={styles.campaignGrid}>{report.campaigns.map(item => <article key={item.id} style={styles.card}>
          <strong style={{ color: C.white }}>{item.name}</strong>
          <div style={{ ...styles.small, marginTop: 8 }}>{item.drivers} driver · {item.municipalities} comuni</div>
          <div style={{ color: C.orange, fontWeight: 800, marginTop: 5 }}>{formatNumber(item.quantityAssigned)} assegnati</div>
        </article>)}</div>
      </section>

      <section>
        <h2 style={styles.heading}>Dettaglio driver</h2>
        {filteredDrivers.length === 0 ? <div style={styles.empty}>Nessun driver corrisponde ai filtri selezionati.</div> : <div style={{ display: 'grid', gap: 14 }}>
          {filteredDrivers.map(item => <article key={item.id} style={{ ...styles.card, borderTop: `3px solid ${tone(item.status)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div><span style={styles.eyebrow}>{item.campaignName}</span><h3 style={{ margin: '5px 0', color: C.white, fontSize: 20 }}>{item.driverName}</h3><span style={styles.small}>{item.zones.length} comuni · {formatNumber(item.quantityAssigned)} volantini assegnati</span></div>
              <strong style={{ color: tone(item.status), border: `1px solid ${tone(item.status)}`, borderRadius: 999, padding: '6px 10px', alignSelf: 'start', fontSize: 12 }}>{item.status}</strong>
            </div>

            <div style={styles.metricGrid}>
              <Metric label="Primo avvio" value={formatTime(item.firstSessionStart)} />
              <Metric label="Ultima chiusura" value={formatTime(item.lastSessionEnd)} />
              <Metric label="Durata sessioni" value={item.durationLabel} />
              <Metric label="Sessioni" value={item.sessionCounts.total} detail={`${item.sessionCounts.completed} completate · ${item.sessionCounts.active} attive · ${item.sessionCounts.cancelled} annullate · ${item.sessionCounts.paused} in pausa`} />
              <Metric label="Punti GPS" value={formatNumber(item.gpsPointCount)} detail={`${formatTime(item.firstGpsAt)} — ${formatTime(item.lastGpsAt)}`} />
              <Metric label="Foto" value={item.photoCount} />
            </div>

            <div style={styles.twoColumns}>
              <div><h4 style={styles.subheading}>Comuni</h4><div style={{ display: 'grid', gap: 7 }}>{item.zones.map(zone => <div key={zone.id} style={styles.row}>
                <div><strong style={{ color: C.white }}>{zone.name}</strong><div style={styles.small}>{formatNumber(zone.quantityAssigned)} volantini · {zone.photoCount} foto</div></div>
                <span style={{ color: tone(zone.status === 'Completata' ? 'COMPLETATO' : zone.status === 'Bloccata' ? 'PROBLEMA' : zone.status === 'Parziale' ? 'PARZIALE' : zone.status === 'In corso' ? 'IN CORSO' : 'NON INIZIATO'), fontSize: 12, fontWeight: 800 }}>{zone.status}</span>
              </div>)}</div></div>
              <div><h4 style={styles.subheading}>Timeline reale</h4>{item.timeline.length === 0 ? <p style={styles.small}>Nessun evento registrato per questa data.</p> : <div style={{ display: 'grid', gap: 8 }}>{item.timeline.map((event, index) => <div key={`${event.type}-${event.at}-${index}`} style={styles.timeline}><time>{formatTime(event.at)}</time><span>{event.label}</span></div>)}</div>}</div>
            </div>

            <div style={{ marginTop: 16 }}><h4 style={styles.subheading}>Alert attivi a fine giornata</h4>
              <p style={{ ...styles.small, marginTop: -4 }}>Alert derivati dallo stato disponibile; non costituiscono uno storico persistito degli alert risolti.</p>
              {item.alerts.length === 0 ? <span style={{ color: C.green, fontSize: 13 }}>Nessun alert attivo rilevato.</span> : <div style={{ display: 'grid', gap: 6 }}>{item.alerts.map(alert => <div key={alert.id} style={{ color: alert.severity === 'CRITICAL' ? '#FCA5A5' : alert.severity === 'WARNING' ? '#FCD34D' : '#93C5FD', fontSize: 13 }}>{alert.message}</div>)}</div>}
            </div>
          </article>)}
        </div>}
      </section>
    </>}
  </AdminLayout>;
}

function Metric({ label, value, detail }) {
  return <div style={{ minWidth: 0 }}><span style={styles.eyebrow}>{label}</span><strong style={{ display: 'block', color: C.white, marginTop: 4 }}>{value}</strong>{detail && <span style={styles.small}>{detail}</span>}</div>;
}

const styles = {
  card: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, minWidth: 0 },
  kpi: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: 'grid', gap: 5, minWidth: 0 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10, marginBottom: 18 },
  campaignGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 14, marginTop: 18, padding: '14px 0', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` },
  twoColumns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20, marginTop: 16 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' },
  small: { color: C.muted, fontSize: 12, lineHeight: 1.5 },
  heading: { color: C.white, fontSize: 18, margin: '0 0 10px' },
  subheading: { color: C.white, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' },
  control: { height: 40, minWidth: 0, borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg, color: C.white, padding: '0 10px', colorScheme: 'dark' },
  button: { minHeight: 40, borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg, color: C.white, padding: '0 14px', cursor: 'pointer', fontWeight: 700 },
  error: { padding: 14, borderRadius: 10, border: `1px solid ${C.red}`, color: '#FCA5A5', background: 'rgba(239,68,68,.1)', marginBottom: 18 },
  empty: { padding: 28, borderRadius: 12, border: `1px dashed ${C.line}`, color: C.muted, textAlign: 'center' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8, background: C.bg, minWidth: 0 },
  timeline: { display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: 9, color: C.white, fontSize: 13, paddingLeft: 10, borderLeft: `2px solid ${C.orange}` },
};
