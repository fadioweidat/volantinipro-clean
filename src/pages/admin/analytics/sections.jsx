// Analytics Visitatori — le 6 sezioni della dashboard.
import { BarChart, FunnelChart, HBarList, KpiTile, Empty, analyticsPanelStyle, analyticsHeadingStyle } from './charts.jsx';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('it-IT'));
const pctFmt = (n) => (n == null ? '—' : `${n}%`);

export function OverviewSection({ data }) {
  const o = data.overview;
  const excl = data.excluded || { botTest: 0, adminInternal: 0, unclassified: 0 };
  const isPublic = (data.trafficClass || 'public') === 'public';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
        {isPublic ? 'KPI su traffico pubblico reale.' : `KPI su traffico "${data.trafficClass}".`}
        {' '}Escluso dal pubblico: {excl.botTest} bot/test · {excl.adminInternal} admin/internal · {excl.unclassified} non classificati.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <KpiTile label="Visitatori oggi" value={fmt(o.visitorsToday)} />
        <KpiTile label="Visitatori unici (periodo)" value={fmt(o.uniqueVisitors)} />
        <KpiTile label="Sessioni (periodo)" value={fmt(o.sessions)} sub={`oggi ${fmt(o.sessionsToday)}`} />
        <KpiTile label="Pagine viste (periodo)" value={fmt(o.pageViews)} sub={`oggi ${fmt(o.pageViewsToday)}`} />
        <KpiTile label="Preventivi iniziati" value={fmt(o.quotesStarted)} sub={`oggi ${fmt(o.quotesStartedToday)}`} />
        <KpiTile label="Preventivi completati" value={fmt(o.quotesCompleted)} sub={`oggi ${fmt(o.quotesCompletedToday)}`} tone="good" />
        <KpiTile label="Conversione" value={pctFmt(o.conversionRate)} tone={o.conversionRate != null && o.conversionRate >= 5 ? 'good' : 'default'} />
        <KpiTile label="Richieste consulenza" value={fmt(o.consultationRequests)} />
      </div>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Visite per giorno</p>
        <BarChart data={data.daily.map((d) => ({ day: d.day, value: d.visitors }))} label="visitatori" />
      </div>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Dispositivo</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div><b style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Tipo</b><HBarList items={data.device.types} color="#34d399" max={4} /></div>
          <div><b style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Browser</b><HBarList items={data.device.browsers} color="#a78bfa" max={6} /></div>
          <div><b style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>OS</b><HBarList items={data.device.os} color="#60a5fa" max={6} /></div>
        </div>
      </div>
    </div>
  );
}

export function GeographySection({ data }) {
  const g = data.geography;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Paese</p>
        <HBarList items={g.countries} color="#f59e0b" emptyText="Geo non ancora disponibile (arriva da /api/track)." />
      </div>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Regione</p>
        <HBarList items={g.regions} color="#f97316" emptyText="Nessuna regione rilevata." />
      </div>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Città (approssimata)</p>
        <HBarList items={g.cities} color="#fb7185" emptyText="Nessuna città rilevata." max={20} />
      </div>
    </div>
  );
}

export function SourcesSection({ data }) {
  return (
    <div style={analyticsPanelStyle}>
      <p style={analyticsHeadingStyle}>Sorgenti di traffico (visitatori)</p>
      <HBarList
        items={data.sources.map((s) => ({ key: s.source, label: `${s.label} · ${s.type}`, count: s.visitors, pct: s.pct }))}
        color="#818cf8"
        max={20}
        emptyText="Nessuna sorgente classificata."
      />
      <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 8 }}>
        UTM prevale sul referrer. `direct` = nessun referrer. Google/Bing = organic; Instagram/Facebook/WhatsApp/… = social; altri host = referral.
      </p>
    </div>
  );
}

export function PagesSection({ data }) {
  return (
    <div style={analyticsPanelStyle}>
      <p style={analyticsHeadingStyle}>Pagine più viste</p>
      <HBarList items={data.pages} color="#2dd4bf" unit="" max={25} emptyText="Nessuna pagina registrata." />
    </div>
  );
}

export function FunnelSection({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Funnel preventivo (sessioni distinte)</p>
        <FunnelChart stages={data.funnel} />
      </div>
      <div style={analyticsPanelStyle}>
        <p style={analyticsHeadingStyle}>Drop-off per step</p>
        <HBarList
          items={data.funnel.slice(1).map((s) => ({ key: s.key, label: s.label, count: s.dropoffPct, pct: s.dropoffPct }))}
          color="#f87171"
          unit="%"
          emptyText="Funnel vuoto nel periodo."
        />
      </div>
    </div>
  );
}

export function CommercialDemandSection({ data }) {
  const c = data.commercial;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <KpiTile label="Quantità mediana richiesta" value={c.quantityMedianBucket || '—'} />
        <KpiTile label="Comuni distinti cercati" value={fmt(c.municipalities.length)} />
        <KpiTile label="Servizio più richiesto" value={c.services[0]?.label || '—'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Comuni cercati</p>
          <HBarList items={c.municipalities} color="#60a5fa" max={20} emptyText="Nessun comune cercato nel periodo." />
        </div>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Province cercate</p>
          <HBarList items={c.provinces} color="#38bdf8" max={20} emptyText="Nessuna provincia." />
        </div>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Fascia quantità</p>
          <HBarList items={c.quantityBuckets} color="#a78bfa" emptyText="Nessuna quantità selezionata." />
        </div>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Servizi richiesti</p>
          <HBarList items={c.services} color="#34d399" emptyText="Nessun servizio selezionato." />
        </div>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Extra richiesti</p>
          <HBarList items={c.extras} color="#fbbf24" emptyText="Nessun extra selezionato." />
        </div>
        <div style={analyticsPanelStyle}>
          <p style={analyticsHeadingStyle}>Conversione per comune</p>
          {c.conversionByMunicipality.length === 0 ? (
            <Empty text="Nessun dato di conversione per comune." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              {c.conversionByMunicipality.map((m) => (
                <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', gap: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,.82)' }}>{m.name}</span>
                  <span style={{ color: 'rgba(255,255,255,.45)', textAlign: 'right' }}>{m.started} avv.</span>
                  <span style={{ color: 'rgba(255,255,255,.45)', textAlign: 'right' }}>{m.completed} compl.</span>
                  <span style={{ color: m.rate >= 20 ? '#4ade80' : 'rgba(255,255,255,.7)', textAlign: 'right', fontWeight: 800 }}>{m.rate}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
