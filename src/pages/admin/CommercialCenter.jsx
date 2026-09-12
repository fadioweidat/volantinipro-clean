import React, { useEffect, useMemo, useState } from 'react';
import { getRealCampaigns, getSiteTraffic, getConsultationRequests } from '../../lib/services/admin-api.js';
import { buildCommercialSnapshot, buildConsultationWhatsAppMessage } from '../../lib/admin/adminCommercialModel.js';
import { computeSiteTrafficSummary } from '../../lib/analytics/siteTrafficSummary.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

function localDateKey(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function formatPct(value) { return value == null ? '—' : `${Math.round(value * 100)}%`; }

export function CommercialCenter({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, campaigns: [], availability: { campaigns: false } });
  const [traffic, setTraffic] = useState({ loading: true, available: false, rows: [] });
  const [consultations, setConsultations] = useState({ loading: true, available: false, rows: [] });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getRealCampaigns({ includeTest: true });
        if (!cancelled) setState({ loading: false, error: null, campaigns: result.allRows, availability: result.availability });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: error?.message || 'Errore caricamento commerciale.', campaigns: [], availability: { campaigns: false } });
      }
    }
    async function loadTraffic() {
      try {
        const result = await getSiteTraffic();
        if (!cancelled) setTraffic({ loading: false, available: result.available, rows: result.rows });
      } catch {
        if (!cancelled) setTraffic({ loading: false, available: false, rows: [] });
      }
    }
    async function loadConsultations() {
      try {
        const result = await getConsultationRequests({ limit: 20 });
        if (!cancelled) setConsultations({ loading: false, available: result.available, rows: result.rows });
      } catch {
        if (!cancelled) setConsultations({ loading: false, available: false, rows: [] });
      }
    }
    load();
    loadTraffic();
    loadConsultations();
    return () => { cancelled = true; };
  }, []);

  const commercial = useMemo(() => buildCommercialSnapshot({ campaigns: state.campaigns, today: localDateKey(new Date()) }), [state.campaigns]);
  const trafficSummary = useMemo(() => computeSiteTrafficSummary(traffic.rows), [traffic.rows]);
  const trafficConfigured = traffic.available && trafficSummary.hasAnyData;
  const trafficMetrics = [
    { label: 'Visitatori oggi', value: trafficSummary.visitorsToday },
    { label: 'Sessioni oggi', value: trafficSummary.sessionsToday },
    { label: 'Preventivi iniziati', value: trafficSummary.quotesStartedToday },
    { label: 'Preventivi completati', value: trafficSummary.quotesCompletedToday },
    { label: 'Richieste consulenza', value: trafficSummary.consultationRequestsToday },
    { label: 'Conversioni', value: formatPct(trafficSummary.conversionRate) },
  ];

  function contactQuoteWhatsApp(quote) {
    if (!quote.phone) { setNotice('Numero WhatsApp non disponibile per questo preventivo.'); return; }
    const text = buildConsultationWhatsAppMessage({ name: quote.name, zone: quote.zone });
    window.open(`https://wa.me/${quote.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setNotice('Bozza WhatsApp preparata. Il preventivo non viene segnato come contattato finché non esiste un evento reale.');
  }

  function contactQuoteEmail(quote) {
    if (!quote.email) { setNotice('Email non disponibile per questo preventivo.'); return; }
    const subject = encodeURIComponent(`Preventivo VolantiniPro · ${quote.zone}`);
    const body = encodeURIComponent(`Buongiorno ${quote.name},\n\nho ricevuto la sua richiesta per la distribuzione volantini a ${quote.zone}.\n\nQuando possiamo sentirci?`);
    window.location.href = `mailto:${quote.email}?subject=${subject}&body=${body}`;
    setNotice('Bozza email aperta. Nessuna email è stata registrata come inviata.');
  }

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Commerciale' }];

  return (
    <AdminLayout onNav={onNav} title="Commerciale" subtitle="Preventivi rapidi, consulenze e traffico sito." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento dati commerciali reali...</p>}
      {state.error && <Notice danger>{state.error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <section id="commerciale" className="admin-home__section" aria-labelledby="commercial-title">
        <SectionHeading id="commercial-title" eyebrow="Commerciale" title="Preventivi rapidi" meta={`${commercial.quotes.length} richieste reali`} />
        <div className="admin-home__commercial-metrics" aria-label="Riepilogo preventivi rapidi">
          <Metric label="Nuovi oggi" value={commercial.metrics.newToday} tone="blue" />
          <Metric label="Da contattare" value={commercial.metrics.toContact} tone="yellow" />
          <Metric label="Convertiti" value={commercial.metrics.converted} tone="green" />
          <Metric label="Chiusi" value={commercial.metrics.closed} tone="red" />
        </div>
        {commercial.latest.length === 0 ? <EmptyState text={state.availability.campaigns ? 'Nessun preventivo rapido reale disponibile.' : 'Fonte preventivi non disponibile.'} /> : (
          <div className="admin-home__lead-list">
            {commercial.latest.map((quote) => (
              <article key={quote.id}>
                <div className="admin-home__lead-main">
                  <div><strong>{quote.name}</strong><span>{quote.zone} · {quote.quantity != null ? `${quote.quantity.toLocaleString('it-IT')} volantini` : 'Quantità non disponibile'}</span></div>
                  <span className={`admin-home__lead-state admin-home__lead-state--${quote.state.key}`}>{quote.state.label}</span>
                </div>
                <div className="admin-home__lead-actions">
                  <a href={`/admin/campaigns/${quote.campaignId}/operations`}>Apri campagna</a>
                  {quote.phone && <a href={`tel:${quote.phone}`}>Chiama</a>}
                  <button type="button" onClick={() => contactQuoteWhatsApp(quote)}>WhatsApp</button>
                  <button type="button" onClick={() => contactQuoteEmail(quote)}>Email</button>
                </div>
                <details className="admin-home__access"><summary>Accessi cliente</summary><div><span>Area Cliente <b>{quote.access.customerArea.label}</b></span><span>Tracking <b>{quote.access.tracking.label}</b></span><span>Report <b>{quote.access.report.label}</b></span><span>Foto <b>{quote.access.photos.label}</b></span></div></details>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Richieste consulenza (form pubblico "Parla con un consulente") ── */}
      <section id="consulenze" className="admin-home__section" aria-labelledby="consultation-title">
        <SectionHeading
          id="consultation-title"
          eyebrow="Consulenza sito"
          title="Richieste consulenza"
          meta={consultations.available ? `${consultations.rows.length} richieste` : (consultations.loading ? 'Caricamento...' : 'Non disponibile')}
        />
        {consultations.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento richieste consulenza...</p>}
        {!consultations.loading && !consultations.available && (
          <div className="admin-home__source-note">
            <strong>Tabella non disponibile</strong>
            <span>La tabella consultation_requests non è raggiungibile. Verifica che la migration sia applicata e che l'admin abbia i permessi RLS corretti.</span>
          </div>
        )}
        {!consultations.loading && consultations.available && consultations.rows.length === 0 && (
          <EmptyState text="Nessuna richiesta consulenza ancora. Il form pubblico 'Parla con un consulente' invierà le richieste qui." />
        )}
        {!consultations.loading && consultations.available && consultations.rows.length > 0 && (
          <div className="admin-home__lead-list">
            {consultations.rows.map((req) => (
              <ConsultationLead key={req.id} req={req} />
            ))}
          </div>
        )}
        {!consultations.loading && consultations.available && (
          <div className="admin-home__source-note">
            <strong>Fonte: consultation_requests</strong>
            <span>Richieste reali dal form pubblico "Parla con un consulente" (source: Consulenza sito). Ultime 20, ordinate per data.</span>
          </div>
        )}
      </section>

      <section id="traffico" className="admin-home__section" aria-labelledby="traffic-title">
        <SectionHeading id="traffic-title" eyebrow="Traffico" title="Traffico sito" meta={trafficConfigured ? 'Event store privacy-safe (site_events)' : 'Analytics non configurata'} />
        <div className="admin-home__traffic-grid">
          {trafficMetrics.map(({ label, value }) => <article key={label}><strong>{trafficConfigured ? value : '—'}</strong><span>{label}</span></article>)}
        </div>
        {trafficConfigured ? (
          <div className="admin-home__source-note"><strong>Fonte: site_events</strong><span>Dati reali di oggi, aggregati da eventi anonimi (page_view, session_started, quote_started, quote_completed, consultation_requested). Nessuna stima dai record commerciali.</span></div>
        ) : (
          <div className="admin-home__source-note"><strong>Dati non disponibili</strong><span>{traffic.loading ? 'Caricamento dati traffico...' : 'Nessun evento registrato ancora. Visitatori, sessioni, funnel e conversioni restano distinti e non vengono stimati dai record commerciali.'}</span></div>
        )}
      </section>
    </AdminLayout>
  );
}

const SERVIZIO_LABEL = { d2d: 'Door to Door', h2h: 'Hand to Hand', b2b: 'Business Distribution' };
const TIMING_LABEL = { asap: 'Prima possibile', '1week': 'Entro 1 settimana', '2weeks': 'Entro 2 settimane', '1month': 'Entro 1 mese', custom: 'Data specifica' };
const STATUS_COLORS = { new: '#60A5FA', contacted: '#FBBF24', converted: '#2ECC8A', closed: '#64748B' };

function ConsultationLead({ req }) {
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
  };
  const servLabel = SERVIZIO_LABEL[req.servizio] || req.servizio || '—';
  const timingLabel = req.timing === 'custom' && req.custom_date
    ? `Data: ${req.custom_date}`
    : (TIMING_LABEL[req.timing] || req.timing || '—');
  const statusColor = STATUS_COLORS[req.status] || '#64748B';

  return (
    <article style={{ borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', marginBottom: 10 }}>
      <div className="admin-home__lead-main">
        <div>
          <strong>{req.nome}</strong>
          <span>{req.comune} · {servLabel} · {(req.quantita || 0).toLocaleString('it-IT')} volantini</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {req.status || 'new'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>
        {req.telefono && <span>📞 {req.telefono}</span>}
        {req.email && <span>✉️ {req.email}</span>}
        <span>🗓 {timingLabel}</span>
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.3)' }}>Consulenza sito · {fmtDate(req.created_at)}</span>
      </div>
      {req.messaggio && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.4)', fontStyle: 'italic', borderLeft: '2px solid rgba(255,255,255,.08)', paddingLeft: 10 }}>
          "{req.messaggio.slice(0, 200)}{req.messaggio.length > 200 ? '…' : ''}"
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {req.telefono && (
          <a href={`tel:${req.telefono}`} style={{ fontSize: 12, color: '#60A5FA', textDecoration: 'none' }}>Chiama</a>
        )}
        {req.telefono && (
          <a
            href={`https://wa.me/${req.telefono.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(`Ciao ${req.nome}, abbiamo ricevuto la sua richiesta per la distribuzione volantini a ${req.comune}. Quando possiamo sentirci?`)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#2ECC8A', textDecoration: 'none' }}
          >WhatsApp</a>
        )}
        {req.email && (
          <a
            href={`mailto:${req.email}?subject=${encodeURIComponent(`Richiesta consulenza VolantiniPro · ${req.comune}`)}&body=${encodeURIComponent(`Buongiorno ${req.nome},\n\nho ricevuto la sua richiesta di consulenza per la distribuzione volantini a ${req.comune}.\n\nQuando possiamo sentirci?\n\nIl team VolantiniPro`)}`}
            style={{ fontSize: 12, color: '#A78BFA', textDecoration: 'none' }}
          >Email</a>
        )}
      </div>
    </article>
  );
}

function SectionHeading({ id, eyebrow, title, meta }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div></header>; }
function EmptyState({ text }) { return <div className="admin-home__empty"><p>{text}</p></div>; }
function Metric({ label, value, tone }) { return <article className={`admin-home__metric admin-home__metric--${tone}`}><strong>{value}</strong><span>{label}</span></article>; }
function Notice({ children, danger = false }) { return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} role={danger ? 'alert' : 'status'}>{children}</div>; }
