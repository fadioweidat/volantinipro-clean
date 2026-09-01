// Analytics Visitatori — dashboard Admin (/admin/analytics, AdminGuard in
// AppRouter). Legge public.site_events (RLS: solo admin) e aggrega lato
// client con analyticsAggregate. Dati SOLO aggregati, mai per-persona.

import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../AdminLayout.jsx';
import { getAnalyticsEvents } from '../../../lib/services/admin-api.js';
import { computeAnalytics } from '../../../lib/analytics/analyticsAggregate.js';
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '../../../lib/analytics/siteEvents.js';
import {
  OverviewSection, GeographySection, SourcesSection, PagesSection, FunnelSection, CommercialDemandSection,
} from './sections.jsx';

const RANGES = [
  { days: 1, label: 'Oggi' },
  { days: 7, label: '7 giorni' },
  { days: 30, label: '30 giorni' },
];
const TABS = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'geography', label: 'Geografia' },
  { id: 'sources', label: 'Sorgenti' },
  { id: 'pages', label: 'Pagine' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'commercial', label: 'Domanda commerciale' },
];

const tabBtn = (active) => ({
  border: '1px solid', borderColor: active ? '#2563eb' : 'rgba(255,255,255,.16)',
  background: active ? '#2563eb' : 'rgba(255,255,255,.05)', color: '#fff',
  borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
});

export function AnalyticsPage({ onNav }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [tab, setTab] = useState('overview');
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: false });
  const [optedOut, setOptedOut] = useState(() => isAnalyticsOptedOut());

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getAnalyticsEvents({ days: rangeDays })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: res.available ? null : (res.error || 'Analytics non disponibile'), rows: res.rows, available: res.available });
      })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err?.message || 'Errore', rows: [], available: false }); });
    return () => { cancelled = true; };
  }, [rangeDays]);

  const data = useMemo(() => computeAnalytics(state.rows, { rangeDays }), [state.rows, rangeDays]);

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Analytics Visitatori' }];

  return (
    <AdminLayout
      title="Analytics Visitatori"
      subtitle="Traffico sito first-party, privacy-safe (site_events). Dati aggregati, nessun profilo personale, nessun IP."
      breadcrumbs={breadcrumbs}
      onNav={onNav}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {RANGES.map((r) => (
          <button key={r.days} type="button" onClick={() => setRangeDays(r.days)} style={tabBtn(rangeDays === r.days)}>{r.label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
          <input
            type="checkbox"
            checked={optedOut}
            onChange={(e) => { setAnalyticsOptOut(e.target.checked); setOptedOut(e.target.checked); }}
          />
          Escludi questo browser dal tracking (opt-out)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {state.loading && <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Caricamento eventi…</p>}
      {!state.loading && !state.available && (
        <div style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.4)', borderRadius: 10, padding: 14, color: '#fde68a', fontSize: 13 }}>
          Analytics non disponibile: {state.error || 'nessun evento registrato'}. La tabella <code>site_events</code> potrebbe non essere ancora migrata,
          oppure non ci sono ancora visite nel periodo. Nessun dato viene stimato.
        </div>
      )}
      {!state.loading && state.available && !data.hasAnyData && (
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Nessun evento nel periodo selezionato.</p>
      )}

      {!state.loading && state.available && data.hasAnyData && (
        <>
          {tab === 'overview' && <OverviewSection data={data} />}
          {tab === 'geography' && <GeographySection data={data} />}
          {tab === 'sources' && <SourcesSection data={data} />}
          {tab === 'pages' && <PagesSection data={data} />}
          {tab === 'funnel' && <FunnelSection data={data} />}
          {tab === 'commercial' && <CommercialDemandSection data={data} />}
        </>
      )}

      <p style={{ marginTop: 16, fontSize: 10.5, color: 'rgba(255,255,255,.35)' }}>
        Fonte: site_events (eventi anonimi first-party). Geo approssimata (country/region/city) aggiunta lato server da /api/track, mai l'IP.
        visitor id con scadenza 90 giorni. Retention: eventi grezzi 90 giorni, rollup 13 mesi.
      </p>
    </AdminLayout>
  );
}

export default AnalyticsPage;
